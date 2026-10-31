import { getAttentionReminder, setAttentionReminder } from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { parseClockTime } from "@/lib/tasks/validation";
import { getCurrentColomboDate } from "@/lib/time";

import { revalidateAttention } from "../revalidate";

export const dynamic = "force-dynamic";

// GET /api/v1/attention/reminder -> { reminder: { routineId, time, active } | null }
export const GET = withMobileUser(async (_request, user) => {
  return Response.json({ reminder: await getAttentionReminder(user.id) });
});

// PUT /api/v1/attention/reminder { time: "07:00" | null } -> { reminder }
// The reminder is the daily "Attention training" routine's reminder time (created on first use),
// so the phone schedules it with the other habit reminders.
export const PUT = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);
  const time = body?.time === null || body?.time === "" ? null : parseClockTime(body?.time);

  if (time === null && body?.time !== null && body?.time !== "") {
    return apiError("time must look like 07:30, or be null to turn the reminder off.", 400);
  }

  const reminder = await setAttentionReminder(user.id, time, getCurrentColomboDate());
  revalidateAttention(true);

  return Response.json({ reminder });
});
