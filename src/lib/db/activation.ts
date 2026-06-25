import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type { BehaviouralActivationEntry } from "@/lib/db/types";

const activationSelect = `
  SELECT id,
         user_id,
         activity,
         TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
         before_depression,
         before_pleasure,
         before_achievement,
         after_depression,
         after_pleasure,
         after_achievement,
         status,
         created_at,
         updated_at
  FROM behavioural_activation_entries
`;

export type UpsertBehaviouralActivationInput = {
  id?: number;
  activity: string;
  entryDate: string;
  beforeDepression: number | null;
  beforePleasure: number | null;
  beforeAchievement: number | null;
  afterDepression: number | null;
  afterPleasure: number | null;
  afterAchievement: number | null;
  userId: number;
};

function computeStatus(input: UpsertBehaviouralActivationInput) {
  const hasAnyBefore =
    input.beforeDepression !== null ||
    input.beforePleasure !== null ||
    input.beforeAchievement !== null;
  const hasAllBefore =
    input.beforeDepression !== null &&
    input.beforePleasure !== null &&
    input.beforeAchievement !== null;
  const hasAnyAfter =
    input.afterDepression !== null ||
    input.afterPleasure !== null ||
    input.afterAchievement !== null;
  const hasAllAfter =
    input.afterDepression !== null &&
    input.afterPleasure !== null &&
    input.afterAchievement !== null;

  if (!hasAnyBefore && !hasAnyAfter) {
    return "pending" as const;
  }

  if (!hasAllBefore) {
    throw new Error("Before ratings must all be provided together.");
  }

  if (hasAnyAfter && !hasAllAfter) {
    throw new Error("After ratings must all be provided together.");
  }

  return hasAllAfter ? ("completed" as const) : ("pending" as const);
}

export async function getBehaviouralActivationEntriesByUser(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<BehaviouralActivationEntry>(
    `
      ${activationSelect}
      WHERE user_id = $1
      ORDER BY entry_date ASC, created_at ASC, id ASC
    `,
    [userId],
  );

  return rows;
}

export async function upsertBehaviouralActivationEntry(input: UpsertBehaviouralActivationInput) {
  await ensureInitialized();

  const status = computeStatus(input);

  if (input.id) {
    const { rows } = await pool.query<BehaviouralActivationEntry>(
      `
        UPDATE behavioural_activation_entries
        SET activity = $1,
            entry_date = $2::date,
            before_depression = $3,
            before_pleasure = $4,
            before_achievement = $5,
            after_depression = $6,
            after_pleasure = $7,
            after_achievement = $8,
            status = $9,
            updated_at = NOW()
        WHERE id = $10
          AND user_id = $11
        RETURNING id,
                  user_id,
                  activity,
                  TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
                  before_depression,
                  before_pleasure,
                  before_achievement,
                  after_depression,
                  after_pleasure,
                  after_achievement,
                  status,
                  created_at,
                  updated_at
      `,
      [
        input.activity,
        input.entryDate,
        input.beforeDepression,
        input.beforePleasure,
        input.beforeAchievement,
        input.afterDepression,
        input.afterPleasure,
        input.afterAchievement,
        status,
        input.id,
        input.userId,
      ],
    );

    return rows[0] ?? null;
  }

  const { rows } = await pool.query<BehaviouralActivationEntry>(
    `
      INSERT INTO behavioural_activation_entries (
        user_id,
        activity,
        entry_date,
        before_depression,
        before_pleasure,
        before_achievement,
        after_depression,
        after_pleasure,
        after_achievement,
        status
      )
      VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id,
                user_id,
                activity,
                TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
                before_depression,
                before_pleasure,
                before_achievement,
                after_depression,
                after_pleasure,
                after_achievement,
                status,
                created_at,
                updated_at
    `,
    [
      input.userId,
      input.activity,
      input.entryDate,
      input.beforeDepression,
      input.beforePleasure,
      input.beforeAchievement,
      input.afterDepression,
      input.afterPleasure,
      input.afterAchievement,
      status,
    ],
  );

  return rows[0] ?? null;
}

export async function deleteBehaviouralActivationEntry(id: number, userId: number) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      DELETE FROM behavioural_activation_entries
      WHERE id = $1
        AND user_id = $2
    `,
    [id, userId],
  );

  return rowCount === 1;
}
