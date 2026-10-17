import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import { generateDailyTasksFromRecurring } from "@/lib/db/tasks";
import type { SupportDay } from "@/lib/db/types";

const DAY_COLUMNS = `
  TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
  ate, slept, connected, steps_tried, breathing_seconds, dismissed_at
`;

function emptyDay(date: string): SupportDay {
  return {
    entry_date: date,
    ate: null,
    slept: null,
    connected: null,
    steps_tried: [],
    breathing_seconds: 0,
    dismissed_at: null,
  };
}

// The newest mood readings from thoughts (hidden ones included: they're still how the day felt)
// and check-ins, newest first.
export async function getRecentMoodEntries(userId: number, limit = 6) {
  await ensureInitialized();

  const { rows } = await pool.query<{ mood: number; created_at: Date }>(
    `
      SELECT mood, created_at FROM (
        SELECT mood, created_at FROM thoughts WHERE user_id = $1
        UNION ALL
        SELECT mood, created_at FROM daily_check_ins WHERE user_id = $1
      ) entries
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, limit],
  );

  return rows;
}

export async function getSupportDay(userId: number, date: string): Promise<SupportDay> {
  await ensureInitialized();

  const { rows } = await pool.query<SupportDay>(
    `SELECT ${DAY_COLUMNS} FROM support_days WHERE user_id = $1 AND entry_date = $2::date`,
    [userId, date],
  );

  return rows[0] ?? emptyDay(date);
}

// Last time "I'm okay for now" was tapped, looking back over today and yesterday so a rough
// patch that crossed midnight stays dismissed.
export async function getLatestSupportDismissal(userId: number, today: string) {
  await ensureInitialized();

  const { rows } = await pool.query<{ dismissed_at: Date | null }>(
    `
      SELECT MAX(dismissed_at) AS dismissed_at
      FROM support_days
      WHERE user_id = $1 AND entry_date >= $2::date - 1
    `,
    [userId, today],
  );

  return rows[0]?.dismissed_at ?? null;
}

export type SupportDayUpdate = {
  ate?: boolean | null;
  slept?: boolean | null;
  connected?: boolean | null;
  stepsTried?: string[];
  dismiss?: boolean;
};

// Changes only the fields given; creates the day's row on first use.
export async function updateSupportDay(userId: number, date: string, update: SupportDayUpdate) {
  await ensureInitialized();

  const has = (key: keyof SupportDayUpdate) => update[key] !== undefined;

  const { rows } = await pool.query<SupportDay>(
    `
      INSERT INTO support_days (user_id, entry_date, ate, slept, connected, steps_tried, dismissed_at, updated_at)
      VALUES ($1, $2::date, $4, $6, $8, COALESCE($10::text[], '{}'), CASE WHEN $11 THEN NOW() END, NOW())
      ON CONFLICT (user_id, entry_date) DO UPDATE SET
        ate = CASE WHEN $3 THEN EXCLUDED.ate ELSE support_days.ate END,
        slept = CASE WHEN $5 THEN EXCLUDED.slept ELSE support_days.slept END,
        connected = CASE WHEN $7 THEN EXCLUDED.connected ELSE support_days.connected END,
        steps_tried = CASE WHEN $9 THEN EXCLUDED.steps_tried ELSE support_days.steps_tried END,
        dismissed_at = CASE WHEN $11 THEN NOW() ELSE support_days.dismissed_at END,
        updated_at = NOW()
      RETURNING ${DAY_COLUMNS}
    `,
    [
      userId,
      date,
      has("ate"),
      update.ate ?? null,
      has("slept"),
      update.slept ?? null,
      has("connected"),
      update.connected ?? null,
      has("stepsTried"),
      update.stepsTried ?? null,
      update.dismiss === true,
    ],
  );

  return rows[0];
}

// Adds a guided-breathing session to the day. A session of a minute or more also ticks off the
// day's breathing task (e.g. a "Breathing exercises" routine) if there is one still open.
export async function recordBreathingSession(userId: number, date: string, seconds: number, isToday: boolean) {
  await ensureInitialized();

  const { rows } = await pool.query<{ breathing_seconds: number }>(
    `
      INSERT INTO support_days (user_id, entry_date, breathing_seconds, updated_at)
      VALUES ($1, $2::date, $3, NOW())
      ON CONFLICT (user_id, entry_date) DO UPDATE SET
        breathing_seconds = support_days.breathing_seconds + EXCLUDED.breathing_seconds,
        updated_at = NOW()
      RETURNING breathing_seconds
    `,
    [userId, date, seconds],
  );

  let completedTask: string | null = null;

  if (seconds >= 60) {
    // Make sure today's routines exist even if the Tasks page hasn't been opened yet.
    if (isToday) {
      await generateDailyTasksFromRecurring(userId, date);
    }

    const { rows: taskRows } = await pool.query<{ title: string }>(
      `
        WITH target AS (
          SELECT id FROM daily_tasks
          WHERE user_id = $1
            AND scheduled_date = $2::date
            AND status IN ('todo', 'in_progress')
            AND title ILIKE '%breath%'
          ORDER BY recurring_task_id IS NULL, created_at, id
          LIMIT 1
        )
        UPDATE daily_tasks t
        SET status = 'done', completed_at = COALESCE(t.completed_at, NOW()), updated_at = NOW()
        FROM target
        WHERE t.id = target.id
        RETURNING t.title
      `,
      [userId, date],
    );

    completedTask = taskRows[0]?.title ?? null;
  }

  return { totalSeconds: rows[0].breathing_seconds, completedTask };
}
