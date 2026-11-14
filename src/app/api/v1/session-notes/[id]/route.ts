import { revalidatePath } from "next/cache";

import { deleteSessionNote, updateSessionNote } from "@/lib/db";
import { apiError, parseIdParam, readJsonObject, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

type NoteContext = { params: Promise<{ id: string }> };

// PATCH /api/v1/session-notes/:id { content?, discussed? } -> { note }
// discussed: true ticks it off, false puts it back on the open list.
export const PATCH = withMobileUser<NoteContext>(async (request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const body = await readJsonObject(request);

  if (!id) return apiError("That note doesn't exist.", 404);
  if (!body) return apiError("Send the changes as a JSON object.", 400);

  const changes: { content?: string; discussed?: boolean } = {};
  if (typeof body.content === "string") changes.content = body.content;
  if (typeof body.discussed === "boolean") changes.discussed = body.discussed;

  if (changes.content !== undefined && !changes.content.trim()) return apiError("The note can't be empty.", 400);

  const note = await updateSessionNote(user.id, id, changes);

  if (!note) return apiError("That note doesn't exist.", 404);

  revalidatePath("/dashboard/session");

  return Response.json({ note });
});

// DELETE /api/v1/session-notes/:id -> 204
export const DELETE = withMobileUser<NoteContext>(async (_request, user, { params }) => {
  const id = parseIdParam((await params).id);

  if (!id || !(await deleteSessionNote(user.id, id))) return apiError("That note doesn't exist.", 404);

  revalidatePath("/dashboard/session");

  return new Response(null, { status: 204 });
});
