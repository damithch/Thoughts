import { pool } from "@/lib/db/client";
import { getBehaviouralActivationEntriesByUser } from "@/lib/db/activation";
import { getConversationSummariesByUser } from "@/lib/db/conversations";
import { ensureInitialized } from "@/lib/db/init";
import { getBookIdeasByUser } from "@/lib/db/insights";
import {
  getDailyCheckInsByUserMonth,
  getDayRecordsByUserMonth,
  getTasksByUserMonth,
} from "@/lib/db/tasks";
import { getThoughtsByUser } from "@/lib/db/thoughts";
import { toColomboExportParts } from "@/lib/time";
import type {
  BehaviouralActivationEntry,
  BookIdea,
  ConversationSummary,
  DailyCheckIn,
  DayRecord,
  RagDocument,
  RagDocumentKind,
  RagDocumentUpsertInput,
  TaskItem,
  Thought,
} from "@/lib/db/types";

type RagMaterializedDocument = {
  documentKey: string;
  documentKind: RagDocumentKind;
  sourceEntityId: string;
  sourceDate: string | null;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  sourceUpdatedAt: Date;
};

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function formatOptionalList(title: string, values: string[]) {
  if (values.length === 0) {
    return "";
  }

  return `${title}: ${values.join(", ")}`;
}

function moodAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function latestDate(dates: Date[]) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function buildThoughtDocument(thought: Thought): RagMaterializedDocument {
  const createdDate = toColomboExportParts(thought.created_at).date;
  const contentParts = [
    `Title: ${thought.title}`,
    `Category: ${thought.category}`,
    `Mood: ${thought.mood}/10`,
    formatOptionalList("Tags", thought.tags),
    formatOptionalList("Concept tags", thought.concept_tags),
    thought.linked_book_title || thought.linked_idea_text
      ? `Linked idea: ${[thought.linked_book_title, thought.linked_idea_text]
          .filter(Boolean)
          .join(" - ")}`
      : "",
    `Summary: ${thought.summary}`,
    thought.insight_reflection ? `Insight reflection: ${thought.insight_reflection}` : "",
    thought.body ? `Full note: ${thought.body}` : "",
  ].filter(Boolean);

  return {
    documentKey: `thought:${thought.id}`,
    documentKind: "thought",
    sourceEntityId: String(thought.id),
    sourceDate: createdDate,
    title: thought.title,
    content: contentParts.join("\n\n"),
    metadata: {
      category: thought.category,
      mood: thought.mood,
      tags: thought.tags,
      concept_tags: thought.concept_tags,
      linked_book_idea_id: thought.linked_book_idea_id,
      linked_book_title: thought.linked_book_title,
      linked_idea_text: thought.linked_idea_text,
      created_date: createdDate,
    },
    sourceUpdatedAt: thought.updated_at,
  };
}

function buildBookIdeaDocument(bookIdea: BookIdea): RagMaterializedDocument {
  const createdDate = toColomboExportParts(bookIdea.created_at).date;
  const contentParts = [
    `Source: ${bookIdea.book_title}`,
    bookIdea.book_author ? `Author: ${bookIdea.book_author}` : "",
    `Source type: ${bookIdea.source_type}`,
    `Status: ${bookIdea.status}`,
    `Idea: ${bookIdea.idea_text}`,
  ].filter(Boolean);

  return {
    documentKey: `book_idea:${bookIdea.id}`,
    documentKind: "book_idea",
    sourceEntityId: String(bookIdea.id),
    sourceDate: createdDate,
    title: `${bookIdea.book_title} idea`,
    content: contentParts.join("\n\n"),
    metadata: {
      book_id: bookIdea.book_id,
      book_title: bookIdea.book_title,
      book_author: bookIdea.book_author,
      source_type: bookIdea.source_type,
      status: bookIdea.status,
      created_date: createdDate,
    },
    sourceUpdatedAt: bookIdea.updated_at,
  };
}

function buildConversationDocument(
  conversation: ConversationSummary,
): RagMaterializedDocument {
  const contentParts = [
    `Title: ${conversation.title}`,
    `Conversation date: ${conversation.conversation_date}`,
    formatOptionalList("Key topics", conversation.key_topics),
    `Insights: ${conversation.insights}`,
    formatOptionalList("Action items", conversation.action_items),
    conversation.mood_context === null
      ? ""
      : `Mood context: ${conversation.mood_context}/10`,
  ].filter(Boolean);

  return {
    documentKey: `conversation_summary:${conversation.id}`,
    documentKind: "conversation_summary",
    sourceEntityId: String(conversation.id),
    sourceDate: conversation.conversation_date,
    title: conversation.title,
    content: contentParts.join("\n\n"),
    metadata: {
      conversation_date: conversation.conversation_date,
      key_topics: conversation.key_topics,
      action_items: conversation.action_items,
      mood_context: conversation.mood_context,
    },
    sourceUpdatedAt: conversation.created_at,
  };
}

function buildBehaviouralActivationDocument(
  entry: BehaviouralActivationEntry,
): RagMaterializedDocument {
  const contentParts = [
    `Activity: ${entry.activity}`,
    `Entry date: ${entry.entry_date}`,
    `Status: ${entry.status}`,
    `Before ratings: depression ${entry.before_depression ?? "-"}, pleasure ${entry.before_pleasure ?? "-"}, achievement ${entry.before_achievement ?? "-"}`,
    `After ratings: depression ${entry.after_depression ?? "-"}, pleasure ${entry.after_pleasure ?? "-"}, achievement ${entry.after_achievement ?? "-"}`,
  ];

  return {
    documentKey: `ba_entry:${entry.id}`,
    documentKind: "ba_entry",
    sourceEntityId: String(entry.id),
    sourceDate: entry.entry_date,
    title: entry.activity,
    content: contentParts.join("\n\n"),
    metadata: {
      entry_date: entry.entry_date,
      status: entry.status,
      before_depression: entry.before_depression,
      before_pleasure: entry.before_pleasure,
      before_achievement: entry.before_achievement,
      after_depression: entry.after_depression,
      after_pleasure: entry.after_pleasure,
      after_achievement: entry.after_achievement,
    },
    sourceUpdatedAt: entry.updated_at,
  };
}

function buildDayNoteDocument(dayNote: DayRecord): RagMaterializedDocument {
  const contentParts = [
    `Date: ${dayNote.entry_date}`,
    dayNote.intention ? `Intention: ${dayNote.intention}` : "",
    dayNote.note ? `Reflection: ${dayNote.note}` : "",
    dayNote.end_of_day_mood === null
      ? ""
      : `End of day mood: ${dayNote.end_of_day_mood}/10`,
  ].filter(Boolean);

  return {
    documentKey: `day_note:${dayNote.entry_date}`,
    documentKind: "day_note",
    sourceEntityId: dayNote.entry_date,
    sourceDate: dayNote.entry_date,
    title: `Day note ${dayNote.entry_date}`,
    content: contentParts.join("\n\n"),
    metadata: {
      entry_date: dayNote.entry_date,
      end_of_day_mood: dayNote.end_of_day_mood,
    },
    sourceUpdatedAt: dayNote.updated_at,
  };
}

function buildDailyRollupDocuments(input: {
  thoughts: Thought[];
  tasks: TaskItem[];
  checkIns: DailyCheckIn[];
  dayNotes: DayRecord[];
  conversations: ConversationSummary[];
  activationEntries: BehaviouralActivationEntry[];
}) {
  const dates = new Set<string>();

  for (const thought of input.thoughts) {
    dates.add(toColomboExportParts(thought.created_at).date);
  }

  for (const task of input.tasks) {
    dates.add(task.scheduled_date);
  }

  for (const checkIn of input.checkIns) {
    dates.add(checkIn.entry_date);
  }

  for (const dayNote of input.dayNotes) {
    dates.add(dayNote.entry_date);
  }

  for (const conversation of input.conversations) {
    dates.add(conversation.conversation_date);
  }

  for (const entry of input.activationEntries) {
    dates.add(entry.entry_date);
  }

  return Array.from(dates)
    .sort()
    .map((date): RagMaterializedDocument => {
      const dayThoughts = input.thoughts.filter(
        (thought) => toColomboExportParts(thought.created_at).date === date,
      );
      const dayTasks = input.tasks.filter((task) => task.scheduled_date === date);
      const dayCheckIns = input.checkIns.filter((checkIn) => checkIn.entry_date === date);
      const dayNote = input.dayNotes.find((note) => note.entry_date === date) ?? null;
      const dayConversations = input.conversations.filter(
        (conversation) => conversation.conversation_date === date,
      );
      const dayActivationEntries = input.activationEntries.filter(
        (entry) => entry.entry_date === date,
      );
      const dayMoodValues = [
        ...dayThoughts.map((thought) => thought.mood),
        ...dayCheckIns.map((checkIn) => checkIn.mood),
        ...(dayNote?.end_of_day_mood === null || !dayNote ? [] : [dayNote.end_of_day_mood]),
      ];
      const recurringTags = uniqueStrings(
        dayThoughts.flatMap((thought) => thought.tags),
      );
      const conceptTags = uniqueStrings(
        dayThoughts.flatMap((thought) => thought.concept_tags),
      );
      const taskSummary = {
        total: dayTasks.length,
        done: dayTasks.filter((task) => task.status === "done").length,
        in_progress: dayTasks.filter((task) => task.status === "in_progress").length,
        todo: dayTasks.filter((task) => task.status === "todo").length,
        skipped: dayTasks.filter((task) => task.status === "skipped").length,
      };
      const contentParts = [
        `Date: ${date}`,
        `Thought count: ${dayThoughts.length}`,
        `Task count: ${taskSummary.total}`,
        `Check-in count: ${dayCheckIns.length}`,
        `Conversation log count: ${dayConversations.length}`,
        `Behavioural activation entry count: ${dayActivationEntries.length}`,
        moodAverage(dayMoodValues) === null
          ? ""
          : `Average mood: ${moodAverage(dayMoodValues)}/10`,
        formatOptionalList(
          "Thought titles",
          dayThoughts.slice(0, 6).map((thought) => thought.title),
        ),
        formatOptionalList(
          "Completed tasks",
          dayTasks.filter((task) => task.status === "done").map((task) => task.title),
        ),
        formatOptionalList(
          "Open tasks",
          dayTasks
            .filter((task) => task.status === "todo" || task.status === "in_progress")
            .map((task) => task.title),
        ),
        formatOptionalList("Recurring tags", recurringTags),
        formatOptionalList("Concept tags", conceptTags),
        dayNote?.intention ? `Day intention: ${dayNote.intention}` : "",
        dayNote?.note ? `Day reflection: ${dayNote.note}` : "",
        formatOptionalList(
          "Conversation titles",
          dayConversations.map((conversation) => conversation.title),
        ),
        formatOptionalList(
          "Behavioural activation activities",
          dayActivationEntries.map((entry) => entry.activity),
        ),
      ].filter(Boolean);
      const sourceDates = [
        ...dayThoughts.map((thought) => thought.updated_at),
        ...dayTasks.map((task) => task.updated_at),
        ...dayCheckIns.map((checkIn) => checkIn.created_at),
        ...dayConversations.map((conversation) => conversation.created_at),
        ...dayActivationEntries.map((entry) => entry.updated_at),
        ...(dayNote ? [dayNote.updated_at] : []),
      ];

      return {
        documentKey: `daily_rollup:${date}`,
        documentKind: "daily_rollup",
        sourceEntityId: date,
        sourceDate: date,
        title: `Daily rollup ${date}`,
        content: contentParts.join("\n\n"),
        metadata: {
          date,
          average_mood: moodAverage(dayMoodValues),
          recurring_tags: recurringTags,
          concept_tags: conceptTags,
          thought_ids: dayThoughts.map((thought) => thought.id),
          task_ids: dayTasks.map((task) => task.id),
          check_in_ids: dayCheckIns.map((checkIn) => checkIn.id),
          conversation_ids: dayConversations.map((conversation) => conversation.id),
          activation_entry_ids: dayActivationEntries.map((entry) => entry.id),
          task_summary: taskSummary,
        },
        sourceUpdatedAt: latestDate(sourceDates),
      };
    });
}

async function upsertRagDocument(input: RagDocumentUpsertInput) {
  await pool.query(
    `
      INSERT INTO rag_documents (
        user_id,
        document_key,
        document_kind,
        source_entity_id,
        source_date,
        title,
        content,
        metadata,
        source_updated_at,
        indexed_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8::jsonb, $9, NOW(), NOW())
      ON CONFLICT (user_id, document_key)
      DO UPDATE SET
        document_kind = EXCLUDED.document_kind,
        source_entity_id = EXCLUDED.source_entity_id,
        source_date = EXCLUDED.source_date,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        source_updated_at = EXCLUDED.source_updated_at,
        indexed_at = NOW(),
        updated_at = NOW()
    `,
    [
      input.userId,
      input.documentKey,
      input.documentKind,
      input.sourceEntityId,
      input.sourceDate,
      input.title,
      input.content,
      JSON.stringify(input.metadata),
      input.sourceUpdatedAt,
    ],
  );
}

async function getUserActiveMonths(userId: number) {
  const { rows } = await pool.query<{ month: string }>(
    `
      SELECT DISTINCT month
      FROM (
        SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM') AS month
        FROM thoughts
        WHERE user_id = $1

        UNION

        SELECT TO_CHAR(conversation_date, 'YYYY-MM') AS month
        FROM conversation_summaries
        WHERE user_id = $1

        UNION

        SELECT TO_CHAR(entry_date, 'YYYY-MM') AS month
        FROM behavioural_activation_entries
        WHERE user_id = $1

        UNION

        SELECT TO_CHAR(entry_date, 'YYYY-MM') AS month
        FROM daily_task_notes
        WHERE user_id = $1

        UNION

        SELECT TO_CHAR(scheduled_date, 'YYYY-MM') AS month
        FROM daily_tasks
        WHERE user_id = $1

        UNION

        SELECT TO_CHAR(entry_date, 'YYYY-MM') AS month
        FROM daily_check_ins
        WHERE user_id = $1
      ) source_months
      WHERE month IS NOT NULL
      ORDER BY month ASC
    `,
    [userId],
  );

  return rows.map((row) => row.month);
}

export async function syncRagDocumentsForUser(userId: number) {
  await ensureInitialized();

  const thoughts = await getThoughtsByUser(userId, 1000);
  const bookIdeas = await getBookIdeasByUser(userId);
  const conversations = await getConversationSummariesByUser(userId, 1000);
  const activationEntries = await getBehaviouralActivationEntriesByUser(userId);
  const months = await getUserActiveMonths(userId);
  const dayNotes: DayRecord[] = [];
  const tasks: TaskItem[] = [];
  const checkIns: DailyCheckIn[] = [];

  for (const month of months) {
    const [monthDayNotes, monthTasks, monthCheckIns] = await Promise.all([
      getDayRecordsByUserMonth(userId, month),
      getTasksByUserMonth(userId, month),
      getDailyCheckInsByUserMonth(userId, month),
    ]);

    dayNotes.push(...monthDayNotes);
    tasks.push(...monthTasks);
    checkIns.push(...monthCheckIns);
  }

  const materialized = [
    ...thoughts.map(buildThoughtDocument),
    ...bookIdeas.map(buildBookIdeaDocument),
    ...conversations.map(buildConversationDocument),
    ...activationEntries.map(buildBehaviouralActivationDocument),
    ...dayNotes.map(buildDayNoteDocument),
    ...buildDailyRollupDocuments({
      thoughts,
      tasks,
      checkIns,
      dayNotes,
      conversations,
      activationEntries,
    }),
  ];

  for (const document of materialized) {
    await upsertRagDocument({
      ...document,
      userId,
    });
  }

  const keys = materialized.map((document) => document.documentKey);

  if (keys.length > 0) {
    await pool.query(
      `
        DELETE FROM rag_documents
        WHERE user_id = $1
          AND document_key <> ALL($2::text[])
      `,
      [userId, keys],
    );
  } else {
    await pool.query(
      `
        DELETE FROM rag_documents
        WHERE user_id = $1
      `,
      [userId],
    );
  }

  return {
    count: materialized.length,
    documentKinds: Array.from(new Set(materialized.map((document) => document.documentKind))),
  };
}

export async function getRagDocumentsByUser(
  userId: number,
  options?: {
    kind?: RagDocumentKind | null;
    date?: string | null;
    limit?: number;
  },
) {
  await ensureInitialized();

  const clauses = ["user_id = $1"];
  const values: unknown[] = [userId];

  if (options?.kind) {
    values.push(options.kind);
    clauses.push(`document_kind = $${values.length}`);
  }

  if (options?.date) {
    values.push(options.date);
    clauses.push(`source_date = $${values.length}::date`);
  }

  const safeLimit =
    Number.isInteger(options?.limit) && (options?.limit ?? 0) > 0
      ? Math.min(options?.limit ?? 50, 200)
      : 50;
  values.push(safeLimit);

  const { rows } = await pool.query<RagDocument>(
    `
      SELECT id,
             user_id,
             document_key,
             document_kind,
             source_entity_id,
             TO_CHAR(source_date, 'YYYY-MM-DD') AS source_date,
             title,
             content,
             metadata,
             source_updated_at,
             indexed_at,
             created_at,
             updated_at
      FROM rag_documents
      WHERE ${clauses.join(" AND ")}
      ORDER BY source_updated_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return rows;
}
