import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type { ConversationSummary, NewConversationSummary } from "@/lib/db/types";

export async function createConversationSummary(input: NewConversationSummary) {
  await ensureInitialized();

  const { rows } = await pool.query<ConversationSummary>(
    `
      INSERT INTO conversation_summaries (
        user_id,
        conversation_date,
        title,
        key_topics,
        insights,
        action_items,
        mood_context
      )
      VALUES ($1, $2::date, $3, $4, $5, $6, $7)
      RETURNING id, user_id,
                TO_CHAR(conversation_date, 'YYYY-MM-DD') AS conversation_date,
                title, key_topics, insights, action_items, mood_context, created_at
    `,
    [
      input.userId,
      input.conversationDate,
      input.title,
      input.keyTopics,
      input.insights,
      input.actionItems,
      input.moodContext,
    ],
  );

  return rows[0] ?? null;
}

export async function getConversationSummariesByUser(userId: number, limit = 12) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 12;

  return queryConversationSummariesByUser(userId, safeLimit);
}

// Every conversation summary, with no row cap. For whole-archive work (RAG sync) where a
// truncated list would silently drop older entries.
export async function getAllConversationSummariesByUser(userId: number) {
  return queryConversationSummariesByUser(userId, null);
}

async function queryConversationSummariesByUser(userId: number, limit: number | null) {
  await ensureInitialized();

  const { rows } = await pool.query<ConversationSummary>(
    `
      SELECT id, user_id,
             TO_CHAR(conversation_date, 'YYYY-MM-DD') AS conversation_date,
             title, key_topics, insights, action_items, mood_context, created_at
      FROM conversation_summaries
      WHERE user_id = $1
      ORDER BY conversation_date DESC, created_at DESC, id DESC
      ${limit === null ? "" : "LIMIT $2"}
    `,
    limit === null ? [userId] : [userId, limit],
  );

  return rows;
}

export async function getConversationSummariesByUserAndDate(userId: number, date: string) {
  await ensureInitialized();

  const { rows } = await pool.query<ConversationSummary>(
    `
      SELECT id, user_id,
             TO_CHAR(conversation_date, 'YYYY-MM-DD') AS conversation_date,
             title, key_topics, insights, action_items, mood_context, created_at
      FROM conversation_summaries
      WHERE user_id = $1
        AND conversation_date = $2::date
      ORDER BY created_at ASC, id ASC
    `,
    [userId, date],
  );

  return rows;
}

export async function getConversationSummariesByUserMonth(userId: number, month: string) {
  await ensureInitialized();

  const { rows } = await pool.query<ConversationSummary>(
    `
      SELECT id, user_id,
             TO_CHAR(conversation_date, 'YYYY-MM-DD') AS conversation_date,
             title, key_topics, insights, action_items, mood_context, created_at
      FROM conversation_summaries
      WHERE user_id = $1
        AND TO_CHAR(conversation_date, 'YYYY-MM') = $2
      ORDER BY conversation_date ASC, created_at ASC, id ASC
    `,
    [userId, month],
  );

  return rows;
}

export async function deleteConversationSummary(id: number, userId: number) {
  await ensureInitialized();

  const { rowCount } = await pool.query(
    `
      DELETE FROM conversation_summaries
      WHERE id = $1
        AND user_id = $2
    `,
    [id, userId],
  );

  return rowCount === 1;
}
