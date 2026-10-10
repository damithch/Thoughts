import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createThought, getThoughtByIdForUser, getThoughtsByUser } from "@/lib/db";
import {
  apiError,
  readJsonObject,
  readMood,
  readString,
  readTags,
  withMobileUser,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/v1/thoughts?limit=50 -> { thoughts } (newest first, hidden thoughts left out)
export const GET = withMobileUser(async (request, user) => {
  const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

  const thoughts = await getThoughtsByUser(user.id, limit, "active");

  return Response.json({ thoughts });
});

// POST /api/v1/thoughts { title, category, mood, summary, body?, tags?, conceptTags?, requestId? }
// -> 201 { thought }. A retried request with the same requestId doesn't create a duplicate.
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the thought as a JSON object.", 400);
  }

  const title = readString(body.title, 200);
  const category = readString(body.category, 80);
  const mood = readMood(body.mood);
  const summary = readString(body.summary, 2000);

  if (!title || !category || !mood || !summary) {
    return apiError("A thought needs a title, category, mood (1-10) and summary.", 400);
  }

  const thoughtId = await createThought({
    title,
    category,
    mood,
    summary,
    body: readString(body.body),
    tags: readTags(body.tags),
    conceptTags: readTags(body.conceptTags),
    linkedBookIdeaId: null,
    insightReflection: "",
    userId: user.id,
    requestId: readString(body.requestId, 100) || randomUUID(),
  });

  revalidatePath("/dashboard");
  revalidatePath("/");

  const thought = thoughtId ? await getThoughtByIdForUser(thoughtId, user.id) : null;

  return Response.json({ thought }, { status: 201 });
});
