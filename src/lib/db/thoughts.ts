import { pool } from "@/lib/db/client";
import type { PoolClient } from "pg";
import { ensureInitialized, seedThoughts } from "@/lib/db/init";
import type {
  DeleteThought,
  NewThought,
  SetThoughtHiddenState,
  Thought,
  ThoughtActivityDay,
  ThoughtsResult,
  UpdateThought,
} from "@/lib/db/types";
import { classifyLegacyCategory, normalizeTagName } from "@/lib/thought-fields";

function getFallbackThoughts(): Thought[] {
  const now = new Date();

  return seedThoughts.map((thought, index) => ({
    id: -(index + 1),
    title: thought.title,
    category: thought.category,
    ...(() => {
      const fields = classifyLegacyCategory(thought.category, thought.tags);
      return { emotions: fields.emotions as string[], life_area: fields.lifeArea as string, trigger: fields.trigger };
    })(),
    mood: thought.mood,
    is_hidden: false,
    tags: thought.tags,
    concept_tags: [],
    summary: thought.summary,
    body: thought.body,
    linked_book_idea_id: null,
    linked_book_title: null,
    linked_idea_text: null,
    insight_reflection: null,
    user_id: null,
    created_at: new Date(now.getTime() - index * 60_000),
    updated_at: new Date(now.getTime() - index * 60_000),
  }));
}

const thoughtSelect = `
  SELECT t.id, t.title, t.category, t.emotions, t.life_area, t.trigger_text AS "trigger", t.excerpt AS summary, t.body, t.user_id, t.created_at,
         t.updated_at, t.mood, t.tags,
         t.is_hidden,
         COALESCE(
           ARRAY_AGG(DISTINCT ct.name) FILTER (WHERE ct.name IS NOT NULL),
           ARRAY[]::TEXT[]
         ) AS concept_tags,
         il.book_idea_id AS linked_book_idea_id,
         b.title AS linked_book_title,
         bi.idea_text AS linked_idea_text,
         il.reflection AS insight_reflection
  FROM thoughts t
  LEFT JOIN thought_concept_tags tct ON tct.thought_id = t.id
  LEFT JOIN concept_tags ct ON ct.id = tct.concept_tag_id
  LEFT JOIN insight_logs il ON il.thought_id = t.id
  LEFT JOIN book_ideas bi ON bi.id = il.book_idea_id
  LEFT JOIN books b ON b.id = bi.book_id
`;

async function syncThoughtInsightData(
  db: Pick<PoolClient, "query">,
  thoughtId: number,
  userId: number,
  conceptTags: string[],
  linkedBookIdeaId: number | null,
  insightReflection: string,
) {
  const normalizedConceptTags = Array.from(
    new Set(
      conceptTags
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 8);

  await db.query(
    `
      DELETE FROM thought_concept_tags
      WHERE thought_id = $1
    `,
    [thoughtId],
  );

  if (normalizedConceptTags.length > 0) {
    for (const tag of normalizedConceptTags) {
      const { rows } = await db.query<{ id: number }>(
        `
          INSERT INTO concept_tags (user_id, name)
          VALUES ($1, $2)
          ON CONFLICT (user_id, name)
          DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `,
        [userId, tag],
      );

      const conceptTagId = rows[0]?.id;

      if (conceptTagId) {
        await db.query(
          `
            INSERT INTO thought_concept_tags (thought_id, concept_tag_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `,
          [thoughtId, conceptTagId],
        );
      }
    }
  }

  const trimmedReflection = insightReflection.trim();

  if (linkedBookIdeaId || trimmedReflection) {
    await db.query(
      `
        INSERT INTO insight_logs (thought_id, book_idea_id, reflection, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (thought_id)
        DO UPDATE SET
          book_idea_id = EXCLUDED.book_idea_id,
          reflection = EXCLUDED.reflection,
          updated_at = NOW()
      `,
      [thoughtId, linkedBookIdeaId, trimmedReflection],
    );
  } else {
    await db.query(
      `
        DELETE FROM insight_logs
        WHERE thought_id = $1
      `,
      [thoughtId],
    );
  }
}

export async function getThoughts(): Promise<ThoughtsResult> {
  try {
    await ensureInitialized();

    const { rows } = await pool.query<Thought>(
      `
        ${thoughtSelect}
        GROUP BY t.id, il.book_idea_id, b.title, bi.idea_text, il.reflection
        ORDER BY t.created_at DESC, t.id DESC
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

// The thought already saved for this request id, if any (lets a retried save skip its extras).
export async function getThoughtIdByRequestId(userId: number, requestId: string) {
  await ensureInitialized();

  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM thoughts WHERE user_id = $1 AND request_id = $2 LIMIT 1`,
    [userId, requestId],
  );

  return rows[0] ? Number(rows[0].id) : null;
}

export async function createThought(input: NewThought) {
  await ensureInitialized();
  // Callers that only know the old category (routines, attention sessions, older apps) get
  // the split fields read from it.
  const legacy = classifyLegacyCategory(input.category, input.tags);
  const sentFields = input.emotions !== undefined || input.lifeArea !== undefined || input.trigger !== undefined;
  const fields = sentFields
    ? { emotions: input.emotions ?? [], lifeArea: input.lifeArea ?? "", trigger: input.trigger ?? "" }
    : legacy;
  const client = await pool.connect();
  let thoughtId: number | undefined;

  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ id: number }>(
      `
        INSERT INTO thoughts (
          title, category, mood, tags, excerpt, body, user_id, request_id, updated_at,
          emotions, life_area, trigger_text, fields_version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, 1)
        ON CONFLICT (user_id, request_id)
        WHERE request_id IS NOT NULL
        DO NOTHING
        RETURNING id
      `,
      [
        input.title,
        input.category,
        input.mood,
        input.tags,
        input.summary,
        input.body,
        input.userId,
        input.requestId ?? null,
        fields.emotions,
        fields.lifeArea,
        fields.trigger,
      ],
    );

    thoughtId = rows[0]?.id;

    if (!thoughtId && input.requestId) {
      const existing = await client.query<{ id: number }>(
        `
          SELECT id
          FROM thoughts
          WHERE user_id = $1 AND request_id = $2
          LIMIT 1
        `,
        [input.userId, input.requestId],
      );
      thoughtId = existing.rows[0]?.id;
    }

    if (!thoughtId) {
      throw new Error("Thought insert did not return an id.");
    }

    if (rows[0]?.id) {
      await syncThoughtInsightData(
        client,
        thoughtId,
        input.userId,
        input.conceptTags,
        input.linkedBookIdeaId,
        input.insightReflection,
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch((rollbackError) => {
      console.error("Failed to roll back thought transaction.", rollbackError);
    });
    throw error;
  } finally {
    client.release();
  }

  scheduleRagSync(input.userId);

  return thoughtId;
}

export async function getThoughtsByUser(
  userId: number,
  limit = 24,
  visibility: "active" | "hidden" | "all" = "all",
) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 24;

  return queryThoughtsByUser(userId, visibility, safeLimit);
}

// Every thought, with no row cap. For whole-archive work (RAG sync, backup) where a
// truncated list would silently drop older entries.
export async function getAllThoughtsByUser(
  userId: number,
  visibility: "active" | "hidden" | "all" = "all",
) {
  return queryThoughtsByUser(userId, visibility, null);
}

async function queryThoughtsByUser(
  userId: number,
  visibility: "active" | "hidden" | "all",
  limit: number | null,
) {
  await ensureInitialized();
  const visibilityClause =
    visibility === "active"
      ? "AND t.is_hidden = false"
      : visibility === "hidden"
        ? "AND t.is_hidden = true"
        : "";

  const { rows } = await pool.query<Thought>(
      `
        ${thoughtSelect}
      WHERE t.user_id = $1
        ${visibilityClause}
      GROUP BY t.id, il.book_idea_id, b.title, bi.idea_text, il.reflection
      ORDER BY t.created_at DESC, t.id DESC
      ${limit === null ? "" : "LIMIT $2"}
    `,
    limit === null ? [userId] : [userId, limit],
  );

  return rows;
}

export async function getThoughtByIdForUser(thoughtId: number, userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<Thought>(
      `
        ${thoughtSelect}
      WHERE t.id = $1
        AND t.user_id = $2
      GROUP BY t.id, il.book_idea_id, b.title, bi.idea_text, il.reflection
      LIMIT 1
    `,
    [thoughtId, userId],
  );

  return rows[0] ?? null;
}

export async function getThoughtsByUserAndDate(userId: number, date: string) {
  await ensureInitialized();

  const { rows } = await pool.query<Thought>(
      `
        ${thoughtSelect}
      WHERE t.user_id = $1
        AND (t.created_at AT TIME ZONE 'Asia/Colombo')::date = $2::date
      GROUP BY t.id, il.book_idea_id, b.title, bi.idea_text, il.reflection
      ORDER BY t.created_at ASC, t.id ASC
    `,
    [userId, date],
  );

  return rows;
}

export async function getThoughtActivityByUserMonth(userId: number, month: string) {
  await ensureInitialized();

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

export async function getThoughtsByUserMonth(userId: number, month: string) {
  await ensureInitialized();

  const { rows } = await pool.query<Thought>(
      `
        ${thoughtSelect}
      WHERE t.user_id = $1
        AND TO_CHAR(t.created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM') = $2
      GROUP BY t.id, il.book_idea_id, b.title, bi.idea_text, il.reflection
      ORDER BY t.created_at ASC, t.id ASC
    `,
    [userId, month],
  );

  return rows;
}

export async function updateThought(input: UpdateThought) {
  await ensureInitialized();
  const client = await pool.connect();
  let updated = false;

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        UPDATE thoughts
        SET title = $1,
            category = $2,
            mood = $3,
            tags = $4,
            excerpt = $5,
            body = $6,
            emotions = COALESCE($9::text[], emotions),
            life_area = COALESCE($10::text, life_area),
            trigger_text = COALESCE($11::text, trigger_text),
            fields_version = 1,
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
        input.emotions ?? null,
        input.lifeArea ?? null,
        input.trigger ?? null,
      ],
    );

    updated = result.rowCount === 1;

    if (updated) {
      await syncThoughtInsightData(
        client,
        input.id,
        input.userId,
        input.conceptTags,
        input.linkedBookIdeaId,
        input.insightReflection,
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch((rollbackError) => {
      console.error("Failed to roll back thought update transaction.", rollbackError);
    });
    throw error;
  } finally {
    client.release();
  }

  if (updated) {
    scheduleRagSync(input.userId);
  }

  return updated;
}

export async function deleteThought(input: DeleteThought) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      DELETE FROM thoughts
      WHERE id = $1
        AND user_id = $2
    `,
    [input.id, input.userId],
  );

  if (rowCount === 1) {
    // Remove the thought's searchable text now; the sync then rebuilds that day's rollup.
    await removeThoughtFromRagIndex(input.userId, input.id);
    scheduleRagSync(input.userId);
  }

  return rowCount === 1;
}

export async function setThoughtHiddenState(input: SetThoughtHiddenState) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      UPDATE thoughts
      SET is_hidden = $1,
          updated_at = NOW()
      WHERE id = $2
        AND user_id = $3
    `,
    [input.isHidden, input.id, input.userId],
  );

  if (rowCount === 1) {
    if (input.isHidden) {
      await removeThoughtFromRagIndex(input.userId, input.id);
    }
    // Rebuilds the daily rollup, which lists thought titles and tags for that day.
    scheduleRagSync(input.userId);
  }

  return rowCount === 1;
}

async function removeThoughtFromRagIndex(userId: number, thoughtId: number) {
  const documentKey = `thought:${thoughtId}`;
  await pool.query(
    `DELETE FROM embeddings WHERE user_id = $1 AND document_key = $2`,
    [userId, documentKey],
  );
  await pool.query(
    `DELETE FROM rag_documents WHERE user_id = $1 AND document_key = $2`,
    [userId, documentKey],
  );
}

// Fire-and-forget so the request isn't blocked waiting for embeddings.
function scheduleRagSync(userId: number) {
  import("./rag")
    .then((mod) => mod.syncRagDocumentsForUser(userId))
    .catch((e) => {
      console.error("RAG sync failed:", e);
    });
}

// Every tag on the user's thoughts with how many thoughts carry it, most used first.
export async function getTagCounts(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<{ tag: string; count: number }>(
    `
      SELECT tag, COUNT(*)::int AS count
      FROM thoughts, unnest(tags) AS tag
      WHERE user_id = $1
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `,
    [userId],
  );

  return rows;
}

// Old triggers the user has named, most used first, to offer as suggestions.
export async function getTriggerCounts(userId: number, limit = 12) {
  await ensureInitialized();

  const { rows } = await pool.query<{ trigger: string; count: number }>(
    `
      SELECT MIN(trigger_text) AS "trigger", COUNT(*)::int AS count
      FROM thoughts
      WHERE user_id = $1 AND trigger_text <> ''
      GROUP BY LOWER(trigger_text)
      ORDER BY count DESC, "trigger" ASC
      LIMIT $2
    `,
    [userId, limit],
  );

  return rows;
}

// Renames a tag on every thought; if the new name is already there the two merge. Returns how
// many thoughts changed.
export async function mergeTag(userId: number, from: string, to: string) {
  await ensureInitialized();

  const source = normalizeTagName(from);
  const target = normalizeTagName(to);

  if (!source || !target || source === target) return 0;

  const result = await pool.query(
    `
      UPDATE thoughts
      SET tags = ARRAY(
            SELECT tag FROM (
              SELECT DISTINCT ON (tag) tag, position
              FROM unnest(array_replace(tags, $2, $3)) WITH ORDINALITY AS item(tag, position)
              ORDER BY tag, position
            ) merged
            ORDER BY position
          ),
          updated_at = NOW()
      WHERE user_id = $1 AND $2 = ANY(tags)
    `,
    [userId, source, target],
  );

  if ((result.rowCount ?? 0) > 0) scheduleRagSync(userId);

  return result.rowCount ?? 0;
}
