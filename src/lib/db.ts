import "server-only";

import { Pool } from "pg";

type Thought = {
  id: number;
  title: string;
  category: string;
  excerpt: string;
  user_id: number | null;
  created_at: Date;
};

type User = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: Date;
};

type NewThought = {
  title: string;
  category: string;
  excerpt: string;
  userId: number;
};

type NewUser = {
  name: string;
  email: string;
  passwordHash: string;
};

type ThoughtsResult = {
  databaseAvailable: boolean;
  thoughts: Thought[];
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const globalForDb = globalThis as typeof globalThis & {
  thoughtsPool?: Pool;
};

const pool =
  globalForDb.thoughtsPool ??
  new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.thoughtsPool = pool;
}

const seedThoughts = [
  {
    title: "Small Rituals",
    category: "Morning note",
    excerpt:
      "A cup of tea, ten quiet minutes, and a single sentence can set the tone for an entire day.",
  },
  {
    title: "City Fragments",
    category: "Observation",
    excerpt:
      "Every street has its own rhythm. Some rush, some linger, and some feel like a memory you walked into.",
  },
  {
    title: "Unfinished Ideas",
    category: "Draft",
    excerpt:
      "Not every thought needs a conclusion. Some are more useful when they stay open and keep pulling you back.",
  },
];

let initialized = false;

function getFallbackThoughts(): Thought[] {
  const now = new Date();

  return seedThoughts.map((thought, index) => ({
    id: -(index + 1),
    title: thought.title,
    category: thought.category,
    excerpt: thought.excerpt,
    user_id: null,
    created_at: new Date(now.getTime() - index * 60_000),
  }));
}

async function initializeThoughtsTable() {
  if (initialized) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS thoughts (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
  `);

  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM thoughts",
  );

  if (rows[0]?.count === "0") {
    for (const thought of seedThoughts) {
      await pool.query(
        `
          INSERT INTO thoughts (title, category, excerpt)
          VALUES ($1, $2, $3)
        `,
        [thought.title, thought.category, thought.excerpt],
      );
    }
  }

  initialized = true;
}

export async function getThoughts(): Promise<ThoughtsResult> {
  try {
    await initializeThoughtsTable();

    const { rows } = await pool.query<Thought>(
      `
        SELECT id, title, category, excerpt, user_id, created_at
        FROM thoughts
        ORDER BY created_at DESC, id DESC
        LIMIT 12
      `,
    );

    return {
      databaseAvailable: true,
      thoughts: rows,
    };
  } catch (error) {
    console.error("Failed to load thoughts from the database.", error);

    return {
      databaseAvailable: false,
      thoughts: getFallbackThoughts(),
    };
  }
}

export async function createThought(input: NewThought) {
  await initializeThoughtsTable();

  await pool.query(
    `
      INSERT INTO thoughts (title, category, excerpt, user_id)
      VALUES ($1, $2, $3, $4)
    `,
    [input.title, input.category, input.excerpt, input.userId],
  );
}

export async function getThoughtsByUser(userId: number) {
  await initializeThoughtsTable();

  const { rows } = await pool.query<Thought>(
    `
      SELECT id, title, category, excerpt, user_id, created_at
      FROM thoughts
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 24
    `,
    [userId],
  );

  return rows;
}

export async function createUser(input: NewUser) {
  await initializeThoughtsTable();

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
  await initializeThoughtsTable();

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
  await initializeThoughtsTable();

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
