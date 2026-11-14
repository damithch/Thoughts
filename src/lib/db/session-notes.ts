import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import {
  normalizeSessionNoteContent,
  SESSION_NOTE_LIMITS,
  type SessionNote,
  type SessionNoteSource,
} from "@/lib/session-notes";

const COLUMNS = "id, user_id, content, source, thought_id, created_at, discussed_at";

function toNote(row: SessionNote): SessionNote {
  return { ...row, id: Number(row.id), user_id: Number(row.user_id), thought_id: row.thought_id === null ? null : Number(row.thought_id) };
}

// Open notes first (oldest first, the order they came up), then discussed ones, newest first.
export async function getSessionNotes(userId: number, status: "open" | "discussed" | "all" = "all") {
  await ensureInitialized();

  const filter =
    status === "open" ? "AND discussed_at IS NULL" : status === "discussed" ? "AND discussed_at IS NOT NULL" : "";
  const { rows } = await pool.query<SessionNote>(
    `
      SELECT ${COLUMNS}
      FROM session_notes
      WHERE user_id = $1 ${filter}
      ORDER BY (discussed_at IS NOT NULL), discussed_at DESC NULLS LAST, created_at ASC
      LIMIT $2
    `,
    [userId, SESSION_NOTE_LIMITS.list],
  );

  return rows.map(toNote);
}

// For the therapy report: everything still open, plus what was discussed inside the range.
export async function getSessionNotesForReport(userId: number, from: string, to: string) {
  await ensureInitialized();

  const { rows } = await pool.query<SessionNote>(
    `
      SELECT ${COLUMNS}
      FROM session_notes
      WHERE user_id = $1
        AND (
          discussed_at IS NULL
          OR TO_CHAR(discussed_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD') BETWEEN $2 AND $3
        )
      ORDER BY (discussed_at IS NOT NULL), created_at ASC
      LIMIT $4
    `,
    [userId, from, to, SESSION_NOTE_LIMITS.list],
  );

  return rows.map(toNote);
}

// Adds a note. The same open text (or the same thought) is not added twice: the existing note
// comes back with `created: false`.
export async function createSessionNote(input: {
  userId: number;
  content: string;
  source: SessionNoteSource;
  thoughtId?: number | null;
}): Promise<{ note: SessionNote; created: boolean } | null> {
  await ensureInitialized();

  const content = normalizeSessionNoteContent(input.content);
  if (!content) return null;

  const thoughtId = input.thoughtId ?? null;
  const existing = await pool.query<SessionNote>(
    `
      SELECT ${COLUMNS}
      FROM session_notes
      WHERE user_id = $1
        AND discussed_at IS NULL
        AND (LOWER(content) = LOWER($2) OR ($3::bigint IS NOT NULL AND thought_id = $3::bigint))
      LIMIT 1
    `,
    [input.userId, content, thoughtId],
  );

  if (existing.rows[0]) return { note: toNote(existing.rows[0]), created: false };

  const { rows } = await pool.query<SessionNote>(
    `
      INSERT INTO session_notes (user_id, content, source, thought_id)
      SELECT $1, $2, $3, $4::bigint
      WHERE $4::bigint IS NULL OR EXISTS (SELECT 1 FROM thoughts WHERE id = $4::bigint AND user_id = $1)
      RETURNING ${COLUMNS}
    `,
    [input.userId, content, input.source, thoughtId],
  );

  return rows[0] ? { note: toNote(rows[0]), created: true } : null;
}

// Changes the text and/or ticks it off (or puts it back on the open list).
export async function updateSessionNote(
  userId: number,
  id: number,
  changes: { content?: string; discussed?: boolean },
) {
  await ensureInitialized();

  const content = changes.content === undefined ? null : normalizeSessionNoteContent(changes.content);
  if (changes.content !== undefined && !content) return null;

  const { rows } = await pool.query<SessionNote>(
    `
      UPDATE session_notes
      SET content = COALESCE($3::text, content),
          discussed_at = CASE
            WHEN $4::boolean IS NULL THEN discussed_at
            WHEN $4::boolean THEN COALESCE(discussed_at, NOW())
            ELSE NULL
          END
      WHERE id = $2 AND user_id = $1
      RETURNING ${COLUMNS}
    `,
    [userId, id, content, changes.discussed ?? null],
  );

  return rows[0] ? toNote(rows[0]) : null;
}

export async function deleteSessionNote(userId: number, id: number) {
  await ensureInitialized();

  const result = await pool.query("DELETE FROM session_notes WHERE id = $1 AND user_id = $2", [id, userId]);

  return result.rowCount === 1;
}
