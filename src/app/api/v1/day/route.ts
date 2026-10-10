import { revalidatePath } from "next/cache";

import { getDayRecordByUserAndDate, upsertDayRecord } from "@/lib/db";
import { apiError, readJsonObject, readMood, readString, withMobileUser } from "@/lib/mobile-api";
import { isValidTaskDate } from "@/lib/tasks/validation";

export const dynamic = "force-dynamic";

// PUT /api/v1/day { date, intention?, note?, endOfDayMood? (1-10 or null) } -> { dayRecord }
export const PUT = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the day note as a JSON object.", 400);
  }

  if (!isValidTaskDate(body.date)) {
    return apiError("date must be a valid YYYY-MM-DD date.", 400);
  }

  const endOfDayMood =
    body.endOfDayMood === undefined || body.endOfDayMood === null ? null : readMood(body.endOfDayMood);

  if (body.endOfDayMood != null && endOfDayMood === null) {
    return apiError("endOfDayMood must be a whole number from 1 to 10.", 400);
  }

  await upsertDayRecord({
    entryDate: body.date,
    intention: readString(body.intention, 2000),
    note: readString(body.note),
    endOfDayMood,
    userId: user.id,
  });

  revalidatePath("/dashboard/tasks", "layout");

  return Response.json({ dayRecord: await getDayRecordByUserAndDate(user.id, body.date) });
});
