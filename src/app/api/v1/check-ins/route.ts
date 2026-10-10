import { revalidatePath } from "next/cache";

import { createDailyCheckIn, getDailyCheckInsByUserAndDate } from "@/lib/db";
import type { CheckInEnergy, CheckInFocus } from "@/lib/db";
import { apiError, readJsonObject, readMood, readString, withMobileUser } from "@/lib/mobile-api";
import { isValidTaskDate } from "@/lib/tasks/validation";

export const dynamic = "force-dynamic";

const ENERGY_LEVELS: CheckInEnergy[] = ["low", "steady", "high"];
const FOCUS_LEVELS: CheckInFocus[] = ["scattered", "okay", "locked_in"];

// POST /api/v1/check-ins { date, mood, energy, focus, note? } -> 201 { checkIns } (that day's list)
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the check-in as a JSON object.", 400);
  }

  const mood = readMood(body.mood);
  const energy = ENERGY_LEVELS.find((level) => level === body.energy);
  const focus = FOCUS_LEVELS.find((level) => level === body.focus);

  if (!isValidTaskDate(body.date) || !mood || !energy || !focus) {
    return apiError("A check-in needs a date, mood (1-10), energy and focus.", 400);
  }

  await createDailyCheckIn({
    entryDate: body.date,
    mood,
    energy,
    focus,
    note: readString(body.note, 1000),
    userId: user.id,
  });

  revalidatePath("/dashboard/tasks", "layout");

  return Response.json(
    { checkIns: await getDailyCheckInsByUserAndDate(user.id, body.date) },
    { status: 201 },
  );
});
