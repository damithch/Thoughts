import { getConversationSummariesByUser } from "@/lib/db";
import { withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/v1/conversations -> { conversations } (assistant summaries pushed from Claude, newest first)
export const GET = withMobileUser(async (_request, user) => {
  return Response.json({ conversations: await getConversationSummariesByUser(user.id, 50) });
});
