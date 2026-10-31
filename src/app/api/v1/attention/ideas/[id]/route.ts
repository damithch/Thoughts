import { deleteAttentionTaskIdea } from "@/lib/db";
import { apiError, parseIdParam, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

type IdeaContext = { params: Promise<{ id: string }> };

// DELETE /api/v1/attention/ideas/:id -> 204 (past sessions keep their task name)
export const DELETE = withMobileUser<IdeaContext>(async (_request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const deleted = id ? await deleteAttentionTaskIdea(id, user.id) : false;

  return deleted ? new Response(null, { status: 204 }) : apiError("That task isn't in your list.", 404);
});
