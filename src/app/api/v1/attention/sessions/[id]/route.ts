import { editAttentionSession } from "@/lib/attention/service";
import { deleteAttentionSession, getAttentionSessionForUser } from "@/lib/db";
import { apiError, parseIdParam, readJsonObject, withMobileUser } from "@/lib/mobile-api";

import { revalidateAttention } from "../../revalidate";

export const dynamic = "force-dynamic";

type SessionContext = { params: Promise<{ id: string }> };

const NOT_FOUND = "That session doesn't exist.";

// GET /api/v1/attention/sessions/:id -> { session }
export const GET = withMobileUser<SessionContext>(async (_request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const session = id ? await getAttentionSessionForUser(id, user.id) : null;

  return session ? Response.json({ session }) : apiError(NOT_FOUND, 404);
});

// PATCH /api/v1/attention/sessions/:id { any session fields } -> { session }
export const PATCH = withMobileUser<SessionContext>(async (request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const body = await readJsonObject(request);

  if (!id) return apiError(NOT_FOUND, 404);
  if (!body) return apiError("Send the changes as a JSON object.", 400);

  const result = await editAttentionSession(user.id, id, body);

  if (!result.ok) return apiError(result.error, result.status);

  revalidateAttention();

  return Response.json({ session: result.session });
});

// DELETE /api/v1/attention/sessions/:id -> 204
export const DELETE = withMobileUser<SessionContext>(async (_request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const deleted = id ? await deleteAttentionSession(id, user.id) : false;

  if (!deleted) return apiError(NOT_FOUND, 404);

  revalidateAttention();

  return new Response(null, { status: 204 });
});
