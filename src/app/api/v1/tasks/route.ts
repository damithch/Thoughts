import { revalidatePath } from "next/cache";

import { createTask, getTaskByIdForUser } from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import {
  isValidTaskDate,
  normalizeTaskNote,
  normalizeTaskTags,
  normalizeTaskTitle,
  parseTaskPriorityValue,
} from "@/lib/tasks/validation";

export const dynamic = "force-dynamic";

// POST /api/v1/tasks { title, date, priority?, note?, tags? } -> 201 { task }
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the task as a JSON object.", 400);
  }

  const title = normalizeTaskTitle(body.title);
  const priority = parseTaskPriorityValue(body.priority ?? "medium");

  if (!title) {
    return apiError("Give the task a title.", 400);
  }

  if (!priority) {
    return apiError("priority must be low, medium or high.", 400);
  }

  if (!isValidTaskDate(body.date)) {
    return apiError("date must be a valid YYYY-MM-DD date.", 400);
  }

  const taskId = await createTask({
    title,
    priority,
    tags: normalizeTaskTags(body.tags),
    note: normalizeTaskNote(body.note),
    scheduledDate: body.date,
    userId: user.id,
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks", "layout");

  return Response.json({ task: await getTaskByIdForUser(taskId, user.id) }, { status: 201 });
});
