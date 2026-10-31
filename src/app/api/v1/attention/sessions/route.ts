import { ATTENTION_LIMITS, ATTENTION_SESSION_TYPES } from "@/lib/attention/rules";
import { saveAttentionSession } from "@/lib/attention/service";
import { getAttentionSessions } from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { isValidTaskDate } from "@/lib/tasks/validation";

import { revalidateAttention } from "../revalidate";

export const dynamic = "force-dynamic";

// GET /api/v1/attention/sessions?from=&to=&type=&limit= -> { sessions } (newest first)
export const GET = withMobileUser(async (request, user) => {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const type = params.get("type");
  const limit = Number(params.get("limit") ?? ATTENTION_LIMITS.listDefault);

  if ((from && !isValidTaskDate(from)) || (to && !isValidTaskDate(to))) {
    return apiError("from and to must be YYYY-MM-DD dates.", 400);
  }

  const sessionType = ATTENTION_SESSION_TYPES.find((value) => value === type) ?? null;
  if (type && !sessionType) {
    return apiError("type must be mundane_task or meditation.", 400);
  }

  const sessions = await getAttentionSessions(user.id, {
    from,
    to,
    type: sessionType,
    limit: Number.isInteger(limit) ? limit : undefined,
  });

  return Response.json({ sessions });
});

// POST /api/v1/attention/sessions { sessionType, taskName?, durationMinutes, selfFocusBefore?,
//   selfFocusAfter?, anchorsUsed?, moodBefore?, moodAfter?, comments?, entryDate?, startedAt?,
//   completeTask? } -> 201 { session, completedTask }
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the session as a JSON object.", 400);
  }

  const result = await saveAttentionSession(user.id, body);

  if (!result.ok) {
    return apiError(result.error, result.status);
  }

  revalidateAttention(result.completedTask !== null);

  return Response.json({ session: result.session, completedTask: result.completedTask }, { status: 201 });
});
