"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import {
  createTask,
  deleteTask,
  getTaskByIdForUser,
  restoreDeletedTask,
  updateTask,
  updateTaskStatus,
} from "@/lib/db";
import type { TaskItem } from "@/lib/db";
import { undoAgentRun, type AgentUndo } from "@/lib/tasks/agent-execute";
import {
  isValidTaskDate,
  normalizeTaskTitle,
  parseTaskId,
  parseTaskPriorityValue,
  parseTaskStatusValue,
} from "@/lib/tasks/validation";

// Small, deterministic task mutations used by the Tasks views (Today, Upcoming, Inbox).
// Revalidating the tasks layout re-renders whichever view is open in the same round trip.

export type TaskActionResult = { ok: true } | { ok: false; error: string };
export type DeleteTaskResult = { ok: true; deleted: TaskItem } | { ok: false; error: string };

const SESSION_EXPIRED = "Your session has expired. Sign in again.";

function revalidateTaskViews() {
  revalidatePath("/dashboard/tasks", "layout");
  revalidatePath("/dashboard/completion");
}

// "" or null means "no date" (Inbox).
function parseOptionalTaskDate(value: string | null): { ok: true; date: string | null } | { ok: false } {
  if (value === null || value === "") {
    return { ok: true, date: null };
  }

  return isValidTaskDate(value) ? { ok: true, date: value } : { ok: false };
}

export async function quickCreateTaskAction(input: {
  title: string;
  priority: string;
  date: string | null;
}): Promise<TaskActionResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: SESSION_EXPIRED };
  }

  const title = normalizeTaskTitle(input.title);
  const priority = parseTaskPriorityValue(input.priority);
  const date = parseOptionalTaskDate(input.date);

  if (!title) {
    return { ok: false, error: "Give the task a title." };
  }

  if (!priority) {
    return { ok: false, error: "Choose a priority." };
  }

  if (!date.ok) {
    return { ok: false, error: "Choose a valid date." };
  }

  try {
    await createTask({
      userId: currentUser.id,
      title,
      priority,
      tags: [],
      note: "",
      scheduledDate: date.date,
    });
  } catch (error) {
    console.error("Failed to create task.", error);
    return { ok: false, error: "That task could not be saved." };
  }

  revalidateTaskViews();
  return { ok: true };
}

export async function setTaskStatusAction(taskId: number, status: string): Promise<TaskActionResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: SESSION_EXPIRED };
  }

  const id = parseTaskId(taskId);
  const nextStatus = parseTaskStatusValue(status);

  if (!id || !nextStatus) {
    return { ok: false, error: "That status change is not valid." };
  }

  try {
    const updated = await updateTaskStatus({ id, status: nextStatus, userId: currentUser.id });

    if (!updated) {
      return { ok: false, error: "That task no longer exists." };
    }
  } catch (error) {
    console.error("Failed to update task status.", error);
    return { ok: false, error: "The status could not be updated." };
  }

  revalidateTaskViews();
  return { ok: true };
}

export async function updateTaskFieldsAction(
  taskId: number,
  fields: { title?: string; priority?: string; date?: string | null },
): Promise<TaskActionResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: SESSION_EXPIRED };
  }

  const id = parseTaskId(taskId);

  if (!id) {
    return { ok: false, error: "That task could not be found." };
  }

  const update: Parameters<typeof updateTask>[0] = { id, userId: currentUser.id };

  if (fields.title !== undefined) {
    const title = normalizeTaskTitle(fields.title);

    if (!title) {
      return { ok: false, error: "A task needs a title." };
    }

    update.title = title;
  }

  if (fields.priority !== undefined) {
    const priority = parseTaskPriorityValue(fields.priority);

    if (!priority) {
      return { ok: false, error: "Choose a valid priority." };
    }

    update.priority = priority;
  }

  if (fields.date !== undefined) {
    const date = parseOptionalTaskDate(fields.date);

    if (!date.ok) {
      return { ok: false, error: "Choose a valid date." };
    }

    update.scheduledDate = date.date;
  }

  try {
    const updated = await updateTask(update);

    if (!updated) {
      return { ok: false, error: "That task no longer exists." };
    }
  } catch (error) {
    console.error("Failed to update task.", error);
    return { ok: false, error: "The task could not be updated." };
  }

  revalidateTaskViews();
  return { ok: true };
}

// Returns the deleted task so the client can offer Undo.
export async function deleteTaskWithUndoAction(taskId: number): Promise<DeleteTaskResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: SESSION_EXPIRED };
  }

  const id = parseTaskId(taskId);

  if (!id) {
    return { ok: false, error: "That task could not be found." };
  }

  try {
    const task = await getTaskByIdForUser(id, currentUser.id);

    if (!task || !(await deleteTask(id, currentUser.id))) {
      return { ok: false, error: "That task no longer exists." };
    }

    revalidateTaskViews();
    return { ok: true, deleted: task };
  } catch (error) {
    console.error("Failed to delete task.", error);
    return { ok: false, error: "That task could not be deleted." };
  }
}

export async function undoDeleteTaskAction(task: TaskItem): Promise<TaskActionResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: SESSION_EXPIRED };
  }

  const title = normalizeTaskTitle(task?.title);
  const priority = parseTaskPriorityValue(task?.priority);
  const status = parseTaskStatusValue(task?.status);
  const date = parseOptionalTaskDate(task?.scheduled_date ?? null);

  if (!title || !priority || !status || !date.ok) {
    return { ok: false, error: "That task could not be restored." };
  }

  try {
    // Ownership of recurring_task_id is re-checked inside restoreDeletedTask.
    await restoreDeletedTask(
      {
        ...task,
        title,
        priority,
        status,
        scheduled_date: date.date,
        tags: Array.isArray(task.tags) ? task.tags.filter((tag) => typeof tag === "string") : [],
        note: typeof task.note === "string" ? task.note : "",
        recurring_task_id: parseTaskId(task.recurring_task_id),
        created_at: new Date(task.created_at),
        started_at: task.started_at ? new Date(task.started_at) : null,
        completed_at: task.completed_at ? new Date(task.completed_at) : null,
      },
      currentUser.id,
    );
  } catch (error) {
    console.error("Failed to restore task.", error);
    return { ok: false, error: "That task could not be restored." };
  }

  revalidateTaskViews();
  return { ok: true };
}

// Reverses an agent run (tasks it created, changed or deleted). Every id is re-checked against
// the current user by the DB functions it calls.
export async function undoAgentRunAction(undo: AgentUndo): Promise<TaskActionResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: SESSION_EXPIRED };
  }

  const isTaskList = (value: unknown): value is TaskItem[] =>
    Array.isArray(value) && value.every((task) => task && typeof task === "object" && parseTaskId((task as TaskItem).id));

  if (
    !undo ||
    !Array.isArray(undo.createdTaskIds) ||
    !undo.createdTaskIds.every((id) => parseTaskId(id)) ||
    !isTaskList(undo.changedTasks) ||
    !isTaskList(undo.deletedTasks)
  ) {
    return { ok: false, error: "Nothing to undo." };
  }

  const sanitize = (task: TaskItem): TaskItem | null => {
    const title = normalizeTaskTitle(task.title);
    const priority = parseTaskPriorityValue(task.priority);
    const status = parseTaskStatusValue(task.status);
    const date = parseOptionalTaskDate(task.scheduled_date ?? null);

    if (!title || !priority || !status || !date.ok) {
      return null;
    }

    return {
      ...task,
      id: Number(task.id),
      title,
      priority,
      status,
      scheduled_date: date.date,
      tags: Array.isArray(task.tags) ? task.tags.filter((tag) => typeof tag === "string") : [],
      note: typeof task.note === "string" ? task.note : "",
      recurring_task_id: parseTaskId(task.recurring_task_id),
      created_at: new Date(task.created_at),
      started_at: task.started_at ? new Date(task.started_at) : null,
      completed_at: task.completed_at ? new Date(task.completed_at) : null,
    };
  };

  try {
    await undoAgentRun(currentUser.id, {
      createdTaskIds: undo.createdTaskIds.map(Number),
      changedTasks: undo.changedTasks.map(sanitize).filter((task): task is TaskItem => task !== null),
      deletedTasks: undo.deletedTasks.map(sanitize).filter((task): task is TaskItem => task !== null),
    });
  } catch (error) {
    console.error("Failed to undo agent run.", error);
    return { ok: false, error: "Those changes could not be undone." };
  }

  revalidateTaskViews();
  return { ok: true };
}
