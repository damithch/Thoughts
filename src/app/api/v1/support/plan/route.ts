import { revalidatePath } from "next/cache";

import { upsertUserSettings } from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { getSupportOverview, readSupportPlanInput } from "@/lib/support";

export const dynamic = "force-dynamic";

// PUT /api/v1/support/plan { enabled?, copingSteps?, contacts?: [{ name, phone }], helpline?: { name, phone } }
// -> { status, today, plan }. The plan is stored with the user's settings.
export const PUT = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the plan as a JSON object.", 400);
  }

  const input = readSupportPlanInput(body);

  if ("error" in input) {
    return apiError(input.error, 400);
  }

  await upsertUserSettings(user.id, input.patch);
  revalidatePath("/dashboard/support");

  return Response.json(await getSupportOverview(user.id));
});
