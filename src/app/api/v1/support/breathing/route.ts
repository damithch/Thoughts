import { revalidatePath } from "next/cache";

import { recordBreathingSession } from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { getCurrentColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

// POST /api/v1/support/breathing { seconds } -> { totalSeconds, completedTask }
// Logs a guided-breathing session for today. A minute or more also ticks off today's breathing
// task, and `completedTask` names it.
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);
  const seconds = typeof body?.seconds === "number" ? Math.round(body.seconds) : NaN;

  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) {
    return apiError("seconds must be between 1 and 3600.", 400);
  }

  const today = getCurrentColomboDate();
  const result = await recordBreathingSession(user.id, today, seconds, true);

  if (result.completedTask) {
    revalidatePath("/dashboard/tasks", "layout");
    revalidatePath("/dashboard/completion");
  }

  return Response.json(result);
});
