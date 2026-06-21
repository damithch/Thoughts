import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type { NewUser, User } from "@/lib/db/types";

export async function createUser(input: NewUser) {
  await ensureInitialized();

  const { rows } = await pool.query<User>(
    `
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, password_hash, created_at
    `,
    [input.name, input.email.toLowerCase(), input.passwordHash],
  );

  return rows[0] ?? null;
}

export async function getUserByEmail(email: string) {
  await ensureInitialized();

  const { rows } = await pool.query<User>(
    `
      SELECT id, name, email, password_hash, created_at
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email.toLowerCase()],
  );

  return rows[0] ?? null;
}

export async function getUserById(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<Pick<User, "id" | "name" | "email" | "created_at">>(
    `
      SELECT id, name, email, created_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] ?? null;
}
