import "server-only";

import { Pool } from "pg";

type Thought = {
  id: number;
  title: string;
  category: string;
  mood: number;
  tags: string[];
  summary: string;
  body: string;
  user_id: number | null;
  created_at: Date;
  updated_at: Date;
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
  mood: number;
  tags: string[];
  summary: string;
  body: string;
  userId: number;
};

type UpdateThought = {
  id: number;
  title: string;
  category: string;
  mood: number;
  tags: string[];
  summary: string;
  body: string;
  userId: number;
};

type DeleteThought = {
  id: number;
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

type ThoughtActivityDay = {
  date: string;
  total: number;
  average_mood: number;
};

function normalizeDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode");

  // pg warns that legacy sslmode aliases will change meaning in the next major release.
  // Normalize them now so local dev and production use the stricter current behavior.
  if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

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
    connectionString: normalizeDatabaseUrl(connectionString),
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
    mood: 7,
    tags: ["morning", "routine", "calm"],
    summary:
      "A cup of tea, ten quiet minutes, and a single sentence can set the tone for an entire day.",
    body:
      "Today felt steady from the beginning. The quiet start mattered more than the task list. I want to keep protecting that first calm pocket of the morning because it seems to shape everything after it.",
  },
  {
    title: "City Fragments",
    category: "Observation",
    mood: 6,
    tags: ["walk", "city", "reflection"],
    summary:
      "Every street has its own rhythm. Some rush, some linger, and some feel like a memory you walked into.",
    body:
      "The walk made me notice how quickly my attention shifts when I stop trying to document everything. There was one corner that felt familiar for no obvious reason, and I kept thinking about how places can hold emotional residue.",
  },
  {
    title: "Unfinished Ideas",
    category: "Draft",
    mood: 5,
    tags: ["draft", "ideas", "thinking"],
    summary:
      "Not every thought needs a conclusion. Some are more useful when they stay open and keep pulling you back.",
    body:
      "I usually rush to turn an idea into a final position, but this one probably needs to remain unresolved a little longer. The uncertainty might be part of what makes it worth returning to.",
  },
];

let initialized = false;

function getFallbackThoughts(): Thought[] {
  const now = new Date();

  return seedThoughts.map((thought, index) => ({
    id: -(index + 1),
    title: thought.title,
    category: thought.category,
    mood: thought.mood,
    tags: thought.tags,
    summary: thought.summary,
    body: thought.body,
    user_id: null,
    created_at: new Date(now.getTime() - index * 60_000),
    updated_at: new Date(now.getTime() - index * 60_000),
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
      mood INTEGER NOT NULL DEFAULT 5,
      tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      excerpt TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
  `);

  await pool.query(`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS mood INTEGER NOT NULL DEFAULT 5
  `);

  await pool.query(`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `);

  await pool.query(`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT ''
  `);

  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM thoughts",
  );

  if (rows[0]?.count === "0") {
    for (const thought of seedThoughts) {
      await pool.query(
        `
          INSERT INTO thoughts (title, category, mood, tags, excerpt, body)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [thought.title, thought.category, thought.mood, thought.tags, thought.summary, thought.body],
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
        SELECT id, title, category, excerpt AS summary, body, user_id, created_at
             , updated_at, mood, tags
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
      INSERT INTO thoughts (title, category, mood, tags, excerpt, body, user_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `,
    [input.title, input.category, input.mood, input.tags, input.summary, input.body, input.userId],
  );
}

export async function getThoughtsByUser(userId: number) {
  await initializeThoughtsTable();

  const { rows } = await pool.query<Thought>(
    `
      SELECT id, title, category, excerpt AS summary, body, user_id, created_at
           , updated_at, mood, tags
      FROM thoughts
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 24
    `,
    [userId],
  );

  return rows;
}

export async function getThoughtByIdForUser(thoughtId: number, userId: number) {
  await initializeThoughtsTable();

  const { rows } = await pool.query<Thought>(
    `
      SELECT id, title, category, excerpt AS summary, body, user_id, created_at
           , updated_at, mood, tags
      FROM thoughts
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [thoughtId, userId],
  );

  return rows[0] ?? null;
}

export async function getThoughtsByUserAndDate(userId: number, date: string) {
  await initializeThoughtsTable();

  const { rows } = await pool.query<Thought>(
    `
      SELECT id, title, category, excerpt AS summary, body, user_id, created_at
           , updated_at, mood, tags
      FROM thoughts
      WHERE user_id = $1
        AND (created_at AT TIME ZONE 'Asia/Colombo')::date = $2::date
      ORDER BY created_at ASC, id ASC
    `,
    [userId, date],
  );

  return rows;
}

export async function getThoughtActivityByUserMonth(userId: number, month: string) {
  await initializeThoughtsTable();

  const { rows } = await pool.query<ThoughtActivityDay>(
    `
      SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS total,
             ROUND(AVG(mood)::numeric, 1)::float8 AS average_mood
      FROM thoughts
      WHERE user_id = $1
        AND TO_CHAR(created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM') = $2
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    [userId, month],
  );

  return rows;
}

export async function updateThought(input: UpdateThought) {
  await initializeThoughtsTable();

  const { rowCount } = await pool.query(
    `
      UPDATE thoughts
      SET title = $1,
          category = $2,
          mood = $3,
          tags = $4,
          excerpt = $5,
          body = $6,
          updated_at = NOW()
      WHERE id = $7
        AND user_id = $8
    `,
    [
      input.title,
      input.category,
      input.mood,
      input.tags,
      input.summary,
      input.body,
      input.id,
      input.userId,
    ],
  );

  return rowCount === 1;
}

export async function deleteThought(input: DeleteThought) {
  await initializeThoughtsTable();

  const { rowCount } = await pool.query(
    `
      DELETE FROM thoughts
      WHERE id = $1
        AND user_id = $2
    `,
    [input.id, input.userId],
  );

  return rowCount === 1;
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
