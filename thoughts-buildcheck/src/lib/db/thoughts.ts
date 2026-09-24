import { pool } from "@/lib/db/client";
import { ensureInitialized, seedThoughts } from "@/lib/db/init";
import type {
  DeleteThought,
  NewThought,
  Thought,
  ThoughtActivityDay,
  ThoughtsResult,
  UpdateThought,
} from "@/lib/db/types";

function getFallbackThoughts(): Thought[] {
  const now = new Date();

  return seedThoughts.map((thought, index) => ({
    id: -(index + 1),
    title: thought.title,
    category: thought.category,
    mood: thought.mood,
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
  SELECT t.id, t.title, t.category, t.excerpt AS summary, t.body, t.user_id, t.created_at,
         t.updated_at, t.mood, t.tags,
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

  await pool.query(
    `
      DELETE FROM thought_concept_tags
      WHERE thought_id = $1
    `,
    [thoughtId],
  );

  if (normalizedConceptTags.length > 0) {
    for (const tag of normalizedConceptTags) {
      const { rows } = await pool.query<{ id: number }>(
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
        await pool.query(
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
    await pool.query(
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
    await pool.query(
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
        ORDER BY created_at DESC, id DESC
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

export async function createThought(input: NewThought) {
  await ensureInitialized();

  const { rows } = await pool.query<{ id: number }>(
    `
      INSERT INTO thoughts (title, category, mood, tags, excerpt, body, user_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `,
    [input.title, input.category, input.mood, input.tags, input.summary, input.body, input.userId],
  );

  const thoughtId = rows[0]?.id;

  if (thoughtId) {
    await syncThoughtInsightData(
      thoughtId,
      input.userId,
      input.conceptTags,
      input.linkedBookIdeaId,
      input.insightReflection,
    );
  }
}

export async function getThoughtsByUser(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<Thought>(
      `
        ${thoughtSelect}
      WHERE user_id = $1
      GROUP BY t.id, il.book_idea_id, b.title, bi.idea_text, il.reflection
      ORDER BY created_at DESC, id DESC
      LIMIT 24
    `,
    [userId],
  );

  return rows;
}

export async function getThoughtByIdForUser(thoughtId: number, userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<Thought>(
      `
        ${thoughtSelect}
      WHERE id = $1
        AND user_id = $2
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
      WHERE user_id = $1
        AND (created_at AT TIME ZONE 'Asia/Colombo')::date = $2::date
      GROUP BY t.id, il.book_idea_id, b.title, bi.idea_text, il.reflection
      ORDER BY created_at ASC, id ASC
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
      WHERE user_id = $1
        AND TO_CHAR(created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM') = $2
      GROUP BY t.id, il.book_idea_id, b.title, bi.idea_text, il.reflection
      ORDER BY created_at ASC, id ASC
    `,
    [userId, month],
  );

  return rows;
}

export async function updateThought(input: UpdateThought) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      UPDATE thoughts
      SET title = $1,
          category = $2,
          mood = $3,
          tags = $4,
          excerpt = $5,
          body = $6,
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
    ],
  );

  if (rowCount === 1) {
    await syncThoughtInsightData(
      input.id,
      input.userId,
      input.conceptTags,
      input.linkedBookIdeaId,
      input.insightReflection,
    );
  }

  return rowCount === 1;
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

  return rowCount === 1;
}
