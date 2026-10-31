import { normalizeTaskName } from "@/lib/attention/rules";
import { addAttentionTaskIdea, getAttentionTaskIdeas } from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/v1/attention/ideas -> { ideas } (the user's everyday tasks to practise with)
export const GET = withMobileUser(async (_request, user) => {
  return Response.json({ ideas: await getAttentionTaskIdeas(user.id) });
});

// POST /api/v1/attention/ideas { name } -> 201 { ideas }
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);
  const name = normalizeTaskName(body?.name);

  if (!name) return apiError("Name the everyday task.", 400);

  return Response.json({ ideas: await addAttentionTaskIdea(user.id, name) }, { status: 201 });
});
