import { revalidatePath } from "next/cache";

import { createRecurringTask, getRecurringTasksByUser } from "@/lib/db";
import { apiError, readJsonObject, readRoutineInput, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/v1/routines -> { routines }
export const GET = withMobileUser(async (_request, user) => {
  return Response.json({ routines: await getRecurringTasksByUser(user.id) });
});

// POST /api/v1/routines { title, priority, daysOfWeek: ["mon",...], startDate, endDate?, note?, tags? }
// -> 201 { routines }
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);
  const input = body ? readRoutineInput(body) : null;

  if (!input || "error" in input) {
    return apiError(input?.error ?? "Send the routine as a JSON object.", 400);
  }

  await createRecurringTask({ ...input, userId: user.id });
  revalidatePath("/dashboard/tasks", "layout");

  return Response.json({ routines: await getRecurringTasksByUser(user.id) }, { status: 201 });
});
