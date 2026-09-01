import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type {
  WorryPostponementModule,
  WorryEvidence,
  WorryExperimentDay,
  WorryPostponedItem,
  NewWorryModule,
  UpdateWorryModule,
  NewWorryEvidence,
  UpdateWorryEvidence,
  UpsertWorryExperimentDay,
} from "@/lib/db/types";

// ── Row type without nested children (raw DB row) ───────────

type WorryModuleRow = Omit<WorryPostponementModule, "evidence" | "experiment_days">;

// ── Helpers ─────────────────────────────────────────────────

async function attachChildren(
  mod: WorryModuleRow,
): Promise<WorryPostponementModule> {
  const [evidenceResult, daysResult] = await Promise.all([
    pool.query<WorryEvidence>(
      `SELECT id, module_id, side, content, sort_order, created_at
       FROM worry_evidence
       WHERE module_id = $1
       ORDER BY side, sort_order, id`,
      [mod.id],
    ),
    pool.query<WorryExperimentDay>(
      `SELECT id, module_id, day_number,
              TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
              what_happened, thinking_time_notes, controllability,
              created_at, updated_at
       FROM worry_experiment_days
       WHERE module_id = $1
       ORDER BY day_number`,
      [mod.id],
    ),
  ]);

  return {
    ...mod,
    evidence: evidenceResult.rows,
    experiment_days: daysResult.rows,
  };
}

// ── Module ──────────────────────────────────────────────────

export async function getActiveWorryModule(
  userId: number,
): Promise<WorryPostponementModule | null> {
  await ensureInitialized();

  const { rows } = await pool.query<WorryModuleRow>(
    `SELECT id, user_id, belief_text, belief_before_pct, belief_after_pct,
            thinking_time_start, thinking_time_duration, thinking_time_place,
            prediction_text, prediction_confidence, reflection_text,
            status, created_at, updated_at
     FROM worry_postponement_modules
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  if (!rows[0]) return null;

  return attachChildren(rows[0]);
}

export async function getWorryModuleById(
  moduleId: number,
  userId: number,
): Promise<WorryPostponementModule | null> {
  await ensureInitialized();

  const { rows } = await pool.query<WorryModuleRow>(
    `SELECT id, user_id, belief_text, belief_before_pct, belief_after_pct,
            thinking_time_start, thinking_time_duration, thinking_time_place,
            prediction_text, prediction_confidence, reflection_text,
            status, created_at, updated_at
     FROM worry_postponement_modules
     WHERE id = $1 AND user_id = $2`,
    [moduleId, userId],
  );

  if (!rows[0]) return null;

  return attachChildren(rows[0]);
}

export async function createWorryModule(
  input: NewWorryModule,
): Promise<WorryPostponementModule> {
  await ensureInitialized();

  const { rows } = await pool.query<WorryModuleRow>(
    `INSERT INTO worry_postponement_modules (user_id, belief_text, belief_before_pct)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, belief_text, belief_before_pct, belief_after_pct,
               thinking_time_start, thinking_time_duration, thinking_time_place,
               prediction_text, prediction_confidence, reflection_text,
               status, created_at, updated_at`,
    [input.userId, input.beliefText, input.beliefBeforePct],
  );

  return { ...rows[0], evidence: [], experiment_days: [] };
}

export async function updateWorryModule(
  input: UpdateWorryModule,
): Promise<WorryPostponementModule | null> {
  await ensureInitialized();

  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 0;

  function addSet(column: string, value: unknown) {
    paramIndex++;
    sets.push(`${column} = $${paramIndex}`);
    values.push(value);
  }

  if (input.beliefText !== undefined) addSet("belief_text", input.beliefText);
  if (input.beliefBeforePct !== undefined) addSet("belief_before_pct", input.beliefBeforePct);
  if (input.beliefAfterPct !== undefined) addSet("belief_after_pct", input.beliefAfterPct);
  if (input.thinkingTimeStart !== undefined) addSet("thinking_time_start", input.thinkingTimeStart);
  if (input.thinkingTimeDuration !== undefined) addSet("thinking_time_duration", input.thinkingTimeDuration);
  if (input.thinkingTimePlace !== undefined) addSet("thinking_time_place", input.thinkingTimePlace);
  if (input.predictionText !== undefined) addSet("prediction_text", input.predictionText);
  if (input.predictionConfidence !== undefined) addSet("prediction_confidence", input.predictionConfidence);
  if (input.reflectionText !== undefined) addSet("reflection_text", input.reflectionText);
  if (input.status !== undefined) addSet("status", input.status);

  if (sets.length === 0) {
    return getWorryModuleById(input.id, input.userId);
  }

  addSet("updated_at", new Date());

  paramIndex++;
  const idParam = paramIndex;
  values.push(input.id);

  paramIndex++;
  const userParam = paramIndex;
  values.push(input.userId);

  const { rows } = await pool.query<WorryModuleRow>(
    `UPDATE worry_postponement_modules
     SET ${sets.join(", ")}
     WHERE id = $${idParam} AND user_id = $${userParam}
     RETURNING id, user_id, belief_text, belief_before_pct, belief_after_pct,
               thinking_time_start, thinking_time_duration, thinking_time_place,
               prediction_text, prediction_confidence, reflection_text,
               status, created_at, updated_at`,
    values,
  );

  if (!rows[0]) return null;

  return attachChildren(rows[0]);
}

// ── Evidence ────────────────────────────────────────────────

export async function createWorryEvidence(
  input: NewWorryEvidence,
): Promise<WorryEvidence> {
  await ensureInitialized();

  // Auto-assign sort_order as max + 1 for this side
  const { rows: countRows } = await pool.query<{ max_order: number | null }>(
    `SELECT MAX(sort_order) AS max_order
     FROM worry_evidence
     WHERE module_id = $1 AND side = $2`,
    [input.moduleId, input.side],
  );

  const nextOrder = (countRows[0]?.max_order ?? -1) + 1;

  const { rows } = await pool.query<WorryEvidence>(
    `INSERT INTO worry_evidence (module_id, side, content, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, module_id, side, content, sort_order, created_at`,
    [input.moduleId, input.side, input.content, nextOrder],
  );

  return rows[0];
}

export async function updateWorryEvidence(
  input: UpdateWorryEvidence,
): Promise<WorryEvidence | null> {
  await ensureInitialized();

  const { rows } = await pool.query<WorryEvidence>(
    `UPDATE worry_evidence
     SET content = $1
     WHERE id = $2 AND module_id = $3
     RETURNING id, module_id, side, content, sort_order, created_at`,
    [input.content, input.id, input.moduleId],
  );

  return rows[0] ?? null;
}

export async function deleteWorryEvidence(
  id: number,
  moduleId: number,
): Promise<boolean> {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `DELETE FROM worry_evidence WHERE id = $1 AND module_id = $2`,
    [id, moduleId],
  );

  return rowCount === 1;
}

// ── Experiment Days ─────────────────────────────────────────

export async function upsertWorryExperimentDay(
  input: UpsertWorryExperimentDay,
): Promise<WorryExperimentDay> {
  await ensureInitialized();

  const { rows } = await pool.query<WorryExperimentDay>(
    `INSERT INTO worry_experiment_days
       (module_id, day_number, entry_date, what_happened, thinking_time_notes, controllability)
     VALUES ($1, $2, $3::date, $4, $5, $6)
     ON CONFLICT (module_id, day_number)
     DO UPDATE SET
       entry_date = EXCLUDED.entry_date,
       what_happened = EXCLUDED.what_happened,
       thinking_time_notes = EXCLUDED.thinking_time_notes,
       controllability = EXCLUDED.controllability,
       updated_at = NOW()
     RETURNING id, module_id, day_number,
               TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
               what_happened, thinking_time_notes, controllability,
               created_at, updated_at`,
    [
      input.moduleId,
      input.dayNumber,
      input.entryDate,
      input.whatHappened,
      input.thinkingTimeNotes,
      input.controllability,
    ],
  );

  return rows[0];
}

// ── Postponed Items ─────────────────────────────────────────

export async function createPostponedItem(
  moduleId: number,
  dayNumber: number,
  content: string,
): Promise<WorryPostponedItem> {
  await ensureInitialized();

  const { rows } = await pool.query<WorryPostponedItem>(
    `INSERT INTO worry_postponed_items (module_id, day_number, content)
     VALUES ($1, $2, $3)
     RETURNING id, module_id, day_number, content, created_at`,
    [moduleId, dayNumber, content],
  );

  return rows[0];
}

export async function getPostponedItemsForDay(
  moduleId: number,
  dayNumber: number,
): Promise<WorryPostponedItem[]> {
  await ensureInitialized();

  const { rows } = await pool.query<WorryPostponedItem>(
    `SELECT id, module_id, day_number, content, created_at
     FROM worry_postponed_items
     WHERE module_id = $1 AND day_number = $2
     ORDER BY created_at`,
    [moduleId, dayNumber],
  );

  return rows;
}

export async function deletePostponedItem(
  id: number,
  moduleId: number,
): Promise<boolean> {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `DELETE FROM worry_postponed_items WHERE id = $1 AND module_id = $2`,
    [id, moduleId],
  );

  return rowCount === 1;
}
