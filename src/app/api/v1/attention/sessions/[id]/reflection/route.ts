import { revalidatePath } from "next/cache";

import { reflectOnAttentionSession } from "@/lib/attention/service";
import { apiError, parseIdParam, readJsonObject, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

type SessionContext = { params: Promise<{ id: string }> };

// POST /api/v1/attention/sessions/:id/reflection { mood?, text? } -> 201 { thoughtId }
// Saves the session as a journal thought tagged attention-training (once per session).
export const POST = withMobileUser<SessionContext>(async (request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const body = (await readJsonObject(request)) ?? {};

  if (!id) return apiError("That session doesn't exist.", 404);

  const result = await reflectOnAttentionSession(user.id, id, body);

  if (!result.ok) return apiError(result.error, result.status);

  revalidatePath("/dashboard");

  return Response.json({ thoughtId: result.thoughtId }, { status: 201 });
});
