import { undoDeleteTaskAction } from "@/app/dashboard/tasks/task-actions";
import type { TaskItem } from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// POST /api/v1/tasks/restore { task } -> { ok: true }. Undo for DELETE /api/v1/tasks/:id; reuses
// the web's undo action, which re-validates every field (and routine ownership).
export const POST = withMobileUser(async (request) => {
  const body = await readJsonObject(request);

  if (!body || typeof body.task !== "object" || body.task === null) {
    return apiError("Send the deleted task to restore.", 400);
  }

  const result = await undoDeleteTaskAction(body.task as TaskItem);

  return result.ok ? Response.json({ ok: true }) : apiError(result.error, 400);
});
