import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  batchUpdateTaskStatus,
  createTask,
  createThought,
  deleteTask,
  generateDailyTasksFromRecurring,
  getRecurringTasksByUser,
  getTasksByUserAndDate,
  rollForwardOpenTasks,
  updateTaskStatus,
} from "@/lib/db";
import type { TaskStatus } from "@/lib/db";
import { getUserSettings } from "@/lib/db/settings";
import { generateWithFallback } from "@/lib/gemini";
import {
  isValidTaskDate,
  normalizeTaskNote,
  normalizeTaskTags,
  normalizeTaskTitle,
  parseTaskId,
  parseTaskPriorityValue,
  parseTaskStatusValue,
} from "@/lib/tasks/validation";
import { getCurrentColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

type AgentTaskRequestBody = {
  prompt?: string;
  action?: string;
  date?: string;
  taskId?: number;
  newStatus?: TaskStatus;
  requestId?: string;
};

type ActionLog = {
  tool: string;
  details: string;
  status: "success" | "warning" | "info";
};

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AgentTaskRequestBody = {};
  try {
    body = (await request.json()) as AgentTaskRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.date !== undefined && !isValidTaskDate(body.date)) {
    return NextResponse.json({ error: "date must be a valid YYYY-MM-DD date." }, { status: 400 });
  }

  const selectedDate = body.date || getCurrentColomboDate();
  const userId = currentUser.id;
  const settings = await getUserSettings(userId);
  const actionLogs: ActionLog[] = [];
  let summaryMessage = "";

  // 1. Handle Quick Preset Actions
  if (body.action === "auto_plan") {
    const moved = await rollForwardOpenTasks(userId, selectedDate);
    if (moved > 0) {
      actionLogs.push({
        tool: "roll_forward",
        details: `Moved ${moved} overdue task(s) onto ${selectedDate}`,
        status: "success",
      });
    }

    const applied = await generateDailyTasksFromRecurring(userId, selectedDate);
    actionLogs.push({
      tool: "apply_recurring_tasks",
      details: `Generated ${applied} daily task(s) from active recurring templates for ${selectedDate}`,
      status: "success",
    });

    summaryMessage = `Auto-planning completed for ${selectedDate}. ${moved} task(s) rolled forward, ${applied} recurring routine(s) applied.`;
  } else if (body.action === "complete_high_priority") {
    const tasks = await getTasksByUserAndDate(userId, selectedDate);
    const highPriorityOpen = tasks.filter(
      (t) => t.priority === "high" && (t.status === "todo" || t.status === "in_progress"),
    );

    if (highPriorityOpen.length > 0) {
      const ids = highPriorityOpen.map((t) => t.id);
      await batchUpdateTaskStatus(userId, ids, "done");
      actionLogs.push({
        tool: "batch_update_task_status",
        details: `Completed ${highPriorityOpen.length} high-priority task(s): ${highPriorityOpen.map((t) => `"${t.title}"`).join(", ")}`,
        status: "success",
      });
      summaryMessage = `Marked ${highPriorityOpen.length} high-priority task(s) as completed.`;
    } else {
      actionLogs.push({
        tool: "batch_update_task_status",
        details: `No open high-priority tasks found for ${selectedDate}`,
        status: "info",
      });
      summaryMessage = `No open high-priority tasks found for ${selectedDate}.`;
    }
  } else if (body.action === "roll_forward") {
    const moved = await rollForwardOpenTasks(userId, selectedDate);
    actionLogs.push({
      tool: "roll_forward",
      details: moved > 0 ? `Moved ${moved} overdue task(s) onto ${selectedDate}` : `No overdue tasks before ${selectedDate}`,
      status: moved > 0 ? "success" : "info",
    });
    summaryMessage = moved > 0 ? `Moved ${moved} overdue task(s) onto ${selectedDate}.` : `No overdue tasks before ${selectedDate}.`;
  } else if (body.action === "apply_routines") {
    const applied = await generateDailyTasksFromRecurring(userId, selectedDate);
    actionLogs.push({
      tool: "apply_recurring_tasks",
      details: `Generated ${applied} daily task(s) for ${selectedDate}`,
      status: "success",
    });
    summaryMessage = applied > 0 ? `Applied ${applied} recurring routine(s) to ${selectedDate}.` : `All recurring routines are already up to date for ${selectedDate}.`;
  } else if (body.action === "task_audit") {
    const tasks = await getTasksByUserAndDate(userId, selectedDate);
    const doneCount = tasks.filter((t) => t.status === "done").length;
    const todoCount = tasks.filter((t) => t.status === "todo").length;
    const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
    const skippedCount = tasks.filter((t) => t.status === "skipped").length;
    const highCount = tasks.filter((t) => t.priority === "high").length;

    actionLogs.push({
      tool: "task_audit",
      details: `Total: ${tasks.length} | Done: ${doneCount} | In Progress: ${inProgressCount} | Todo: ${todoCount} | Skipped: ${skippedCount} | High Priority: ${highCount}`,
      status: "info",
    });

    summaryMessage = `Task Audit for ${selectedDate}: Total ${tasks.length} task(s). ${doneCount} completed, ${inProgressCount} in progress, ${todoCount} pending, ${skippedCount} skipped. ${highCount} high-priority item(s).`;
  } else if (body.prompt) {
    // 2. Handle Natural Language Agent Prompts
    const promptText = body.prompt.trim();
    const tasks = await getTasksByUserAndDate(userId, selectedDate);
    const recurring = await getRecurringTasksByUser(userId);

    // Build prompt for LLM intent parsing
    const baseSystemPrompt = `You are an AI Task & Thought Execution Agent for the personal productivity app 'Thoughts'.
Today's date (Asia/Colombo) is "${getCurrentColomboDate()}". The date the user is currently viewing is "${selectedDate}".
Resolve relative dates such as "tomorrow" or "next Friday" from today's date. Every "scheduledDate" must be an absolute date in YYYY-MM-DD format; if the user names no date, use "${selectedDate}".
Only use taskId values that appear in the task list below.
Current daily tasks for ${selectedDate}:
${JSON.stringify(tasks, null, 2)}

Current active recurring task templates:
${JSON.stringify(recurring, null, 2)}

Analyze the user's natural language request: "${promptText}".
Respond strictly with a JSON object of the following format without markdown wrap or extra text:
{
  "actions": [
    {
      "tool": "create_task" | "create_thought" | "update_status" | "delete_task" | "roll_forward" | "apply_recurring" | "none",
      "taskId"?: number,
      "title"?: string,
      "category"?: string,
      "mood"?: number,
      "priority"?: "low" | "medium" | "high",
      "status"?: "todo" | "in_progress" | "done" | "skipped",
      "tags"?: string[],
      "conceptTags"?: string[],
      "summary"?: string,
      "body"?: string,
      "note"?: string,
      "scheduledDate"?: string
    }
  ],
  "summary": "Clear, concise message summarizing what was executed or retrieved for the user."
}`;
    const systemPrompt = settings.agent_custom_prompt
      ? `${settings.agent_custom_prompt}\n\n${baseSystemPrompt}`
      : baseSystemPrompt;

    let parsed: { actions?: unknown[]; summary?: string } | null = null;

    try {
      const { text: llmOutput } = await generateWithFallback(systemPrompt, settings.agent_max_tokens, settings.agent_temperature, settings.llm_model);
      const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn("Agent LLM call failed or returned unparseable output:", e);
    }

    // No keyword guessing: if the model is unavailable or unparseable, change nothing and say so.
    // (The old fallback created tasks from arbitrary text and could bulk-complete or delete tasks.)
    if (!parsed || !Array.isArray(parsed.actions)) {
      actionLogs.push({
        tool: "agent_unavailable",
        details: "The AI could not interpret this request, so nothing was changed. Try rephrasing, or use Quick Add.",
        status: "warning",
      });

      return NextResponse.json({
        summaryMessage: "Nothing was changed: the AI could not interpret this request right now.",
        actionLogs,
        date: selectedDate,
        tasks: await getTasksByUserAndDate(userId, selectedDate),
        recurringTasks: await getRecurringTasksByUser(userId),
      });
    }

    // Execute actions. Every field from the model is validated; an invalid or failing operation is
    // skipped and reported instead of aborting the whole request with a 500.
    const ownTaskIds = new Set(tasks.map((task) => task.id));

    for (const [index, rawAction] of parsed.actions.entries()) {
      const act = (rawAction && typeof rawAction === "object" ? rawAction : {}) as Record<string, unknown>;
      const skip = (reason: string) => {
        actionLogs.push({ tool: String(act.tool ?? "unknown"), details: `Skipped: ${reason}`, status: "warning" });
      };

      try {
        if (act.tool === "create_thought") {
          const title = normalizeTaskTitle(act.title) || promptText.slice(0, 100);
          const category = typeof act.category === "string" && act.category.trim() ? act.category.trim() : "Reflection";
          const mood =
            typeof act.mood === "number" && Number.isInteger(act.mood) && act.mood >= 1 && act.mood <= 10
              ? act.mood
              : 7;
          const summary = typeof act.summary === "string" && act.summary.trim() ? act.summary.trim() : promptText;
          const bodyText = typeof act.body === "string" && act.body.trim() ? act.body.trim() : promptText;
          const tags = normalizeTaskTags(act.tags);

          await createThought({
            title,
            category,
            mood,
            tags: tags.length > 0 ? tags : ["agent-capture"],
            conceptTags: normalizeTaskTags(act.conceptTags),
            summary,
            body: bodyText,
            linkedBookIdeaId: null,
            insightReflection: "",
            userId,
            requestId: body.requestId ? `${body.requestId}:thought:${index}` : undefined,
          });

          actionLogs.push({
            tool: "create_thought",
            details: `Captured thought card "${title}" (${category}, mood ${mood}/10)`,
            status: "success",
          });
        } else if (act.tool === "create_task") {
          const title = normalizeTaskTitle(act.title);
          const priority = act.priority === undefined ? "medium" : parseTaskPriorityValue(act.priority);
          const scheduledDate = act.scheduledDate === undefined ? selectedDate : act.scheduledDate;

          if (!title) {
            skip("the task had no title.");
            continue;
          }
          if (!priority) {
            skip(`"${String(act.priority)}" is not a valid priority.`);
            continue;
          }
          if (!isValidTaskDate(scheduledDate)) {
            skip(`"${String(act.scheduledDate)}" is not a valid date (expected YYYY-MM-DD).`);
            continue;
          }

          const tags = normalizeTaskTags(act.tags);
          await createTask({
            userId,
            title,
            priority,
            tags: tags.length > 0 ? tags : normalizeTaskTags(settings.agent_default_tag),
            note: normalizeTaskNote(act.note) || "Created via AI Task Agent",
            scheduledDate,
          });
          actionLogs.push({
            tool: "create_task",
            details: `Created task "${title}" (${priority} priority) for ${scheduledDate}`,
            status: "success",
          });
        } else if (act.tool === "update_status") {
          const taskId = parseTaskId(act.taskId);
          const newStatus = act.status === undefined ? "done" : parseTaskStatusValue(act.status);

          if (!taskId || !ownTaskIds.has(taskId)) {
            skip(`task #${String(act.taskId)} is not on ${selectedDate}.`);
            continue;
          }
          if (!newStatus) {
            skip(`"${String(act.status)}" is not a valid status.`);
            continue;
          }

          await updateTaskStatus({ id: taskId, status: newStatus, userId });
          actionLogs.push({
            tool: "update_task_status",
            details: `Updated task #${taskId} status to "${newStatus}"`,
            status: "success",
          });
        } else if (act.tool === "delete_task") {
          const taskId = parseTaskId(act.taskId);

          if (!taskId || !ownTaskIds.has(taskId)) {
            skip(`task #${String(act.taskId)} is not on ${selectedDate}.`);
            continue;
          }

          await deleteTask(taskId, userId);
          actionLogs.push({
            tool: "delete_task",
            details: `Deleted task #${taskId}`,
            status: "success",
          });
        } else if (act.tool === "roll_forward") {
          const moved = await rollForwardOpenTasks(userId, selectedDate);
          actionLogs.push({
            tool: "roll_forward",
            details: `Moved ${moved} overdue task(s) onto ${selectedDate}`,
            status: "success",
          });
        } else if (act.tool === "apply_recurring") {
          const count = await generateDailyTasksFromRecurring(userId, selectedDate);
          actionLogs.push({
            tool: "apply_recurring_tasks",
            details: `Applied ${count} recurring routine(s) to ${selectedDate}`,
            status: "success",
          });
        } else if (act.tool !== "none") {
          skip("unknown operation.");
        }
      } catch (error) {
        console.error("Agent action failed:", act.tool, error);
        actionLogs.push({
          tool: String(act.tool ?? "unknown"),
          details: "Failed: the database rejected this operation.",
          status: "warning",
        });
      }
    }

    summaryMessage = parsed.summary || `Agent executed ${actionLogs.length} action(s) for your request.`;
  }

  // Fetch updated tasks and recurring rules to return to client
  const updatedTasks = await getTasksByUserAndDate(userId, selectedDate);
  const updatedRecurring = await getRecurringTasksByUser(userId);

  return NextResponse.json({
    summaryMessage,
    actionLogs,
    date: selectedDate,
    tasks: updatedTasks,
    recurringTasks: updatedRecurring,
  });
}
