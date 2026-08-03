import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  batchUpdateTaskStatus,
  createTask,
  deleteTask,
  generateDailyTasksFromRecurring,
  getRecurringTasksByUser,
  getTasksByUserAndDate,
  moveOpenTasksToDate,
  updateTask,
  updateTaskStatus,
} from "@/lib/db";
import type { TaskItem, TaskPriority, TaskStatus } from "@/lib/db";
import { generateFromPrompt } from "@/lib/gemini";
import { getCurrentColomboDate, shiftColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

type AgentTaskRequestBody = {
  prompt?: string;
  action?: string;
  date?: string;
  taskId?: number;
  newStatus?: TaskStatus;
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

  const selectedDate = body.date || getCurrentColomboDate();
  const userId = currentUser.id;
  const actionLogs: ActionLog[] = [];
  let summaryMessage = "";

  // 1. Handle Quick Preset Actions
  if (body.action === "auto_plan") {
    const yesterday = shiftColomboDate(getCurrentColomboDate(), -1);
    const moved = await moveOpenTasksToDate(userId, yesterday, selectedDate);
    if (moved > 0) {
      actionLogs.push({
        tool: "move_open_tasks",
        details: `Rolled forward ${moved} open task(s) from ${yesterday} to ${selectedDate}`,
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
    const yesterday = shiftColomboDate(getCurrentColomboDate(), -1);
    const moved = await moveOpenTasksToDate(userId, yesterday, selectedDate);
    actionLogs.push({
      tool: "move_open_tasks",
      details: moved > 0 ? `Moved ${moved} task(s) to ${selectedDate}` : `No open tasks found to roll forward from ${yesterday}`,
      status: moved > 0 ? "success" : "info",
    });
    summaryMessage = moved > 0 ? `Successfully rolled forward ${moved} open task(s) from ${yesterday} to ${selectedDate}.` : `No open tasks were found to roll forward from ${yesterday}.`;
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
    const systemPrompt = `You are an AI Task Execution Agent for the personal productivity app 'Thoughts'.
The user current date is "${selectedDate}".
Current daily tasks for ${selectedDate}:
${JSON.stringify(tasks, null, 2)}

Current active recurring task templates:
${JSON.stringify(recurring, null, 2)}

Analyze the user's natural language request: "${promptText}".
Respond strictly with a JSON object of the following format without markdown wrap or extra text:
{
  "actions": [
    {
      "tool": "create_task" | "update_status" | "delete_task" | "roll_forward" | "apply_recurring" | "none",
      "taskId"?: number,
      "title"?: string,
      "priority"?: "low" | "medium" | "high",
      "status"?: "todo" | "in_progress" | "done" | "skipped",
      "tags"?: string[],
      "note"?: string,
      "scheduledDate"?: string
    }
  ],
  "summary": "Clear, concise message summarizing what was executed or retrieved for the user."
}`;

    let parsed: { actions?: any[]; summary?: string } | null = null;

    try {
      const llmOutput = await generateFromPrompt(systemPrompt, 1024, 0.1);
      const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn("LLM parsing failed or unavailable, falling back to rule-based parser:", e);
    }

    // Heuristic / pattern matching fallback if LLM is unavailable or unparsed
    if (!parsed || !Array.isArray(parsed.actions)) {
      const lower = promptText.toLowerCase();
      const actions: any[] = [];

      if (lower.includes("done") || lower.includes("complete") || lower.includes("finish")) {
        // Find matching tasks by title or keyword
        const targets = tasks.filter((t) => lower.includes(t.title.toLowerCase()) || lower.includes(t.priority));
        if (targets.length > 0) {
          for (const target of targets) {
            actions.push({ tool: "update_status", taskId: target.id, status: "done" });
          }
        } else if (lower.includes("all") || lower.includes("tasks")) {
          for (const t of tasks) {
            if (t.status !== "done") {
              actions.push({ tool: "update_status", taskId: t.id, status: "done" });
            }
          }
        }
      } else if (lower.includes("delete") || lower.includes("remove")) {
        const targets = tasks.filter((t) => lower.includes(t.title.toLowerCase()));
        for (const target of targets) {
          actions.push({ tool: "delete_task", taskId: target.id });
        }
      } else if (lower.includes("roll forward") || lower.includes("carry over") || lower.includes("move open")) {
        actions.push({ tool: "roll_forward" });
      } else if (lower.includes("routine") || lower.includes("recurring") || lower.includes("apply")) {
        actions.push({ tool: "apply_recurring" });
      } else {
        // Default: Create task from prompt
        const priority: TaskPriority = lower.includes("high") ? "high" : lower.includes("low") ? "low" : "medium";
        actions.push({
          tool: "create_task",
          title: promptText.replace(/^(add|create|new task|please add)\s+/i, ""),
          priority,
          scheduledDate: selectedDate,
        });
      }

      parsed = {
        actions,
        summary: `Processed prompt: "${promptText}".`,
      };
    }

    // Execute actions
    if (parsed.actions && parsed.actions.length > 0) {
      for (const act of parsed.actions) {
        if (act.tool === "create_task") {
          const title = act.title || promptText;
          const priority: TaskPriority = act.priority || "medium";
          const scheduledDate = act.scheduledDate || selectedDate;
          await createTask({
            userId,
            title,
            priority,
            tags: act.tags || ["agent"],
            note: act.note || "Created via AI Task Agent",
            scheduledDate,
          });
          actionLogs.push({
            tool: "create_task",
            details: `Created task "${title}" (${priority} priority) for ${scheduledDate}`,
            status: "success",
          });
        } else if (act.tool === "update_status" && act.taskId) {
          const newStatus: TaskStatus = act.status || "done";
          await updateTaskStatus({ id: act.taskId, status: newStatus, userId });
          actionLogs.push({
            tool: "update_task_status",
            details: `Updated task #${act.taskId} status to "${newStatus}"`,
            status: "success",
          });
        } else if (act.tool === "delete_task" && act.taskId) {
          await deleteTask(act.taskId, userId);
          actionLogs.push({
            tool: "delete_task",
            details: `Deleted task #${act.taskId}`,
            status: "success",
          });
        } else if (act.tool === "roll_forward") {
          const yesterday = shiftColomboDate(getCurrentColomboDate(), -1);
          const moved = await moveOpenTasksToDate(userId, yesterday, selectedDate);
          actionLogs.push({
            tool: "move_open_tasks",
            details: `Rolled forward ${moved} open task(s) from ${yesterday} to ${selectedDate}`,
            status: "success",
          });
        } else if (act.tool === "apply_recurring") {
          const count = await generateDailyTasksFromRecurring(userId, selectedDate);
          actionLogs.push({
            tool: "apply_recurring_tasks",
            details: `Applied ${count} recurring routine(s) to ${selectedDate}`,
            status: "success",
          });
        }
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
