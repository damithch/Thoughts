import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";

// A token belongs to one phone; registering it again (e.g. after signing in as someone else)
// moves it to the current user.
export async function registerPushDevice(userId: number, token: string, platform: string) {
  await ensureInitialized();

  await pool.query(
    `
      INSERT INTO push_devices (user_id, token, platform)
      VALUES ($1, $2, $3)
      ON CONFLICT (token) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_seen_at = NOW()
    `,
    [userId, token, platform],
  );
}

export async function removePushDevice(userId: number, token: string) {
  await ensureInitialized();

  const { rowCount } = await pool.query(`DELETE FROM push_devices WHERE user_id = $1 AND token = $2`, [userId, token]);

  return rowCount === 1;
}

// Used when Firebase reports a token as no longer valid.
export async function forgetPushToken(token: string) {
  await ensureInitialized();
  await pool.query(`DELETE FROM push_devices WHERE token = $1`, [token]);
}

export async function getPushTokens(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<{ token: string }>(
    `SELECT token FROM push_devices WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 5`,
    [userId],
  );

  return rows.map((row) => row.token);
}
