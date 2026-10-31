import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  getConversationSummariesByUserAndDate,
  getDailyCheckInsByUserAndDate,
  getDayRecordByUserAndDate,
  getTasksByUserAndDate,
  getThoughtsByUserAndDate,
  getWorryDataByUserAndDate,
  getAttentionSessions,
  getInboxOpenTaskCount,
  getOverdueOpenTasks,
  getRecurringTasksByUser,
} from "@/lib/db";
import { computeAttentionInsights } from "@/lib/attention/rules";
import { toColomboExportParts } from "@/lib/time";

type DailyThought = Awaited<ReturnType<typeof getThoughtsByUserAndDate>>[number];
type DailyTask = Awaited<ReturnType<typeof getTasksByUserAndDate>>[number];
type DailyCheckIn = Awaited<ReturnType<typeof getDailyCheckInsByUserAndDate>>[number];
type DailyConversationSummary = Awaited<ReturnType<typeof getConversationSummariesByUserAndDate>>[number];

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildTaskProgress(tasks: DailyTask[]) {
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
    summary.total - summary.skipped === 0
      ? 0
      : Number(((summary.done / (summary.total - summary.skipped)) * 100).toFixed(1));

  return summary;
}

function buildDayThoughtSummary(thoughts: DailyThought[], tasks: DailyTask[]) {
  const averageMood =
    thoughts.length === 0
      ? null
      : Number(
          (
            thoughts.reduce((total, thought) => total + thought.mood, 0) / thoughts.length
          ).toFixed(1),
        );
  const recurringTags = Array.from(
    new Set(thoughts.flatMap((thought) => thought.tags)),
  ).slice(0, 8);
  const highlightedThoughtTitles = thoughts.slice(0, 3).map((thought) => thought.title);
  const unfinishedTasks = tasks
    .filter((task) => task.status === "todo" || task.status === "in_progress")
    .map((task) => task.title)
    .slice(0, 5);
  const completedTasks = tasks
    .filter((task) => task.status === "done")
    .map((task) => task.title)
    .slice(0, 5);

  return {
    total_thoughts: thoughts.length,
    average_mood: averageMood,
    recurring_tags: recurringTags,
    highlighted_thought_titles: highlightedThoughtTitles,
    completed_task_titles: completedTasks,
    unfinished_task_titles: unfinishedTasks,
  };
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? "";
  const format = searchParams.get("format") ?? "csv";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new NextResponse("Invalid date.", { status: 400 });
  }

  if (format !== "csv" && format !== "json") {
    return new NextResponse("Invalid format.", { status: 400 });
  }

  try {
    const [thoughts, tasks, dayRecord, checkIns, conversationLogs, worryData, attentionSessions] = await Promise.all([
      getThoughtsByUserAndDate(currentUser.id, date),
      getTasksByUserAndDate(currentUser.id, date),
      getDayRecordByUserAndDate(currentUser.id, date),
      getDailyCheckInsByUserAndDate(currentUser.id, date),
      getConversationSummariesByUserAndDate(currentUser.id, date),
      getWorryDataByUserAndDate(currentUser.id, date),
      getAttentionSessions(currentUser.id, { from: date, to: date }),
    ]);
    const [overdueTasks, inboxOpenCount, routines] = await Promise.all([
      getOverdueOpenTasks(currentUser.id, date),
      getInboxOpenTaskCount(currentUser.id),
      getRecurringTasksByUser(currentUser.id),
    ]);
    const routineTitles = new Map(routines.map((routine) => [routine.id, routine.title]));
    const attentionInsights = computeAttentionInsights(attentionSessions, date, date);
    const minutesBetween = (start: Date | null, end: Date | null) =>
      start && end ? Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)) : null;
    const taskProgress = buildTaskProgress(tasks);
    const dayThoughtSummary = buildDayThoughtSummary(thoughts, tasks);

    if (format === "json") {
      return NextResponse.json(
        {
          date,
          user: {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
          },
          total_thoughts: thoughts.length,
          total_conversation_logs: conversationLogs.length,
          total_tasks: tasks.length,
          total_check_ins: checkIns.length,
          task_progress: taskProgress,
          task_details: {
            high_priority_open: tasks
              .filter((task) => task.priority === "high" && (task.status === "todo" || task.status === "in_progress"))
              .map((task) => task.title),
            from_routines: tasks.filter((task) => task.recurring_task_id !== null).length,
            one_off: tasks.filter((task) => task.recurring_task_id === null).length,
            pushed_back: tasks.filter((task) => task.rollover_count > 0).map((task) => ({ title: task.title, times: task.rollover_count })),
            overdue_open_before_this_day: overdueTasks.map((task) => ({
              id: task.id,
              title: task.title,
              scheduled_date: task.scheduled_date,
              priority: task.priority,
              status: task.status,
              rollover_count: task.rollover_count,
            })),
            inbox_open_count: inboxOpenCount,
          },
          attention_summary: {
            sessions: attentionInsights.sessionCount,
            task_sessions: attentionInsights.mundaneCount,
            meditations: attentionInsights.meditationCount,
            minutes: attentionInsights.totalMinutes,
            avg_task_focus_before: attentionInsights.focus.avgTaskFocusBefore,
            avg_task_focus_after: attentionInsights.focus.avgTaskFocusAfter,
            avg_task_focus_change: attentionInsights.focus.avgChange,
            anchors_used: attentionInsights.anchors.map((anchor) => ({ anchor: anchor.anchor, sessions: anchor.count })),
            meditation_mood_change: attentionInsights.meditation.avgMoodChange,
          },
          day_note: dayRecord
            ? {
                intention: dayRecord.intention,
                note: dayRecord.note,
                end_of_day_mood: dayRecord.end_of_day_mood,
                updated_at: toColomboExportParts(dayRecord.updated_at).localIso,
              }
            : null,
          day_thought_summary: dayThoughtSummary,
          check_ins: checkIns.map((checkIn: DailyCheckIn) => {
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
          }),
          thoughts: thoughts.map((thought: DailyThought) => {
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
          }),
          conversation_logs: conversationLogs.map((summary: DailyConversationSummary) => {
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
          }),
          attention_sessions: attentionSessions.map((session) => ({
            id: session.id,
            session_type: session.session_type,
            task_name: session.task_name,
            started_at: toColomboExportParts(session.started_at).localIso,
            duration_minutes: session.duration_minutes,
            self_focus_before: session.self_focus_before,
            self_focus_after: session.self_focus_after,
            task_focus_before: session.task_focus_before,
            task_focus_after: session.task_focus_after,
            anchors_used: session.anchors_used ?? [],
            mood_before: session.mood_before,
            mood_after: session.mood_after,
            comments: session.comments,
          })),
          worry_postponement: worryData.module
            ? {
                belief: worryData.module.belief_text,
                status: worryData.module.status,
                experiment_day: worryData.experiment_day
                  ? {
                      what_happened: worryData.experiment_day.what_happened,
                      thinking_time_notes: worryData.experiment_day.thinking_time_notes,
                      controllability: worryData.experiment_day.controllability,
                      created_at: toColomboExportParts(worryData.experiment_day.created_at).localIso,
                    }
                  : null,
                postponed_items: worryData.postponed_items.map((item) => {
                  const createdAt = toColomboExportParts(item.created_at);
                  return {
                    content: item.content,
                    created_at: createdAt.localIso,
                    created_time: createdAt.time,
                  };
                }),
                total_postponed: worryData.postponed_items.length,
              }
            : null,
          tasks: tasks.map((task: DailyTask) => {
            const createdAt = toColomboExportParts(task.created_at);
            const updatedAt = toColomboExportParts(task.updated_at);
            const startedAt = task.started_at ? toColomboExportParts(task.started_at) : null;
            const completedAt = task.completed_at ? toColomboExportParts(task.completed_at) : null;

            return {
              id: task.id,
              user_id: task.user_id,
              recurring_task_id: task.recurring_task_id,
              routine_title: task.recurring_task_id ? routineTitles.get(task.recurring_task_id) ?? null : null,
              title: task.title,
              status: task.status,
              priority: task.priority,
              tags: task.tags,
              note: task.note,
              scheduled_date: task.scheduled_date,
              created_at: createdAt.localIso,
              created_at_utc: createdAt.isoUtc,
              updated_at: updatedAt.localIso,
              updated_at_utc: updatedAt.isoUtc,
              started_at: startedAt?.localIso ?? null,
              started_at_utc: startedAt?.isoUtc ?? null,
              completed_at: completedAt?.localIso ?? null,
              completed_at_utc: completedAt?.isoUtc ?? null,
              rollover_count: task.rollover_count,
              minutes_started_to_done: task.status === "done" ? minutesBetween(task.started_at, task.completed_at) : null,
            };
          }),
        },
        {
          status: 200,
          headers: {
            "Content-Disposition": `attachment; filename="thoughts-${date}.json"`,
          },
        },
      );
    }

    const lines = [
      ["report_type", "day"].join(","),
      ["date", escapeCsv(date)].join(","),
      ["user_name", escapeCsv(currentUser.name)].join(","),
      ["user_email", escapeCsv(currentUser.email)].join(","),
      ["total_thoughts", String(thoughts.length)].join(","),
      ["total_conversation_logs", String(conversationLogs.length)].join(","),
      ["total_tasks", String(tasks.length)].join(","),
      ["total_check_ins", String(checkIns.length)].join(","),
      ["tasks_done", String(taskProgress.done)].join(","),
      ["tasks_in_progress", String(taskProgress.in_progress)].join(","),
      ["tasks_todo", String(taskProgress.todo)].join(","),
      ["tasks_skipped", String(taskProgress.skipped)].join(","),
      ["task_completion_rate", String(taskProgress.completion_rate)].join(","),
      [
        "day_note",
        escapeCsv(dayRecord?.note ?? ""),
      ].join(","),
      [
        "day_intention",
        escapeCsv(dayRecord?.intention ?? ""),
      ].join(","),
      [
        "end_of_day_mood",
        escapeCsv(dayRecord?.end_of_day_mood ? String(dayRecord.end_of_day_mood) : ""),
      ].join(","),
      [
        "recurring_tags",
        escapeCsv(dayThoughtSummary.recurring_tags.join("|")),
      ].join(","),
      "",
      ["check_ins"].join(","),
      [
        "id",
        "user_id",
        "entry_date",
        "mood",
        "energy",
        "focus",
        "note",
        "created_date",
        "created_time",
        "created_at",
      ].join(","),
      ...checkIns.map((checkIn: DailyCheckIn) => {
        const createdAt = toColomboExportParts(checkIn.created_at);

        return [
          String(checkIn.id),
          String(checkIn.user_id),
          escapeCsv(checkIn.entry_date),
          String(checkIn.mood),
          escapeCsv(checkIn.energy),
          escapeCsv(checkIn.focus),
          escapeCsv(checkIn.note),
          escapeCsv(createdAt.date),
          escapeCsv(createdAt.time),
          escapeCsv(createdAt.localIso),
        ].join(",");
      }),
      "",
      ["thoughts"].join(","),
      [
        "id",
        "user_id",
        "title",
        "category",
        "mood",
        "tags",
        "concept_tags",
        "linked_book_idea_id",
        "linked_book_title",
        "linked_idea_text",
        "insight_reflection",
        "summary",
        "full_note",
        "created_date",
        "created_time",
        "created_at",
        "created_at_utc",
        "updated_date",
        "updated_time",
        "updated_at",
        "updated_at_utc",
      ].join(","),
      ...thoughts.map((thought: DailyThought) => {
        const createdAt = toColomboExportParts(thought.created_at);
        const updatedAt = toColomboExportParts(thought.updated_at);

        return [
          String(thought.id),
          String(thought.user_id ?? ""),
          escapeCsv(thought.title),
          escapeCsv(thought.category),
          String(thought.mood),
          escapeCsv(thought.tags.join("|")),
          escapeCsv(thought.concept_tags.join("|")),
          String(thought.linked_book_idea_id ?? ""),
          escapeCsv(thought.linked_book_title ?? ""),
          escapeCsv(thought.linked_idea_text ?? ""),
          escapeCsv(thought.insight_reflection ?? ""),
          escapeCsv(thought.summary),
          escapeCsv(thought.body),
          escapeCsv(createdAt.date),
          escapeCsv(createdAt.time),
          escapeCsv(createdAt.localIso),
          escapeCsv(createdAt.isoUtc),
          escapeCsv(updatedAt.date),
          escapeCsv(updatedAt.time),
          escapeCsv(updatedAt.localIso),
          escapeCsv(updatedAt.isoUtc),
        ].join(",");
      }),
      "",
      ["conversation_logs"].join(","),
      [
        "id",
        "user_id",
        "conversation_date",
        "title",
        "key_topics",
        "insights",
        "action_items",
        "mood_context",
        "created_date",
        "created_time",
        "created_at",
      ].join(","),
      ...conversationLogs.map((summary: DailyConversationSummary) => {
        const createdAt = toColomboExportParts(summary.created_at);

        return [
          String(summary.id),
          String(summary.user_id),
          escapeCsv(summary.conversation_date),
          escapeCsv(summary.title),
          escapeCsv(summary.key_topics.join("|")),
          escapeCsv(summary.insights),
          escapeCsv(summary.action_items.join("|")),
          escapeCsv(summary.mood_context ? String(summary.mood_context) : ""),
          escapeCsv(createdAt.date),
          escapeCsv(createdAt.time),
          escapeCsv(createdAt.localIso),
        ].join(",");
      }),
      "",
      ["tasks"].join(","),
      [
        "id",
        "user_id",
        "recurring_task_id",
        "title",
        "status",
        "priority",
        "tags",
        "note",
        "scheduled_date",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
        "rollover_count",
        "routine_title",
      ].join(","),
      ...tasks.map((task: DailyTask) => {
        const createdAt = toColomboExportParts(task.created_at);
        const updatedAt = toColomboExportParts(task.updated_at);

        return [
          String(task.id),
          String(task.user_id),
          String(task.recurring_task_id ?? ""),
          escapeCsv(task.title),
          escapeCsv(task.status),
          escapeCsv(task.priority),
          escapeCsv(task.tags.join("|")),
          escapeCsv(task.note),
          escapeCsv(task.scheduled_date ?? ""),
          escapeCsv(createdAt.localIso),
          escapeCsv(updatedAt.localIso),
          escapeCsv(task.started_at ? toColomboExportParts(task.started_at).localIso : ""),
          escapeCsv(task.completed_at ? toColomboExportParts(task.completed_at).localIso : ""),
          String(task.rollover_count),
          escapeCsv(task.recurring_task_id ? routineTitles.get(task.recurring_task_id) ?? "" : ""),
        ].join(",");
      }),
      "",
      ["overdue_open_tasks_before_this_day", String(overdueTasks.length)].join(","),
      ["inbox_open_tasks", String(inboxOpenCount)].join(","),
      "",
      ["attention_sessions"].join(","),
      [
        "id",
        "session_type",
        "task_name",
        "started_at",
        "duration_minutes",
        "self_focus_before",
        "self_focus_after",
        "task_focus_before",
        "task_focus_after",
        "anchors_used",
        "mood_before",
        "mood_after",
        "comments",
      ].join(","),
      ...attentionSessions.map((session) =>
        [
          String(session.id),
          escapeCsv(session.session_type),
          escapeCsv(session.task_name),
          escapeCsv(toColomboExportParts(session.started_at).localIso),
          String(session.duration_minutes),
          String(session.self_focus_before ?? ""),
          String(session.self_focus_after ?? ""),
          String(session.task_focus_before ?? ""),
          String(session.task_focus_after ?? ""),
          escapeCsv((session.anchors_used ?? []).join("|")),
          String(session.mood_before ?? ""),
          String(session.mood_after ?? ""),
          escapeCsv(session.comments ?? ""),
        ].join(","),
      ),
    ];

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="thoughts-${date}.csv"`,
      },
    });
  } catch (error) {
    console.error("Failed to build daily report.", error);

    return new NextResponse("Unable to generate report right now.", {
      status: 500,
    });
  }
}
