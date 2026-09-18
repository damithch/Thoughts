import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type { AnchorNote, AnchorStreak, NewAnchorNote } from "@/lib/db/types";
import { getCurrentColomboDate, shiftColomboDate } from "@/lib/time";

export async function getAnchorNoteByDate(
  userId: number,
  date: string,
): Promise<AnchorNote | null> {
  await ensureInitialized();

  const { rows } = await pool.query<AnchorNote>(
    `
      SELECT id, user_id,
             TO_CHAR(date, 'YYYY-MM-DD') AS date,
             content, created_at, updated_at
      FROM anchor_notes
      WHERE user_id = $1 AND date = $2::date
      LIMIT 1
    `,
    [userId, date],
  );

  return rows[0] ?? null;
}

export async function getRecentAnchorNotes(
  userId: number,
  limit = 30,
): Promise<AnchorNote[]> {
  await ensureInitialized();

  const safeLimit =
    Number.isInteger(limit) && limit > 0 ? Math.min(limit, 365) : 30;

  const { rows } = await pool.query<AnchorNote>(
    `
      SELECT id, user_id,
             TO_CHAR(date, 'YYYY-MM-DD') AS date,
             content, created_at, updated_at
      FROM anchor_notes
      WHERE user_id = $1
      ORDER BY date DESC, created_at DESC
      LIMIT $2
    `,
    [userId, safeLimit],
  );

  return rows;
}

export async function createAnchorNote(
  input: NewAnchorNote,
): Promise<AnchorNote> {
  await ensureInitialized();

  const trimmedContent = input.content.trim();
  if (!trimmedContent) {
    throw new Error("Anchor note content cannot be empty.");
  }

  const { rows } = await pool.query<AnchorNote>(
    `
      INSERT INTO anchor_notes (user_id, date, content)
      VALUES ($1, $2::date, $3)
      ON CONFLICT (user_id, date) DO UPDATE
      SET content = EXCLUDED.content,
          updated_at = NOW()
      RETURNING id, user_id,
                TO_CHAR(date, 'YYYY-MM-DD') AS date,
                content, created_at, updated_at
    `,
    [input.userId, input.date, trimmedContent],
  );

  return rows[0];
}

export async function getAnchorStreak(
  userId: number,
  referenceDate?: string,
): Promise<AnchorStreak> {
  await ensureInitialized();

  const today = referenceDate || getCurrentColomboDate();
  const yesterday = shiftColomboDate(today, -1);

  // Retrieve all distinct logged dates in descending order
  const { rows } = await pool.query<{ log_date: string }>(
    `
      SELECT TO_CHAR(date, 'YYYY-MM-DD') AS log_date
      FROM anchor_notes
      WHERE user_id = $1
      ORDER BY date DESC
    `,
    [userId],
  );

  const dates = rows.map((r) => r.log_date);
  const dateSet = new Set(dates);
  const totalEntries = dates.length;
  const hasToday = dateSet.has(today);

  if (totalEntries === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalEntries: 0,
      hasToday: false,
    };
  }

  // Calculate current streak
  let currentStreak = 0;
  let checkDate = hasToday ? today : dateSet.has(yesterday) ? yesterday : null;

  if (checkDate) {
    while (dateSet.has(checkDate)) {
      currentStreak += 1;
      checkDate = shiftColomboDate(checkDate, -1);
    }
  }

  // Calculate longest streak historically
  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate: string | null = null;

  // Iterate chronologically (oldest to newest)
  const sortedDates = [...dates].sort();
  for (const d of sortedDates) {
    if (!previousDate) {
      runningStreak = 1;
    } else {
      const expectedNext = shiftColomboDate(previousDate, 1);
      if (d === expectedNext) {
        runningStreak += 1;
      } else if (d !== previousDate) {
        runningStreak = 1;
      }
    }
    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
    previousDate = d;
  }

  return {
    currentStreak,
    longestStreak,
    totalEntries,
    hasToday,
  };
}
