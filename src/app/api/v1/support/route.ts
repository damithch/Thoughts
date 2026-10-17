import { withMobileUser } from "@/lib/mobile-api";
import { getSupportOverview } from "@/lib/support";

export const dynamic = "force-dynamic";

// GET /api/v1/support -> { status, today, plan }
// status: whether a rough patch is showing (and why); today: basics check, steps tried and
// breathing time; plan: coping steps, people to contact and the helpline.
export const GET = withMobileUser(async (_request, user) => {
  return Response.json(await getSupportOverview(user.id));
});
