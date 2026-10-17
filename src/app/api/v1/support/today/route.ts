import { updateSupportDay } from "@/lib/db";
import type { SupportDayUpdate } from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { getSupportOverview } from "@/lib/support";
import { getCurrentColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

function readFlag(value: unknown) {
  return value === true || value === false || value === null ? value : undefined;
}

// PUT /api/v1/support/today { ate?, slept?, connected? (true/false/null), stepsTried?, dismiss? }
// -> { status, today, plan }. `dismiss: true` is "I'm okay for now".
export const PUT = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the changes as a JSON object.", 400);
  }

  const update: SupportDayUpdate = {
    ate: readFlag(body.ate),
    slept: readFlag(body.slept),
    connected: readFlag(body.connected),
    dismiss: body.dismiss === true,
  };

  if (body.stepsTried !== undefined) {
    if (!Array.isArray(body.stepsTried) || body.stepsTried.some((step) => typeof step !== "string")) {
      return apiError("stepsTried must be a list of steps.", 400);
    }

    update.stepsTried = (body.stepsTried as string[]).map((step) => step.slice(0, 140)).slice(0, 20);
  }

  await updateSupportDay(user.id, getCurrentColomboDate(), update);

  return Response.json(await getSupportOverview(user.id));
});
