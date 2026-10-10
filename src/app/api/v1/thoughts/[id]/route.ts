import { revalidatePath } from "next/cache";

import { deleteThought, getThoughtByIdForUser, updateThought } from "@/lib/db";
import {
  apiError,
  parseIdParam,
  readJsonObject,
  readMood,
  readString,
  readTags,
  withMobileUser,
} from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

type ThoughtContext = { params: Promise<{ id: string }> };

// GET /api/v1/thoughts/:id -> { thought }
export const GET = withMobileUser<ThoughtContext>(async (_request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const thought = id ? await getThoughtByIdForUser(id, user.id) : null;

  if (!thought) {
    return apiError("That thought doesn't exist.", 404);
  }

  return Response.json({ thought });
});

// PATCH /api/v1/thoughts/:id -> { thought }. Only the fields sent are changed; the insight link
// and reflection (edited on the web) are always kept as they are.
export const PATCH = withMobileUser<ThoughtContext>(async (request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const existing = id ? await getThoughtByIdForUser(id, user.id) : null;

  if (!id || !existing) {
    return apiError("That thought doesn't exist.", 404);
  }

  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the changes as a JSON object.", 400);
  }

  const title = "title" in body ? readString(body.title, 200) : existing.title;
  const category = "category" in body ? readString(body.category, 80) : existing.category;
  const mood = "mood" in body ? readMood(body.mood) : existing.mood;
  const summary = "summary" in body ? readString(body.summary, 2000) : existing.summary;

  if (!title || !category || !mood || !summary) {
    return apiError("A thought needs a title, category, mood (1-10) and summary.", 400);
  }

  await updateThought({
    id,
    userId: user.id,
    title,
    category,
    mood,
    summary,
    body: "body" in body ? readString(body.body) : existing.body,
    tags: "tags" in body ? readTags(body.tags) : existing.tags,
    conceptTags: "conceptTags" in body ? readTags(body.conceptTags) : existing.concept_tags,
    linkedBookIdeaId: existing.linked_book_idea_id,
    insightReflection: existing.insight_reflection ?? "",
  });

  revalidatePath("/dashboard");
  revalidatePath("/");

  return Response.json({ thought: await getThoughtByIdForUser(id, user.id) });
});

// DELETE /api/v1/thoughts/:id -> 204
export const DELETE = withMobileUser<ThoughtContext>(async (_request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const deleted = id ? await deleteThought({ id, userId: user.id }) : false;

  if (!deleted) {
    return apiError("That thought doesn't exist.", 404);
  }

  revalidatePath("/dashboard");
  revalidatePath("/");

  return new Response(null, { status: 204 });
});
