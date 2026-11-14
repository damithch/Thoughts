import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createThought, getThoughtByIdForUser, getThoughtsByUser } from "@/lib/db";
import {
  apiError,
  readJsonObject,
  readMood,
  readOwnedBookIdeaId,
  readString,
  readTags,
  withMobileUser,
} from "@/lib/mobile-api";

import { resolveThoughtFields } from "@/lib/thought-fields";

export const dynamic = "force-dynamic";

// GET /api/v1/thoughts?limit=50&visibility=active|hidden|all -> { thoughts } (newest first)
export const GET = withMobileUser(async (request, user) => {
  const searchParams = new URL(request.url).searchParams;
  const limitParam = Number(searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
  const visibilityParam = searchParams.get("visibility");
  const visibility =
    visibilityParam === "hidden" || visibilityParam === "all" ? visibilityParam : "active";

  const thoughts = await getThoughtsByUser(user.id, limit, visibility);

  return Response.json({ thoughts });
});

// POST /api/v1/thoughts { title, emotions, lifeArea?, trigger?, mood, summary, body?, tags?,
//   conceptTags?, linkedBookIdeaId?, insightReflection?, requestId? } -> 201 { thought }.
// Older app builds send `category` instead of emotions / lifeArea / trigger; it is read into them.
// A retried request with the same requestId doesn't create a duplicate.
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the thought as a JSON object.", 400);
  }

  const title = readString(body.title, 200);
  const tags = readTags(body.tags);
  const fields = resolveThoughtFields(body, tags);
  const mood = readMood(body.mood);
  const summary = readString(body.summary, 2000);

  if (!title || !fields || !mood || !summary) {
    return apiError("A thought needs a title, at least one emotion, mood (1-10) and summary.", 400);
  }

  const linkedBookIdeaId = await readOwnedBookIdeaId(body.linkedBookIdeaId, user.id);

  if (linkedBookIdeaId === false) {
    return apiError("That insight idea isn't in your library.", 400);
  }

  const thoughtId = await createThought({
    title,
    category: fields.category,
    emotions: fields.emotions,
    lifeArea: fields.lifeArea,
    trigger: fields.trigger,
    mood,
    summary,
    body: readString(body.body),
    tags,
    conceptTags: readTags(body.conceptTags),
    linkedBookIdeaId: linkedBookIdeaId ?? null,
    insightReflection: readString(body.insightReflection, 4000),
    userId: user.id,
    requestId: readString(body.requestId, 100) || randomUUID(),
  });

  revalidatePath("/dashboard");
  revalidatePath("/");

  const thought = thoughtId ? await getThoughtByIdForUser(thoughtId, user.id) : null;

  return Response.json({ thought }, { status: 201 });
});
