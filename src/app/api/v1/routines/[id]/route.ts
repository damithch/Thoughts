import { revalidatePath } from "next/cache";

import { deleteRecurringTask, getRecurringTasksByUser, updateRecurringTask } from "@/lib/db";
import {
  apiError,
  parseIdParam,
  readJsonObject,
  readRoutineInput,
  withMobileUser,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

type RoutineContext = { params: Promise<{ id: string }> };

// PATCH /api/v1/routines/:id — the full routine (as for POST) plus isActive -> { routines }
export const PATCH = withMobileUser<RoutineContext>(async (request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const body = await readJsonObject(request);

  if (!id) {
    return apiError("That routine doesn't exist.", 404);
  }

  const input = body ? readRoutineInput(body) : null;

  if (!input || "error" in input) {
    return apiError(input?.error ?? "Send the routine as a JSON object.", 400);
  }

  const updated = await updateRecurringTask({
    ...input,
    id,
    isActive: body?.isActive !== false,
    userId: user.id,
  });

  if (!updated) {
    return apiError("That routine doesn't exist.", 404);
  }

  revalidatePath("/dashboard/tasks", "layout");

  return Response.json({ routines: await getRecurringTasksByUser(user.id) });
});

// DELETE /api/v1/routines/:id -> 204 (tasks it already created stay as one-offs)
export const DELETE = withMobileUser<RoutineContext>(async (_request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const deleted = id ? await deleteRecurringTask(id, user.id) : false;

  if (!deleted) {
    return apiError("That routine doesn't exist.", 404);
  }

  revalidatePath("/dashboard/tasks", "layout");

  return new Response(null, { status: 204 });
});
