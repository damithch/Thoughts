import { parseStatsRange } from "@/lib/attention/rules";
import { getAttentionStats } from "@/lib/db";
import { withMobileUser } from "@/lib/mobile-api";
import { getCurrentColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

// GET /api/v1/attention/stats?range=7d|30d -> { stats }
export const GET = withMobileUser(async (request, user) => {
  const range = parseStatsRange(new URL(request.url).searchParams.get("range"));

  return Response.json({ stats: await getAttentionStats(user.id, getCurrentColomboDate(), range) });
});
