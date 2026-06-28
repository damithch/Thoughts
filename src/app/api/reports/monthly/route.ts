import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  getConversationSummariesByUserMonth,
  getDailyCheckInsByUserMonth,
  getDayRecordsByUserMonth,
  getTaskCompletionStatsForMonth,
  getTasksByUserMonth,
  getThoughtsByUserMonth,
} from "@/lib/db";
import { toColomboExportParts } from "@/lib/time";

type MonthlyThought = Awaited<ReturnType<typeof getThoughtsByUserMonth>>[number];
type MonthlyTask = Awaited<ReturnType<typeof getTasksByUserMonth>>[number];
type MonthlyCheckIn = Awaited<ReturnType<typeof getDailyCheckInsByUserMonth>>[number];
type MonthlyDayNote = Awaited<ReturnType<typeof getDayRecordsByUserMonth>>[number];
type MonthlyConversationSummary = Awaited<ReturnType<typeof getConversationSummariesByUserMonth>>[number];

function buildTaskProgress(tasks: MonthlyTask[]) {
  const summary = {
    total: tasks.length,
    todo: 0,
    in_progress: 0,
    done: 0,
    skipped: 0,
    completion_rate: 0,
  };

  for (const task of tasks) {
    if (task.status === "todo") {
      summary.todo += 1;
    } else if (task.status === "in_progress") {
      summary.in_progress += 1;
    } else if (task.status === "done") {
      summary.done += 1;
    } else if (task.status === "skipped") {
      summary.skipped += 1;
    }
  }

  summary.completion_rate =
    summary.total === 0 ? 0 : Number(((summary.done / summary.total) * 100).toFixed(1));

  return summary;
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? "";

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return new NextResponse("Invalid month.", { status: 400 });
  }

  try {
    const [thoughts, tasks, checkIns, dayNotes, completionStats, conversationLogs] = await Promise.all([
      getThoughtsByUserMonth(currentUser.id, month),
      getTasksByUserMonth(currentUser.id, month),
      getDailyCheckInsByUserMonth(currentUser.id, month),
      getDayRecordsByUserMonth(currentUser.id, month),
      getTaskCompletionStatsForMonth(currentUser.id, month),
      getConversationSummariesByUserMonth(currentUser.id, month),
    ]);

    const thoughtsPayload = thoughts.map((thought: MonthlyThought) => {
      const createdAt = toColomboExportParts(thought.created_at);
      const updatedAt = toColomboExportParts(thought.updated_at);

      return {
        id: thought.id,
        user_id: thought.user_id,
        title: thought.title,
        category: thought.category,
        mood: thought.mood,
        tags: thought.tags,
        concept_tags: thought.concept_tags,
        linked_book_idea_id: thought.linked_book_idea_id,
        linked_book_title: thought.linked_book_title,
        linked_idea_text: thought.linked_idea_text,
        insight_reflection: thought.insight_reflection,
        summary: thought.summary,
        full_note: thought.body,
        content: thought.summary,
        created_at: createdAt.localIso,
        created_at_utc: createdAt.isoUtc,
        created_date: createdAt.date,
        created_time: createdAt.time,
        updated_at: updatedAt.localIso,
        updated_at_utc: updatedAt.isoUtc,
        updated_date: updatedAt.date,
        updated_time: updatedAt.time,
      };
    });

    const tasksPayload = tasks.map((task: MonthlyTask) => {
      const createdAt = toColomboExportParts(task.created_at);
      const updatedAt = toColomboExportParts(task.updated_at);
      const startedAt = task.started_at ? toColomboExportParts(task.started_at) : null;
      const completedAt = task.completed_at ? toColomboExportParts(task.completed_at) : null;

      return {
        id: task.id,
        user_id: task.user_id,
        recurring_task_id: task.recurring_task_id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        tags: task.tags,
        note: task.note,
        scheduled_date: task.scheduled_date,
        created_at: createdAt.localIso,
        created_at_utc: createdAt.isoUtc,
        created_date: createdAt.date,
        created_time: createdAt.time,
        updated_at: updatedAt.localIso,
        updated_at_utc: updatedAt.isoUtc,
        updated_date: updatedAt.date,
        updated_time: updatedAt.time,
        started_at: startedAt?.localIso ?? null,
        started_at_utc: startedAt?.isoUtc ?? null,
        started_date: startedAt?.date ?? null,
        started_time: startedAt?.time ?? null,
        completed_at: completedAt?.localIso ?? null,
        completed_at_utc: completedAt?.isoUtc ?? null,
        completed_date: completedAt?.date ?? null,
        completed_time: completedAt?.time ?? null,
      };
    });

    const checkInsPayload = checkIns.map((checkIn: MonthlyCheckIn) => {
      const createdAt = toColomboExportParts(checkIn.created_at);

      return {
        id: checkIn.id,
        user_id: checkIn.user_id,
        entry_date: checkIn.entry_date,
        mood: checkIn.mood,
        energy: checkIn.energy,
        focus: checkIn.focus,
        note: checkIn.note,
        created_at: createdAt.localIso,
        created_at_utc: createdAt.isoUtc,
        created_date: createdAt.date,
        created_time: createdAt.time,
      };
    });

    const dayNotesPayload = dayNotes.map((dayNote: MonthlyDayNote) => {
      const createdAt = toColomboExportParts(dayNote.created_at);
      const updatedAt = toColomboExportParts(dayNote.updated_at);

      return {
        id: dayNote.id,
        user_id: dayNote.user_id,
        entry_date: dayNote.entry_date,
        intention: dayNote.intention,
        note: dayNote.note,
        end_of_day_mood: dayNote.end_of_day_mood,
        created_at: createdAt.localIso,
        created_at_utc: createdAt.isoUtc,
        created_date: createdAt.date,
        created_time: createdAt.time,
        updated_at: updatedAt.localIso,
        updated_at_utc: updatedAt.isoUtc,
        updated_date: updatedAt.date,
        updated_time: updatedAt.time,
      };
    });

    const conversationLogsPayload = conversationLogs.map((summary: MonthlyConversationSummary) => {
      const createdAt = toColomboExportParts(summary.created_at);

      return {
        id: summary.id,
        user_id: summary.user_id,
        conversation_date: summary.conversation_date,
        title: summary.title,
        key_topics: summary.key_topics,
        insights: summary.insights,
        action_items: summary.action_items,
        mood_context: summary.mood_context,
        created_at: createdAt.localIso,
        created_at_utc: createdAt.isoUtc,
        created_date: createdAt.date,
        created_time: createdAt.time,
      };
    });

    const dateSet = new Set<string>([
      ...thoughtsPayload.map((thought) => thought.created_date),
      ...tasksPayload.map((task) => task.scheduled_date),
      ...checkInsPayload.map((checkIn) => checkIn.entry_date),
      ...dayNotesPayload.map((dayNote) => dayNote.entry_date),
      ...conversationLogsPayload.map((summary) => summary.conversation_date),
    ]);

    const days = Array.from(dateSet)
      .sort()
      .map((date) => {
        const dayThoughts = thoughtsPayload.filter((thought) => thought.created_date === date);
        const dayTasks = tasksPayload.filter((task) => task.scheduled_date === date);
        const dayCheckIns = checkInsPayload.filter((checkIn) => checkIn.entry_date === date);
        const dayNote = dayNotesPayload.find((note) => note.entry_date === date) ?? null;
        const dayConversationLogs = conversationLogsPayload.filter(
          (summary) => summary.conversation_date === date,
        );
        const taskProgress = buildTaskProgress(
          tasks.filter((task) => task.scheduled_date === date),
        );

        return {
          date,
          total_thoughts: dayThoughts.length,
          total_conversation_logs: dayConversationLogs.length,
          total_tasks: dayTasks.length,
          total_check_ins: dayCheckIns.length,
          task_progress: taskProgress,
          day_note: dayNote,
          thoughts: dayThoughts,
          conversation_logs: dayConversationLogs,
          tasks: dayTasks,
          check_ins: dayCheckIns,
        };
      });

    const monthTaskProgress = buildTaskProgress(tasks);
    const averageMood =
      thoughts.length === 0
        ? null
        : Number(
            (
              thoughts.reduce((total, thought) => total + thought.mood, 0) / thoughts.length
            ).toFixed(1),
          );

    return NextResponse.json(
      {
        report_type: "month",
        month,
        user: {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
        },
        summary: {
          total_thoughts: thoughtsPayload.length,
          total_conversation_logs: conversationLogsPayload.length,
          total_tasks: tasksPayload.length,
          total_check_ins: checkInsPayload.length,
          total_day_notes: dayNotesPayload.length,
          days_with_data: days.length,
          average_mood: averageMood,
          task_progress: monthTaskProgress,
          task_completion_by_day: completionStats,
        },
        thoughts: thoughtsPayload,
        conversation_logs: conversationLogsPayload,
        tasks: tasksPayload,
        check_ins: checkInsPayload,
        day_notes: dayNotesPayload,
        days,
      },
      {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="thoughts-${month}.json"`,
        },
      },
    );
  } catch (error) {
    console.error("Failed to build monthly report.", error);

    return new NextResponse("Unable to generate monthly report right now.", {
      status: 500,
    });
  }
}
