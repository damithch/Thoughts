import { revalidatePath } from "next/cache";

import { createSessionNote, getSessionNotes, getThoughtByIdForUser } from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { normalizeSessionNoteContent, sessionNoteFromThought } from "@/lib/session-notes";

export const dynamic = "force-dynamic";

// GET /api/v1/session-notes?status=open|discussed|all -> { notes }
// The "for my next session" list: open notes first (oldest first), then discussed ones.
export const GET = withMobileUser(async (request, user) => {
  const statusParam = new URL(request.url).searchParams.get("status");
  const status = statusParam === "open" || statusParam === "discussed" ? statusParam : "all";

  return Response.json({ notes: await getSessionNotes(user.id, status) });
});

// POST /api/v1/session-notes { content } or { thoughtId } -> 201 { note, created }
// With a thoughtId the note is made from that thought. Adding the same open note (or the same
// thought) again returns the existing one with created: false.
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) return apiError("Send the note as a JSON object.", 400);

  const thoughtId =
    typeof body.thoughtId === "number" && Number.isInteger(body.thoughtId) && body.thoughtId > 0 ? body.thoughtId : null;
  const thought = thoughtId ? await getThoughtByIdForUser(thoughtId, user.id) : null;

  if (thoughtId && !thought) return apiError("That thought doesn't exist.", 404);

  const content = normalizeSessionNoteContent(body.content) || (thought ? sessionNoteFromThought(thought) : "");

  if (!content) return apiError("Write what you want to bring up.", 400);

  const result = await createSessionNote({
    userId: user.id,
    content,
    source: thought ? "thought" : "manual",
    thoughtId: thought?.id ?? null,
  });

  if (!result) return apiError("That couldn't be saved.", 400);

  revalidatePath("/dashboard/session");

  return Response.json(result, { status: result.created ? 201 : 200 });
});
