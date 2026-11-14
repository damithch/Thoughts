"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import {
  createSessionNote,
  deleteSessionNote,
  getThoughtByIdForUser,
  mergeTag,
  updateSessionNote,
} from "@/lib/db";
import { normalizeSessionNoteContent, sessionNoteFromThought } from "@/lib/session-notes";
import { normalizeTagName } from "@/lib/thought-fields";

function revalidateSession() {
  revalidatePath("/dashboard/session");
  revalidatePath("/dashboard");
}

function readId(formData: FormData, name: string) {
  const id = Number(formData.get(name));

  return Number.isInteger(id) && id > 0 ? id : null;
}

// Adds a typed note to the "for my next session" list.
export async function addSessionNoteAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const content = normalizeSessionNoteContent(formData.get("content")?.toString());
  if (!content) redirect("/dashboard/session?toast=empty&type=error");

  let failed = false;
  try {
    await createSessionNote({ userId: currentUser.id, content, source: "manual" });
  } catch (error) {
    console.error("Failed to add a session note.", error);
    failed = true;
  }

  if (failed) redirect("/dashboard/session?toast=failed&type=error");

  revalidateSession();
  redirect("/dashboard/session?toast=added&type=success");
}

// "Bring to session" on a thought card.
export async function addThoughtToSessionAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const thoughtId = readId(formData, "thoughtId");
  let outcome: "added" | "exists" | "failed" = "failed";

  try {
    const thought = thoughtId ? await getThoughtByIdForUser(thoughtId, currentUser.id) : null;
    const result = thought
      ? await createSessionNote({
          userId: currentUser.id,
          content: sessionNoteFromThought(thought),
          source: "thought",
          thoughtId: thought.id,
        })
      : null;
    if (result) outcome = result.created ? "added" : "exists";
  } catch (error) {
    console.error("Failed to add a thought to the session list.", error);
  }

  revalidateSession();
  redirect(
    outcome === "failed"
      ? "/dashboard?toast=session_failed&type=error"
      : `/dashboard?toast=${outcome === "added" ? "session_added" : "session_exists"}&type=success`,
  );
}

// Ticks a note off (discussed=1) or puts it back on the open list (discussed=0).
export async function setSessionNoteDiscussedAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const id = readId(formData, "noteId");
  const discussed = formData.get("discussed")?.toString() === "1";

  if (id) {
    try {
      await updateSessionNote(currentUser.id, id, { discussed });
    } catch (error) {
      console.error("Failed to update a session note.", error);
    }
  }

  revalidateSession();
  redirect("/dashboard/session");
}

export async function deleteSessionNoteAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const id = readId(formData, "noteId");

  if (id) {
    try {
      await deleteSessionNote(currentUser.id, id);
    } catch (error) {
      console.error("Failed to delete a session note.", error);
    }
  }

  revalidateSession();
  redirect("/dashboard/session?toast=deleted&type=success");
}

// Settings > Tags: renames a tag on every thought, merging into the target if it exists.
export async function mergeTagAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const from = normalizeTagName(formData.get("from")?.toString());
  const to = normalizeTagName(formData.get("to")?.toString());

  if (!from || !to || from === to) redirect("/dashboard/settings?toast=tag_invalid&type=error#tags");

  let changed = -1;
  try {
    changed = await mergeTag(currentUser.id, from, to);
  } catch (error) {
    console.error("Failed to merge tags.", error);
  }

  if (changed < 0) redirect("/dashboard/settings?toast=tag_failed&type=error#tags");

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  redirect(`/dashboard/settings?toast=${changed > 0 ? "tag_merged" : "tag_missing"}&type=${changed > 0 ? "success" : "error"}#tags`);
}
