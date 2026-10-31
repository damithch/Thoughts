import type { PoolClient } from "pg";

import {
  ATTENTION_LIMITS,
  computeAttentionStats,
  describeFocusChange,
  normalizeTaskName,
  taskTitlePatterns,
  type AttentionSessionValues,
} from "@/lib/attention/rules";
import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import { createRecurringTask, generateDailyTasksFromRecurring } from "@/lib/db/tasks";
import { createThought } from "@/lib/db/thoughts";
import type { AttentionSession, AttentionTaskIdea } from "@/lib/db/types";
import { shiftColomboDate } from "@/lib/time";

export const ATTENTION_ROUTINE_TITLE = "Attention training";
const ATTENTION_TAG = "attention-training";

const attentionColumns = `
  id, user_id, session_type, task_name,
  TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
  started_at, duration_minutes,
  self_focus_before, self_focus_after, task_focus_before, task_focus_after,
  anchors_used, mood_before, mood_after, comments, linked_task_id,
  created_at, updated_at
`;

type Queryable = Pick<PoolClient, "query">;

async function rememberTaskIdea(db: Queryable, userId: number, name: string) {
  const clean = normalizeTaskName(name);
  if (!clean) return;

  await db.query(
    `
      INSERT INTO attention_task_ideas (user_id, name)
      SELECT $1, $2
      WHERE (SELECT COUNT(*) FROM attention_task_ideas WHERE user_id = $1) < $3
      ON CONFLICT (user_id, (lower(name))) DO NOTHING
    `,
    [userId, clean, ATTENTION_LIMITS.ideaCount],
  );
}

// Ticks off the matching open task for that day (an "attention" task first; meditation also
// counts for a breathing or meditation habit). Returns the task, or null if none was open.
async function completeMatchingTask(db: Queryable, userId: number, date: string, values: AttentionSessionValues) {
  const patterns = taskTitlePatterns(values.sessionType);
  const { rows } = await db.query<{ id: number; title: string }>(
    `
      WITH target AS (
        SELECT id FROM daily_tasks
        WHERE user_id = $1
          AND scheduled_date = $2::date
          AND status IN ('todo', 'in_progress')
          AND title ILIKE ANY($3::text[])
        ORDER BY (title ILIKE '%attention%') DESC, recurring_task_id IS NULL, created_at, id
        LIMIT 1
      )
      UPDATE daily_tasks t
      SET status = 'done', completed_at = COALESCE(t.completed_at, NOW()), updated_at = NOW()
      FROM target
      WHERE t.id = target.id
      RETURNING t.id, t.title
    `,
    [userId, date, patterns],
  );

  return rows[0] ?? null;
}

export async function createAttentionSession(
  userId: number,
  values: AttentionSessionValues,
  options: { completeTask?: boolean; today: string },
) {
  await ensureInitialized();

  // Today's routines may not exist yet if the Tasks page hasn't been opened.
  if (options.completeTask && values.entryDate === options.today) {
    await generateDailyTasksFromRecurring(userId, values.entryDate);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const completed = options.completeTask
      ? await completeMatchingTask(client, userId, values.entryDate, values)
      : null;

    const { rows } = await client.query<AttentionSession>(
      `
        INSERT INTO attention_sessions (
          user_id, session_type, task_name, entry_date, started_at, duration_minutes,
          self_focus_before, self_focus_after, anchors_used, mood_before, mood_after,
          comments, linked_task_id
        )
        VALUES ($1, $2, $3, $4::date, COALESCE($5::timestamptz, NOW()), $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING ${attentionColumns}
      `,
      [
        userId,
        values.sessionType,
        values.taskName,
        values.entryDate,
        values.startedAt,
        values.durationMinutes,
        values.selfFocusBefore,
        values.selfFocusAfter,
        values.anchorsUsed,
        values.moodBefore,
        values.moodAfter,
        values.comments,
        completed?.id ?? null,
      ],
    );

    if (values.sessionType === "mundane_task") {
      await rememberTaskIdea(client, userId, values.taskName);
    }

    await client.query("COMMIT");

    return { session: rows[0], completedTask: completed?.title ?? null };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getAttentionSessions(
  userId: number,
  filters: { from?: string | null; to?: string | null; type?: AttentionSession["session_type"] | null; limit?: number } = {},
) {
  await ensureInitialized();

  const clauses = ["user_id = $1"];
  const values: unknown[] = [userId];

  if (filters.from) {
    values.push(filters.from);
    clauses.push(`entry_date >= $${values.length}::date`);
  }
  if (filters.to) {
    values.push(filters.to);
    clauses.push(`entry_date <= $${values.length}::date`);
  }
  if (filters.type) {
    values.push(filters.type);
    clauses.push(`session_type = $${values.length}`);
  }

  const limit = Math.min(Math.max(1, filters.limit ?? ATTENTION_LIMITS.listDefault), ATTENTION_LIMITS.listMax);
  values.push(limit);

  const { rows } = await pool.query<AttentionSession>(
    `
      SELECT ${attentionColumns}
      FROM attention_sessions
      WHERE ${clauses.join(" AND ")}
      ORDER BY entry_date DESC, started_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return rows;
}

export async function getAttentionSessionForUser(id: number, userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<AttentionSession>(
    `SELECT ${attentionColumns} FROM attention_sessions WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );

  return rows[0] ?? null;
}

export async function updateAttentionSession(id: number, userId: number, values: AttentionSessionValues) {
  await ensureInitialized();

  const { rows } = await pool.query<AttentionSession>(
    `
      UPDATE attention_sessions
      SET session_type = $3,
          task_name = $4,
          entry_date = $5::date,
          started_at = COALESCE($6::timestamptz, started_at),
          duration_minutes = $7,
          self_focus_before = $8,
          self_focus_after = $9,
          anchors_used = $10,
          mood_before = $11,
          mood_after = $12,
          comments = $13,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING ${attentionColumns}
    `,
    [
      id,
      userId,
      values.sessionType,
      values.taskName,
      values.entryDate,
      values.startedAt,
      values.durationMinutes,
      values.selfFocusBefore,
      values.selfFocusAfter,
      values.anchorsUsed,
      values.moodBefore,
      values.moodAfter,
      values.comments,
    ],
  );

  if (rows[0] && values.sessionType === "mundane_task") {
    await rememberTaskIdea(pool, userId, values.taskName);
  }

  return rows[0] ?? null;
}

export async function deleteAttentionSession(id: number, userId: number) {
  await ensureInitialized();

  const { rowCount } = await pool.query(`DELETE FROM attention_sessions WHERE id = $1 AND user_id = $2`, [id, userId]);

  return (rowCount ?? 0) > 0;
}

export async function getAttentionStats(userId: number, today: string, range: 7 | 30) {
  await ensureInitialized();

  const [sessions, active] = await Promise.all([
    getAttentionSessions(userId, {
      from: shiftColomboDate(today, -(range - 1)),
      to: today,
      limit: ATTENTION_LIMITS.listMax,
    }),
    pool.query<{ entry_date: string }>(
      `
        SELECT DISTINCT TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date
        FROM attention_sessions
        WHERE user_id = $1 AND entry_date <= $2::date
        ORDER BY entry_date DESC
        LIMIT 400
      `,
      [userId, today],
    ),
  ]);

  return computeAttentionStats(
    sessions,
    active.rows.map((row) => row.entry_date),
    today,
    range,
  );
}

// --- Saved everyday tasks (quick-pick chips) ---

export async function getAttentionTaskIdeas(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<AttentionTaskIdea>(
    `SELECT id, name FROM attention_task_ideas WHERE user_id = $1 ORDER BY lower(name)`,
    [userId],
  );

  return rows;
}

export async function addAttentionTaskIdea(userId: number, name: string) {
  await ensureInitialized();
  await rememberTaskIdea(pool, userId, name);

  return getAttentionTaskIdeas(userId);
}

export async function deleteAttentionTaskIdea(id: number, userId: number) {
  await ensureInitialized();

  const { rowCount } = await pool.query(`DELETE FROM attention_task_ideas WHERE id = $1 AND user_id = $2`, [id, userId]);

  return (rowCount ?? 0) > 0;
}

// --- Daily reminder: an "Attention training" routine whose reminder time the phone schedules ---

export type AttentionReminder = { routineId: number; time: string | null; active: boolean } | null;

export async function getAttentionReminder(userId: number): Promise<AttentionReminder> {
  await ensureInitialized();

  const { rows } = await pool.query<{ id: number; remind_at: string | null; is_active: boolean }>(
    `
      SELECT id, remind_at, is_active
      FROM recurring_tasks
      WHERE user_id = $1 AND lower(title) = lower($2)
      ORDER BY is_active DESC, id
      LIMIT 1
    `,
    [userId, ATTENTION_ROUTINE_TITLE],
  );

  return rows[0] ? { routineId: rows[0].id, time: rows[0].remind_at, active: rows[0].is_active } : null;
}

// Sets (or clears, with null) the reminder. Creates the daily routine the first time a time is set;
// clearing the time keeps the routine so the daily task stays.
export async function setAttentionReminder(userId: number, time: string | null, today: string) {
  const existing = await getAttentionReminder(userId);

  if (existing) {
    await pool.query(
      `
        UPDATE recurring_tasks
        SET remind_at = $3,
            is_active = CASE WHEN $3::text IS NULL THEN is_active ELSE TRUE END,
            updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `,
      [existing.routineId, userId, time],
    );
  } else if (time) {
    await createRecurringTask({
      userId,
      title: ATTENTION_ROUTINE_TITLE,
      priority: "medium",
      tags: [ATTENTION_TAG],
      note: "One everyday task done with full attention, and a short breathing meditation.",
      daysOfWeek: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      startDate: today,
      endDate: null,
      remindAt: time,
    });
  }

  return getAttentionReminder(userId);
}

// --- Journal reflection from a session ---

export async function createAttentionReflection(
  userId: number,
  session: AttentionSession,
  input: { mood: number; text: string },
) {
  const isMeditation = session.session_type === "meditation";
  const change = describeFocusChange(session.task_focus_before, session.task_focus_after);
  const details = [
    `${isMeditation ? "Meditation" : "Mundane task"}: ${session.task_name}`,
    `${session.duration_minutes} min`,
    change,
    session.anchors_used?.length ? `Anchors: ${session.anchors_used.join(", ")}` : null,
  ].filter(Boolean);
  const text = input.text.trim();
  const summary = (text || details.join(" · ")).slice(0, 280);

  return createThought({
    userId,
    title: `Attention practice: ${session.task_name}`.slice(0, 200),
    category: "Attention training",
    mood: input.mood,
    tags: [ATTENTION_TAG, isMeditation ? "meditation" : "mundane-task"],
    conceptTags: [],
    summary,
    body: [text, details.join("\n")].filter(Boolean).join("\n\n"),
    linkedBookIdeaId: null,
    insightReflection: "",
    // One reflection per session, even if the button is pressed twice.
    requestId: `attention-session-${session.id}`,
  });
}
