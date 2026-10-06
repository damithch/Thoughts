import "server-only";

import {
  createTask,
  createThought,
  deleteTask,
  generateDailyTasksFromRecurring,
  getInboxTasksByUser,
  getOverdueOpenTasks,
  getTaskByIdForUser,
  getTasksByUserDateRange,
  restoreDeletedTask,
  rollForwardOpenTasks,
  updateTask,
  updateTaskStatus,
} from "@/lib/db";
import type { TaskItem } from "@/lib/db";
import type { AgentContextTask, PlannedOperation } from "@/lib/tasks/agent-plan";
import { addDays } from "@/lib/tasks/dates";

export type AgentLog = { tool: string; details: string; status: "success" | "warning" | "info" };

// What it takes to reverse an agent run. Thoughts and generated routines are not undone.
export type AgentUndo = {
  createdTaskIds: number[];
  changedTasks: TaskItem[];
  deletedTasks: TaskItem[];
};

export function emptyUndo(): AgentUndo {
  return { createdTaskIds: [], changedTasks: [], deletedTasks: [] };
}

// The tasks the agent may refer to: the selected day, the next two weeks, overdue and Inbox.
export async function loadAgentContext(userId: number, selectedDate: string, today: string) {
  const start = selectedDate < today ? selectedDate : today;
  const end = addDays(selectedDate > today ? selectedDate : today, 14);
  const [range, overdue, inbox] = await Promise.all([
    getTasksByUserDateRange(userId, start, end),
    getOverdueOpenTasks(userId, today),
    getInboxTasksByUser(userId),
  ]);
  const byId = new Map<number, TaskItem>();
  for (const task of [...overdue, ...range, ...inbox]) {
    byId.set(task.id, task);
  }

  return Array.from(byId.values());
}

// One line per task, compact enough to keep the prompt small.
export function describeContextTasks(tasks: AgentContextTask[]) {
  if (tasks.length === 0) {
    return "(no tasks)";
  }

  return tasks
    .map((task) => `#${task.id} | ${task.scheduled_date ?? "inbox"} | ${task.status} | ${task.priority} | ${task.title}`)
    .join("\n");
}

export async function executeAgentOperations(
  userId: number,
  operations: PlannedOperation[],
  options: { defaultDate: string; today: string; defaultTag: string; requestId?: string },
) {
  const logs: AgentLog[] = [];
  const undo = emptyUndo();

  for (const [index, op] of operations.entries()) {
    try {
      if (op.tool === "create_task") {
        const id = await createTask({
          userId,
          title: op.title,
          priority: op.priority,
          tags: op.tags.length > 0 ? op.tags : [options.defaultTag].filter(Boolean),
          note: op.note,
          scheduledDate: op.date,
        });
        undo.createdTaskIds.push(id);
      } else if (op.tool === "update_task" || op.tool === "set_status") {
        const before = await getTaskByIdForUser(op.taskId, userId);
        if (!before) {
          logs.push({ tool: op.tool, details: `Skipped: ${op.description} (task no longer exists)`, status: "warning" });
          continue;
        }
        const ok =
          op.tool === "set_status"
            ? await updateTaskStatus({ id: op.taskId, status: op.status, userId })
            : await updateTask({
                id: op.taskId,
                userId,
                ...(op.title !== undefined ? { title: op.title } : {}),
                ...(op.priority !== undefined ? { priority: op.priority } : {}),
                ...(op.date !== undefined ? { scheduledDate: op.date } : {}),
              });
        if (ok) {
          undo.changedTasks.push(before);
        }
      } else if (op.tool === "delete_task") {
        const before = await getTaskByIdForUser(op.taskId, userId);
        if (before && (await deleteTask(op.taskId, userId))) {
          undo.deletedTasks.push(before);
        }
      } else if (op.tool === "create_thought") {
        await createThought({
          title: op.title,
          category: op.category,
          mood: op.mood,
          tags: op.tags,
          conceptTags: [],
          summary: op.summary,
          body: op.body,
          linkedBookIdeaId: null,
          insightReflection: "",
          userId,
          requestId: options.requestId ? `${options.requestId}:thought:${index}` : undefined,
        });
      } else if (op.tool === "roll_forward") {
        const overdue = await getOverdueOpenTasks(userId, options.defaultDate);
        const moved = await rollForwardOpenTasks(userId, options.defaultDate);
        undo.changedTasks.push(...overdue);
        logs.push({ tool: op.tool, details: `${op.description}: ${moved} moved`, status: "success" });
        continue;
      } else if (op.tool === "apply_routines") {
        const added = await generateDailyTasksFromRecurring(userId, options.defaultDate);
        logs.push({ tool: op.tool, details: `${op.description}: ${added} added`, status: "success" });
        continue;
      }

      logs.push({ tool: op.tool, details: op.description, status: "success" });
    } catch (error) {
      console.error("Agent operation failed:", op.tool, error);
      logs.push({ tool: op.tool, details: `Failed: ${op.description}`, status: "warning" });
    }
  }

  return { logs, undo };
}

export async function undoAgentRun(userId: number, undo: AgentUndo) {
  for (const id of undo.createdTaskIds) {
    await deleteTask(id, userId);
  }

  for (const task of undo.changedTasks) {
    await updateTask({
      id: task.id,
      userId,
      title: task.title,
      priority: task.priority,
      status: task.status,
      scheduledDate: task.scheduled_date,
    });
  }

  for (const task of undo.deletedTasks) {
    await restoreDeletedTask(task, userId);
  }
}
