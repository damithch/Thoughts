"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import {
  createTask,
  deleteTask,
  getRecurringTasksByUser,
  getTasksByUserAndDate,
  updateTaskStatus,
} from "@/lib/db";
import type { RecurringTask, TaskItem } from "@/lib/db";
import { getUserSettings } from "@/lib/db/settings";
import {
  isValidTaskDate,
  normalizeTaskTags,
  normalizeTaskTitle,
  parseTaskId,
  parseTaskPriorityValue,
  parseTaskStatusValue,
} from "@/lib/tasks/validation";

// Deterministic task operations for the agent page. These never go through the LLM, so picking a
// date or using Quick Add cannot create unexpected tasks.

export type AgentTaskResult =
  | { ok: true; date: string; tasks: TaskItem[]; recurringTasks: RecurringTask[] }
  | { ok: false; error: string };

async function loadForDate(userId: number, date: string): Promise<AgentTaskResult> {
  const [tasks, recurringTasks] = await Promise.all([
    getTasksByUserAndDate(userId, date),
    getRecurringTasksByUser(userId),
  ]);

  return { ok: true, date, tasks, recurringTasks };
}

function revalidateTaskPages() {
  revalidatePath("/dashboard/today");
  revalidatePath("/dashboard/agent");
  revalidatePath("/dashboard/completion");
}

export async function loadAgentTasksAction(date: string): Promise<AgentTaskResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  if (!isValidTaskDate(date)) {
    return { ok: false, error: "Choose a valid date." };
  }

  try {
    return await loadForDate(currentUser.id, date);
  } catch (error) {
    console.error("Failed to load tasks for the agent page.", error);
    return { ok: false, error: "Tasks could not be loaded." };
  }
}

export async function quickAddAgentTaskAction(input: {
  title: string;
  priority: string;
  tag: string;
  date: string;
}): Promise<AgentTaskResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  const title = normalizeTaskTitle(input.title);
  const priority = parseTaskPriorityValue(input.priority);

  if (!title) {
    return { ok: false, error: "Give the task a title." };
  }

  if (!priority) {
    return { ok: false, error: "Choose a priority." };
  }

  if (!isValidTaskDate(input.date)) {
    return { ok: false, error: "Choose a valid date." };
  }

  try {
    const settings = await getUserSettings(currentUser.id);
    const tags = normalizeTaskTags(input.tag);

    await createTask({
      userId: currentUser.id,
      title,
      priority,
      tags: tags.length > 0 ? tags : normalizeTaskTags(settings.agent_default_tag),
      note: "",
      scheduledDate: input.date,
    });
    revalidateTaskPages();

    return await loadForDate(currentUser.id, input.date);
  } catch (error) {
    console.error("Failed to quick-add a task from the agent page.", error);
    return { ok: false, error: "That task could not be saved." };
  }
}

export async function setAgentTaskStatusAction(
  taskId: number,
  status: string,
  date: string,
): Promise<AgentTaskResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  const id = parseTaskId(taskId);
  const nextStatus = parseTaskStatusValue(status);

  if (!id || !nextStatus || !isValidTaskDate(date)) {
    return { ok: false, error: "That status change is not valid." };
  }

  try {
    const updated = await updateTaskStatus({ id, status: nextStatus, userId: currentUser.id });

    if (!updated) {
      return { ok: false, error: "That task no longer exists." };
    }

    revalidateTaskPages();

    return await loadForDate(currentUser.id, date);
  } catch (error) {
    console.error("Failed to update task status from the agent page.", error);
    return { ok: false, error: "The status could not be updated." };
  }
}

export async function deleteAgentTaskAction(taskId: number, date: string): Promise<AgentTaskResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  const id = parseTaskId(taskId);

  if (!id || !isValidTaskDate(date)) {
    return { ok: false, error: "That task could not be deleted." };
  }

  try {
    await deleteTask(id, currentUser.id);
    revalidateTaskPages();

    return await loadForDate(currentUser.id, date);
  } catch (error) {
    console.error("Failed to delete task from the agent page.", error);
    return { ok: false, error: "That task could not be deleted." };
  }
}
