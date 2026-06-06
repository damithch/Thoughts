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

export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";
export type TaskPriority = "low" | "medium" | "high";

export type TaskItem = {
  id: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  note: string;
  scheduled_date: string;
  user_id: number;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
};

export type DayRecord = {
  id: number;
  user_id: number;
  entry_date: string;
  intention: string;
  note: string;
  end_of_day_mood: number | null;
  created_at: Date;
  updated_at: Date;
};

export type CheckInEnergy = "low" | "steady" | "high";
export type CheckInFocus = "scattered" | "okay" | "locked_in";

export type DailyCheckIn = {
  id: number;
  user_id: number;
  entry_date: string;
  mood: number;
  energy: CheckInEnergy;
  focus: CheckInFocus;
  note: string;
  created_at: Date;
};

type NewTask = {
  title: string;
  priority: TaskPriority;
  tags: string[];
  note: string;
  scheduledDate: string;
  userId: number;
};

type UpdateTaskStatusInput = {
  id: number;
  status: TaskStatus;
  userId: number;
};

type UpsertDayRecordInput = {
  entryDate: string;
  intention: string;
  note: string;
  endOfDayMood: number | null;
  userId: number;
};

type NewDailyCheckIn = {
  entryDate: string;
  mood: number;
  energy: CheckInEnergy;
  focus: CheckInFocus;
  note: string;
  userId: number;
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_tasks (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      note TEXT NOT NULL DEFAULT '',
      scheduled_date DATE NOT NULL,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (status IN ('todo', 'in_progress', 'done', 'skipped')),
      CHECK (priority IN ('low', 'medium', 'high'))
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_task_notes (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_date DATE NOT NULL,
      intention TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      end_of_day_mood INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, entry_date),
      CHECK (end_of_day_mood IS NULL OR (end_of_day_mood >= 1 AND end_of_day_mood <= 10))
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS daily_tasks_user_date_idx
    ON daily_tasks (user_id, scheduled_date)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS daily_tasks_user_status_idx
    ON daily_tasks (user_id, status)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_check_ins (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_date DATE NOT NULL,
      mood INTEGER NOT NULL,
      energy TEXT NOT NULL,
      focus TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (mood >= 1 AND mood <= 10),
      CHECK (energy IN ('low', 'steady', 'high')),
      CHECK (focus IN ('scattered', 'okay', 'locked_in'))
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS daily_check_ins_user_date_idx
    ON daily_check_ins (user_id, entry_date, created_at)
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

export async function getTasksByUserAndDate(userId: number, date: string) {
  await initializeThoughtsTable();

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             user_id, created_at, updated_at, started_at, completed_at
      FROM daily_tasks
      WHERE user_id = $1
        AND scheduled_date = $2::date
      ORDER BY
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        created_at ASC,
        id ASC
    `,
    [userId, date],
  );

  return rows;
}

export async function getOpenTaskCountBeforeDate(userId: number, date: string) {
  await initializeThoughtsTable();

  const { rows } = await pool.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM daily_tasks
      WHERE user_id = $1
        AND scheduled_date < $2::date
        AND status IN ('todo', 'in_progress')
    `,
    [userId, date],
  );

  return Number(rows[0]?.total ?? "0");
}

export async function getDayRecordByUserAndDate(userId: number, date: string) {
  await initializeThoughtsTable();

  const { rows } = await pool.query<DayRecord>(
    `
      SELECT id, user_id,
             TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
             intention, note, end_of_day_mood,
             created_at, updated_at
      FROM daily_task_notes
      WHERE user_id = $1
        AND entry_date = $2::date
      LIMIT 1
    `,
    [userId, date],
  );

  return rows[0] ?? null;
}

export async function createTask(input: NewTask) {
  await initializeThoughtsTable();

  await pool.query(
    `
      INSERT INTO daily_tasks (
        user_id, title, status, priority, tags, note, scheduled_date
      )
      VALUES ($1, $2, 'todo', $3, $4, $5, $6::date)
    `,
    [input.userId, input.title, input.priority, input.tags, input.note, input.scheduledDate],
  );
}

export async function updateTaskStatus(input: UpdateTaskStatusInput) {
  await initializeThoughtsTable();

  const { rowCount } = await pool.query(
    `
      UPDATE daily_tasks
      SET status = $1,
          started_at = CASE
            WHEN $1 = 'in_progress' AND started_at IS NULL THEN NOW()
            WHEN $1 = 'todo' THEN NULL
            ELSE started_at
          END,
          completed_at = CASE
            WHEN $1 IN ('done', 'skipped') THEN NOW()
            ELSE NULL
          END,
          updated_at = NOW()
      WHERE id = $2
        AND user_id = $3
    `,
    [input.status, input.id, input.userId],
  );

  return rowCount === 1;
}

export async function upsertDayRecord(input: UpsertDayRecordInput) {
  await initializeThoughtsTable();

  await pool.query(
    `
      INSERT INTO daily_task_notes (
        user_id, entry_date, intention, note, end_of_day_mood, updated_at
      )
      VALUES ($1, $2::date, $3, $4, $5, NOW())
      ON CONFLICT (user_id, entry_date)
      DO UPDATE SET
        intention = EXCLUDED.intention,
        note = EXCLUDED.note,
        end_of_day_mood = EXCLUDED.end_of_day_mood,
        updated_at = NOW()
    `,
    [input.userId, input.entryDate, input.intention, input.note, input.endOfDayMood],
  );
}

export async function moveOpenTasksToDate(userId: number, fromDate: string, toDate: string) {
  await initializeThoughtsTable();

  const { rowCount } = await pool.query(
    `
      UPDATE daily_tasks
      SET scheduled_date = $3::date,
          status = 'todo',
          started_at = NULL,
          completed_at = NULL,
          updated_at = NOW()
      WHERE user_id = $1
        AND scheduled_date = $2::date
        AND status IN ('todo', 'in_progress')
    `,
    [userId, fromDate, toDate],
  );

  return rowCount ?? 0;
}

export async function createDailyCheckIn(input: NewDailyCheckIn) {
  await initializeThoughtsTable();

  await pool.query(
    `
      INSERT INTO daily_check_ins (
        user_id, entry_date, mood, energy, focus, note
      )
      VALUES ($1, $2::date, $3, $4, $5, $6)
    `,
    [input.userId, input.entryDate, input.mood, input.energy, input.focus, input.note],
  );
}

export async function getDailyCheckInsByUserAndDate(userId: number, date: string) {
  await initializeThoughtsTable();

  const { rows } = await pool.query<DailyCheckIn>(
    `
      SELECT id, user_id,
             TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
             mood, energy, focus, note, created_at
      FROM daily_check_ins
      WHERE user_id = $1
        AND entry_date = $2::date
      ORDER BY created_at ASC, id ASC
    `,
    [userId, date],
  );

  return rows;
}
