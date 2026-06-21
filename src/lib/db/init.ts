import { pool } from "@/lib/db/client";

export const seedThoughts = [
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
let initializationPromise: Promise<void> | null = null;

export async function ensureInitialized() {
  if (initialized) {
    return;
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
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

      await pool.query(`
        CREATE TABLE IF NOT EXISTS recurring_tasks (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          priority TEXT NOT NULL DEFAULT 'medium',
          tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          note TEXT NOT NULL DEFAULT '',
          is_active BOOLEAN NOT NULL DEFAULT true,
          days_of_week TEXT[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[],
          start_date DATE NOT NULL DEFAULT CURRENT_DATE,
          end_date DATE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (priority IN ('low', 'medium', 'high'))
        )
      `);

      await pool.query(`
        ALTER TABLE recurring_tasks
        ADD COLUMN IF NOT EXISTS days_of_week TEXT[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun']::TEXT[]
      `);

      await pool.query(`
        ALTER TABLE recurring_tasks
        ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE
      `);

      await pool.query(`
        ALTER TABLE recurring_tasks
        ADD COLUMN IF NOT EXISTS end_date DATE
      `);

      await pool.query(`
        ALTER TABLE daily_tasks
        ADD COLUMN IF NOT EXISTS recurring_task_id BIGINT REFERENCES recurring_tasks(id) ON DELETE SET NULL
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS recurring_tasks_user_idx
        ON recurring_tasks (user_id, is_active)
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS daily_tasks_recurring_instance_idx
        ON daily_tasks (user_id, recurring_task_id, scheduled_date)
        WHERE recurring_task_id IS NOT NULL
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
    })()
      .finally(() => {
        initializationPromise = null;
      });
  }

  await initializationPromise;
}
