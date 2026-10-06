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
  TaskStatus,
  UpdateRecurringTask,
  UpdateTaskInput,
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
             recurring_task_id, rollover_count,
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

export async function getTasksByUserDateRange(userId: number, fromDate: string, toDate: string) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             recurring_task_id, rollover_count,
             user_id, created_at, updated_at, started_at, completed_at
      FROM daily_tasks
      WHERE user_id = $1
        AND scheduled_date BETWEEN $2::date AND $3::date
      ORDER BY
        scheduled_date ASC,
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        created_at ASC,
        id ASC
    `,
    [userId, fromDate, toDate],
  );

  return rows;
}

export async function getInboxTasksByUser(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             recurring_task_id, rollover_count,
             user_id, created_at, updated_at, started_at, completed_at
      FROM daily_tasks
      WHERE user_id = $1
        AND scheduled_date IS NULL
      ORDER BY
        CASE status
          WHEN 'in_progress' THEN 1
          WHEN 'todo' THEN 2
          ELSE 3
        END,
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        created_at DESC,
        id DESC
    `,
    [userId],
  );

  return rows;
}

export async function getTaskByIdForUser(taskId: number, userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             recurring_task_id, rollover_count,
             user_id, created_at, updated_at, started_at, completed_at
      FROM daily_tasks
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [taskId, userId],
  );

  return rows[0] ?? null;
}

// Puts back a task removed by deleteTask (used for Undo). Restoring a routine instance also
// clears the skip that the delete recorded.
export async function restoreDeletedTask(task: TaskItem, userId: number) {
  await ensureInitialized();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO daily_tasks (
          user_id, recurring_task_id, title, status, priority, tags, note, scheduled_date,
          created_at, started_at, completed_at, rollover_count, updated_at
        )
        SELECT $1, r.id, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12, NOW()
        FROM (SELECT 1) AS one
        LEFT JOIN recurring_tasks r ON r.id = $2 AND r.user_id = $1
        ON CONFLICT DO NOTHING
      `,
      [
        userId,
        task.recurring_task_id,
        task.title,
        task.status,
        task.priority,
        task.tags,
        task.note,
        task.scheduled_date,
        task.created_at,
        task.started_at,
        task.completed_at,
        Number.isInteger(task.rollover_count) && task.rollover_count >= 0 ? task.rollover_count : 0,
      ],
    );

    if (task.recurring_task_id !== null && task.scheduled_date !== null) {
      await client.query(
        `
          DELETE FROM recurring_task_skips
          WHERE user_id = $1
            AND recurring_task_id = $2
            AND skip_date = $3::date
        `,
        [userId, task.recurring_task_id, task.scheduled_date],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Open one-off tasks scheduled before `date` (what rollForwardOpenTasks would move).
export async function getOverdueOpenTasks(userId: number, date: string) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             recurring_task_id, rollover_count,
             user_id, created_at, updated_at, started_at, completed_at
      FROM daily_tasks
      WHERE user_id = $1
        AND scheduled_date < $2::date
        AND status IN ('todo', 'in_progress')
        AND recurring_task_id IS NULL
      ORDER BY scheduled_date ASC, created_at ASC, id ASC
      LIMIT 100
    `,
    [userId, date],
  );

  return rows;
}

export async function getInboxOpenTaskCount(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM daily_tasks
      WHERE user_id = $1
        AND scheduled_date IS NULL
        AND status IN ('todo', 'in_progress')
    `,
    [userId],
  );

  return Number(rows[0]?.total ?? "0");
}

// Open tasks that have been pushed to a later day at least `minimum` times.
export async function getSlippingOpenTasks(userId: number, minimum = 2) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             recurring_task_id, rollover_count,
             user_id, created_at, updated_at, started_at, completed_at
      FROM daily_tasks
      WHERE user_id = $1
        AND status IN ('todo', 'in_progress')
        AND rollover_count >= $2
      ORDER BY rollover_count DESC, scheduled_date ASC NULLS LAST, id ASC
      LIMIT 20
    `,
    [userId, minimum],
  );

  return rows;
}

export async function getRecurringSkipsByUserRange(userId: number, fromDate: string, toDate: string) {
  await ensureInitialized();

  const { rows } = await pool.query<{ recurring_task_id: number; skip_date: string }>(
    `
      SELECT recurring_task_id, TO_CHAR(skip_date, 'YYYY-MM-DD') AS skip_date
      FROM recurring_task_skips
      WHERE user_id = $1
        AND skip_date BETWEEN $2::date AND $3::date
    `,
    [userId, fromDate, toDate],
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
        AND recurring_task_id IS NULL
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

export async function getDayRecordsByUserMonth(userId: number, month: string) {
  await ensureInitialized();

  const { rows } = await pool.query<DayRecord>(
    `
      SELECT id, user_id,
             TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
             intention, note, end_of_day_mood,
             created_at, updated_at
      FROM daily_task_notes
      WHERE user_id = $1
        AND TO_CHAR(entry_date, 'YYYY-MM') = $2
      ORDER BY entry_date ASC, id ASC
    `,
    [userId, month],
  );

  return rows;
}

export async function createTask(input: NewTask) {
  await ensureInitialized();

  const { rows } = await pool.query<{ id: number }>(
    `
      INSERT INTO daily_tasks (
        user_id, title, status, priority, tags, note, scheduled_date
      )
      VALUES ($1, $2, 'todo', $3, $4, $5, $6::date)
      RETURNING id
    `,
    [input.userId, input.title, input.priority, input.tags, input.note, input.scheduledDate],
  );

  return Number(rows[0].id);
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
          rollover_count = rollover_count + CASE WHEN $3::date > scheduled_date THEN 1 ELSE 0 END,
          status = 'todo',
          started_at = NULL,
          completed_at = NULL,
          updated_at = NOW()
      WHERE user_id = $1
        AND scheduled_date = $2::date
        AND status IN ('todo', 'in_progress')
        AND recurring_task_id IS NULL
    `,
    [userId, fromDate, toDate],
  );

  return rowCount ?? 0;
}

// Moves every open one-off task scheduled before `toDate` onto `toDate`, however many days
// overdue it is. Routine instances are left on their own day: the routine recurs anyway, so
// carrying it forward would only stack up duplicates.
export async function rollForwardOpenTasks(userId: number, toDate: string) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      UPDATE daily_tasks
      SET scheduled_date = $2::date,
          rollover_count = rollover_count + 1,
          status = 'todo',
          started_at = NULL,
          completed_at = NULL,
          updated_at = NOW()
      WHERE user_id = $1
        AND scheduled_date < $2::date
        AND status IN ('todo', 'in_progress')
        AND recurring_task_id IS NULL
    `,
    [userId, toDate],
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

export async function getDailyCheckInsByUserMonth(userId: number, month: string) {
  await ensureInitialized();

  const { rows } = await pool.query<DailyCheckIn>(
    `
      SELECT id, user_id,
             TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
             mood, energy, focus, note, created_at
      FROM daily_check_ins
      WHERE user_id = $1
        AND TO_CHAR(entry_date, 'YYYY-MM') = $2
      ORDER BY entry_date ASC, created_at ASC, id ASC
    `,
    [userId, month],
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

// Creates the day's routine instances. Idempotent: an existing instance (matched by routine id,
// not title) is never duplicated, and occurrences the user deleted or moved away are skipped.
export async function generateDailyTasksFromRecurring(userId: number, date: string) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      INSERT INTO daily_tasks (
        user_id, recurring_task_id, title, status, priority, tags, note, scheduled_date
      )
      SELECT r.user_id, r.id, r.title, 'todo', r.priority, r.tags, r.note, $2::date
      FROM recurring_tasks r
      WHERE r.user_id = $1
        AND r.is_active = true
        AND r.start_date <= $2::date
        AND (r.end_date IS NULL OR r.end_date >= $2::date)
        AND $3 = ANY(r.days_of_week)
        AND NOT EXISTS (
          SELECT 1
          FROM recurring_task_skips s
          WHERE s.recurring_task_id = r.id
            AND s.skip_date = $2::date
        )
      ORDER BY
        CASE r.priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        r.created_at ASC
      ON CONFLICT (user_id, recurring_task_id, scheduled_date)
        WHERE recurring_task_id IS NOT NULL
        DO NOTHING
    `,
    [userId, date, getWeekdayCode(date)],
  );

  return rowCount ?? 0;
}

export async function getRecurringSkipsByUserMonth(userId: number, month: string) {
  await ensureInitialized();

  const { rows } = await pool.query<{ recurring_task_id: number; skip_date: string }>(
    `
      SELECT recurring_task_id, TO_CHAR(skip_date, 'YYYY-MM-DD') AS skip_date
      FROM recurring_task_skips
      WHERE user_id = $1
        AND TO_CHAR(skip_date, 'YYYY-MM') = $2
    `,
    [userId, month],
  );

  return rows;
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
        -- Skipped tasks are reported separately and left out of the rate, so skipping is not "completing".
        COUNT(CASE WHEN dt.status <> 'skipped' THEN 1 END)::int AS total_tasks,
        COUNT(CASE WHEN dt.status = 'done' THEN 1 END)::int AS completed_tasks,
        COUNT(CASE WHEN dt.status = 'skipped' THEN 1 END)::int AS skipped_tasks,
        CASE
          WHEN COUNT(CASE WHEN dt.status <> 'skipped' THEN 1 END) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(CASE WHEN dt.status = 'done' THEN 1 END)
            / COUNT(CASE WHEN dt.status <> 'skipped' THEN 1 END))::int
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
        COUNT(CASE WHEN status <> 'skipped' THEN 1 END)::int AS total_tasks,
        COUNT(CASE WHEN status = 'done' THEN 1 END)::int AS completed_tasks,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END)::int AS skipped_tasks,
        CASE
          WHEN COUNT(CASE WHEN status <> 'skipped' THEN 1 END) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(CASE WHEN status = 'done' THEN 1 END)
            / COUNT(CASE WHEN status <> 'skipped' THEN 1 END))::int
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

export async function getTasksByUserMonth(userId: number, month: string) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             recurring_task_id, rollover_count,
             user_id, created_at, updated_at, started_at, completed_at
      FROM daily_tasks
      WHERE user_id = $1
        AND TO_CHAR(scheduled_date, 'YYYY-MM') = $2
      ORDER BY scheduled_date ASC,
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        created_at ASC,
        id ASC
    `,
    [userId, month],
  );

  return rows;
}

export async function getTasksByUser(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             recurring_task_id, rollover_count,
             user_id, created_at, updated_at, started_at, completed_at
      FROM daily_tasks
      WHERE user_id = $1
      ORDER BY scheduled_date DESC, created_at DESC
    `,
    [userId],
  );

  return rows;
}

export async function deleteTask(id: number, userId: number) {
  await ensureInitialized();

  // Deleting a routine instance records a skip so generation doesn't recreate it.
  const { rows } = await pool.query<{ deleted: number }>(
    `
      WITH deleted AS (
        DELETE FROM daily_tasks
        WHERE id = $1
          AND user_id = $2
        RETURNING recurring_task_id, scheduled_date
      ),
      skipped AS (
        INSERT INTO recurring_task_skips (user_id, recurring_task_id, skip_date)
        SELECT $2, recurring_task_id, scheduled_date
        FROM deleted
        WHERE recurring_task_id IS NOT NULL
        ON CONFLICT DO NOTHING
      )
      SELECT COUNT(*)::int AS deleted FROM deleted
    `,
    [id, userId],
  );

  return (rows[0]?.deleted ?? 0) === 1;
}

export async function updateTask(input: UpdateTaskInput) {
  await ensureInitialized();

  const updates: string[] = [];
  const values: unknown[] = [input.id, input.userId];
  let paramIdx = 3;

  if (input.title !== undefined) {
    updates.push(`title = $${paramIdx++}`);
    values.push(input.title);
  }

  if (input.priority !== undefined) {
    updates.push(`priority = $${paramIdx++}`);
    values.push(input.priority);
  }

  if (input.status !== undefined) {
    updates.push(`status = $${paramIdx++}`);
    values.push(input.status);

    if (input.status === "in_progress") {
      updates.push(`started_at = COALESCE(started_at, NOW())`);
    } else if (input.status === "todo") {
      updates.push(`started_at = NULL, completed_at = NULL`);
    } else if (input.status === "done" || input.status === "skipped") {
      updates.push(`completed_at = COALESCE(completed_at, NOW())`);
    }
  }

  if (input.tags !== undefined) {
    updates.push(`tags = $${paramIdx++}`);
    values.push(input.tags);
  }

  if (input.note !== undefined) {
    updates.push(`note = $${paramIdx++}`);
    values.push(input.note);
  }

  let scheduledDateParam: number | null = null;

  if (input.scheduledDate !== undefined) {
    scheduledDateParam = paramIdx++;
    updates.push(`scheduled_date = $${scheduledDateParam}::date`);
    // Pushing an open task to a later day counts as a slip (for the weekly review).
    updates.push(
      `rollover_count = rollover_count + CASE WHEN status IN ('todo', 'in_progress') AND scheduled_date < $${scheduledDateParam}::date THEN 1 ELSE 0 END`,
    );
    // A routine instance moved to another day becomes a one-off there (SET sees the old values).
    updates.push(
      `recurring_task_id = CASE WHEN scheduled_date IS DISTINCT FROM $${scheduledDateParam}::date THEN NULL ELSE recurring_task_id END`,
    );
    values.push(input.scheduledDate);
  }

  if (updates.length === 0) {
    return false;
  }

  updates.push(`updated_at = NOW()`);

  // When rescheduling a routine instance, remember its original day as skipped so generation
  // doesn't put a fresh copy back there.
  const skipOriginalDay =
    scheduledDateParam === null
      ? ""
      : `
    WITH skipped AS (
      INSERT INTO recurring_task_skips (user_id, recurring_task_id, skip_date)
      SELECT user_id, recurring_task_id, scheduled_date
      FROM daily_tasks
      WHERE id = $1
        AND user_id = $2
        AND recurring_task_id IS NOT NULL
        AND scheduled_date IS DISTINCT FROM $${scheduledDateParam}::date
      ON CONFLICT DO NOTHING
    )`;

  const query = `
    ${skipOriginalDay}
    UPDATE daily_tasks
    SET ${updates.join(", ")}
    WHERE id = $1 AND user_id = $2
  `;

  const { rowCount } = await pool.query(query, values);
  return rowCount === 1;
}

export async function batchUpdateTaskStatus(
  userId: number,
  taskIds: number[],
  status: TaskStatus,
) {
  await ensureInitialized();

  if (taskIds.length === 0) return 0;

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
      WHERE user_id = $2
        AND id = ANY($3::bigint[])
    `,
    [status, userId, taskIds],
  );

  return rowCount ?? 0;
}

