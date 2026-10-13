import { revalidatePath } from "next/cache";

import { deleteTask, getTaskByIdForUser, updateTask } from "@/lib/db";
import { apiError, parseIdParam, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import {
  isValidTaskDate,
  normalizeTaskNote,
  normalizeTaskTitle,
  parseTaskPriorityValue,
  parseTaskStatusValue,
} from "@/lib/tasks/validation";

export const dynamic = "force-dynamic";

type TaskContext = { params: Promise<{ id: string }> };

function revalidateTaskPages() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks", "layout");
  revalidatePath("/dashboard/completion");
}

// PATCH /api/v1/tasks/:id { status?, title?, priority?, note?, date? (null = Inbox) } -> { task }
export const PATCH = withMobileUser<TaskContext>(async (request, user, { params }) => {
  const id = parseIdParam((await params).id);

  if (!id) {
    return apiError("That task doesn't exist.", 404);
  }

  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the changes as a JSON object.", 400);
  }

  const status = body.status === undefined ? undefined : parseTaskStatusValue(body.status);
  const priority = body.priority === undefined ? undefined : parseTaskPriorityValue(body.priority);
  const title = body.title === undefined ? undefined : normalizeTaskTitle(body.title);

  if (status === null) {
    return apiError("status must be todo, in_progress, done or skipped.", 400);
  }

  if (priority === null) {
    return apiError("priority must be low, medium or high.", 400);
  }

  if (title === "") {
    return apiError("A task title can't be empty.", 400);
  }

  if (body.date !== undefined && body.date !== null && !isValidTaskDate(body.date)) {
    return apiError("date must be a valid YYYY-MM-DD date, or null for the Inbox.", 400);
  }

  const updated = await updateTask({
    id,
    userId: user.id,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(title ? { title } : {}),
    ...(body.note !== undefined ? { note: normalizeTaskNote(body.note) } : {}),
    ...(body.date !== undefined ? { scheduledDate: body.date as string | null } : {}),
  });

  const task = await getTaskByIdForUser(id, user.id);

  if (!task) {
    return apiError("That task doesn't exist.", 404);
  }

  if (updated) {
    revalidateTaskPages();
  }

  return Response.json({ task });
});

// DELETE /api/v1/tasks/:id -> { deleted } (the task as it was, so the app can offer Undo through
// POST /api/v1/tasks/restore). A deleted routine task stays deleted for that day.
export const DELETE = withMobileUser<TaskContext>(async (_request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const task = id ? await getTaskByIdForUser(id, user.id) : null;

  if (!id || !task || !(await deleteTask(id, user.id))) {
    return apiError("That task doesn't exist.", 404);
  }

  revalidateTaskPages();

  return Response.json({ deleted: task });
});
