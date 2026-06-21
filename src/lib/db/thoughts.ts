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
    summary: thought.summary,
    body: thought.body,
    user_id: null,
    created_at: new Date(now.getTime() - index * 60_000),
    updated_at: new Date(now.getTime() - index * 60_000),
  }));
}

export async function getThoughts(): Promise<ThoughtsResult> {
  try {
    await ensureInitialized();

    const { rows } = await pool.query<Thought>(
      `
        SELECT id, title, category, excerpt AS summary, body, user_id, created_at
             , updated_at, mood, tags
        FROM thoughts
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

  await pool.query(
    `
      INSERT INTO thoughts (title, category, mood, tags, excerpt, body, user_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `,
    [input.title, input.category, input.mood, input.tags, input.summary, input.body, input.userId],
  );
}

export async function getThoughtsByUser(userId: number) {
  await ensureInitialized();

  const { rows } = await pool.query<Thought>(
    `
      SELECT id, title, category, excerpt AS summary, body, user_id, created_at
           , updated_at, mood, tags
      FROM thoughts
      WHERE user_id = $1
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
      SELECT id, title, category, excerpt AS summary, body, user_id, created_at
           , updated_at, mood, tags
      FROM thoughts
      WHERE id = $1
        AND user_id = $2
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
      SELECT id, title, category, excerpt AS summary, body, user_id, created_at
           , updated_at, mood, tags
      FROM thoughts
      WHERE user_id = $1
        AND (created_at AT TIME ZONE 'Asia/Colombo')::date = $2::date
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
