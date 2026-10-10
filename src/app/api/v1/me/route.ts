import { toPublicUser, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/v1/me -> { user }. The app calls this on launch to check its saved token still works.
export const GET = withMobileUser(async (_request, user) => {
  return Response.json({ user: toPublicUser(user) });
});
