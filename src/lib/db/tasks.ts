import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type {
  DailyCheckIn,
  DayRecord,
  NewDailyCheckIn,
  NewRecurringTask,
  NewTask,
  RecurringTask,
  TaskCompletionStats,
  TaskItem,
  TaskPriority,
  UpdateRecurringTask,
  UpdateTaskStatusInput,
  UpsertDayRecordInput,
} from "@/lib/db/types";

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function getWeekdayCode(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return WEEKDAY_ORDER[weekday];
}

export async function getTasksByUserAndDate(userId: number, date: string) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             recurring_task_id,
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
  await ensureInitialized();

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
  await ensureInitialized();

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
  await ensureInitialized();

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
  await ensureInitialized();

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
  await ensureInitialized();

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
  await ensureInitialized();

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
  await ensureInitialized();

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
  await ensureInitialized();

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

export async function getRecurringTasksByUser(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<RecurringTask>(
    `
      SELECT id, user_id, title, priority, tags, note, is_active,
             days_of_week,
             TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
             TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
             created_at, updated_at
      FROM recurring_tasks
      WHERE user_id = $1
      ORDER BY
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        created_at ASC,
        id ASC
    `,
    [userId],
  );

  return rows;
}

export async function createRecurringTask(input: NewRecurringTask) {
  await ensureInitialized();

  const { rows } = await pool.query<{ id: number }>(
    `
      INSERT INTO recurring_tasks (
        user_id, title, priority, tags, note, days_of_week, start_date, end_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date)
      RETURNING id
    `,
    [
      input.userId,
      input.title,
      input.priority,
      input.tags,
      input.note,
      input.daysOfWeek,
      input.startDate,
      input.endDate,
    ],
  );

  return rows[0]?.id ?? null;
}

export async function updateRecurringTask(input: UpdateRecurringTask) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      UPDATE recurring_tasks
      SET title = $1,
          priority = $2,
          tags = $3,
          note = $4,
          is_active = $5,
          days_of_week = $6,
          start_date = $7::date,
          end_date = $8::date,
          updated_at = NOW()
      WHERE id = $9
        AND user_id = $10
    `,
    [
      input.title,
      input.priority,
      input.tags,
      input.note,
      input.isActive,
      input.daysOfWeek,
      input.startDate,
      input.endDate,
      input.id,
      input.userId,
    ],
  );

  return rowCount === 1;
}

export async function deleteRecurringTask(id: number, userId: number) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      DELETE FROM recurring_tasks
      WHERE id = $1
        AND user_id = $2
    `,
    [id, userId],
  );

  return rowCount === 1;
}

export async function generateDailyTasksFromRecurring(userId: number, date: string) {
  await ensureInitialized();
  const weekday = getWeekdayCode(date);

  const { rows: recurringTasks } = await pool.query<{
    id: number;
    title: string;
    priority: TaskPriority;
    tags: string[];
    note: string;
    days_of_week: string[];
    start_date: string;
    end_date: string | null;
  }>(
    `
      SELECT id, title, priority, tags, note, days_of_week,
             TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
             TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date
      FROM recurring_tasks
      WHERE user_id = $1
        AND is_active = true
        AND start_date <= $2::date
        AND (end_date IS NULL OR end_date >= $2::date)
        AND $3 = ANY(days_of_week)
      ORDER BY
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        created_at ASC
    `,
    [userId, date, weekday],
  );

  if (recurringTasks.length === 0) {
    return 0;
  }

  const { rows: existingTasks } = await pool.query<{ title: string; recurring_task_id: number | null }>(
    `
      SELECT DISTINCT title, recurring_task_id
      FROM daily_tasks
      WHERE user_id = $1
        AND scheduled_date = $2::date
    `,
    [userId, date],
  );

  const existingTitles = new Set(existingTasks.map((t) => t.title));
  const existingRecurringIds = new Set(
    existingTasks
      .map((task) => task.recurring_task_id)
      .filter((value): value is number => value !== null),
  );

  let count = 0;
  for (const task of recurringTasks) {
    if (!existingRecurringIds.has(task.id) && !existingTitles.has(task.title)) {
      await pool.query(
        `
          INSERT INTO daily_tasks (
            user_id, recurring_task_id, title, status, priority, tags, note, scheduled_date
          )
          VALUES ($1, $2, $3, 'todo', $4, $5, $6, $7::date)
        `,
        [userId, task.id, task.title, task.priority, task.tags, task.note, date],
      );
      count++;
    }
  }

  return count;
}

export async function getTaskCompletionStats(userId: number, days: number = 30) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskCompletionStats>(
    `
      WITH date_range AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE 'Asia/Colombo')::date - INTERVAL '1 day' * ($2 - 1),
          (NOW() AT TIME ZONE 'Asia/Colombo')::date,
          '1 day'::INTERVAL
        )::date AS date
      )
      SELECT
        TO_CHAR(dr.date, 'YYYY-MM-DD') AS date,
        COALESCE(COUNT(dt.id), 0)::int AS total_tasks,
        COALESCE(COUNT(CASE WHEN dt.status IN ('done', 'skipped') THEN 1 END), 0)::int AS completed_tasks,
        CASE
          WHEN COUNT(dt.id) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(CASE WHEN dt.status IN ('done', 'skipped') THEN 1 END) / COUNT(dt.id))::int
        END AS completion_rate
      FROM date_range dr
      LEFT JOIN daily_tasks dt
        ON dt.scheduled_date = dr.date
        AND dt.user_id = $1
      GROUP BY dr.date
      ORDER BY dr.date ASC
    `,
    [userId, days],
  );

  return rows;
}

export async function getTaskCompletionStatsForMonth(userId: number, month: string) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskCompletionStats>(
    `
      SELECT
        TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS total_tasks,
        COUNT(CASE WHEN status IN ('done', 'skipped') THEN 1 END)::int AS completed_tasks,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(CASE WHEN status IN ('done', 'skipped') THEN 1 END) / COUNT(*))::int
        END AS completion_rate
      FROM daily_tasks
      WHERE user_id = $1
        AND TO_CHAR(scheduled_date, 'YYYY-MM') = $2
      GROUP BY scheduled_date
      ORDER BY scheduled_date ASC
    `,
    [userId, month],
  );

  return rows;
}
