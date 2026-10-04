import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type { PasswordResetToken } from "@/lib/db/types";

export async function createPasswordResetToken(input: {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}) {
  await ensureInitialized();

  await pool.query(
    `
      UPDATE password_reset_tokens
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE user_id = $1
      AND used_at IS NULL
      AND revoked_at IS NULL
    `,
    [input.userId],
  );

  const { rows } = await pool.query<PasswordResetToken>(
    `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, token_hash, expires_at, used_at, revoked_at, created_at, updated_at
    `,
    [input.userId, input.tokenHash, input.expiresAt],
  );

  return rows[0] ?? null;
}

export async function consumePasswordResetToken(input: {
  tokenHash: string;
  passwordHash: string;
}) {
  await ensureInitialized();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query<PasswordResetToken>(
      `
        SELECT id, user_id, token_hash, expires_at, used_at, revoked_at, created_at, updated_at
        FROM password_reset_tokens
        WHERE token_hash = $1
        LIMIT 1
        FOR UPDATE
      `,
      [input.tokenHash],
    );

    const record = rows[0] ?? null;

    if (!record) {
      await client.query("ROLLBACK");
      return { success: false as const, reason: "invalid" as const };
    }

    const now = new Date();

    if (record.used_at || record.revoked_at) {
      await client.query("ROLLBACK");
      return { success: false as const, reason: "already_used" as const };
    }

    if (record.expires_at <= now) {
      await client.query("ROLLBACK");
      return { success: false as const, reason: "expired" as const };
    }

    await client.query(
      `
        UPDATE users
        SET password_hash = $1, password_updated_at = NOW()
        WHERE id = $2
      `,
      [input.passwordHash, record.user_id],
    );

    await client.query(
      `
        UPDATE password_reset_tokens
        SET used_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `,
      [record.id],
    );

    await client.query(
      `
        UPDATE password_reset_tokens
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE user_id = $1
        AND id <> $2
        AND used_at IS NULL
        AND revoked_at IS NULL
      `,
      [record.user_id, record.id],
    );

    await client.query("COMMIT");

    return { success: true as const, userId: record.user_id };
  } catch {
    await client.query("ROLLBACK");
    return { success: false as const, reason: "failed" as const };
  } finally {
    client.release();
  }
}
