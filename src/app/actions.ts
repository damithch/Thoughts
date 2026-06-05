"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearSession, createSession, getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { createThought, createUser, deleteThought, getUserByEmail, updateThought } from "@/lib/db";

function parseMood(value: FormDataEntryValue | null) {
  const mood = Number(value?.toString() ?? "");

  if (!Number.isInteger(mood) || mood < 1 || mood > 10) {
    return null;
  }

  return mood;
}

function parseTags(value: FormDataEntryValue | null) {
  return Array.from(
    new Set(
      (value?.toString() ?? "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

export async function createThoughtAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const category = formData.get("category")?.toString().trim() ?? "";
  const mood = parseMood(formData.get("mood"));
  const tags = parseTags(formData.get("tags"));
  const summary = formData.get("summary")?.toString().trim() ?? "";
  const body = formData.get("body")?.toString().trim() ?? "";

  if (!title || !category || !mood || !summary) {
    redirect("/dashboard?toast=invalid_entry&type=error");
  }

  try {
    await createThought({
      title,
      category,
      mood,
      tags,
      summary,
      body,
      userId: currentUser.id,
    });
  } catch {
    redirect("/dashboard?toast=save_failed&type=error");
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  redirect("/dashboard?toast=created&type=success");
}

export async function updateThoughtAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const thoughtId = Number(formData.get("thoughtId"));
  const title = formData.get("title")?.toString().trim() ?? "";
  const category = formData.get("category")?.toString().trim() ?? "";
  const mood = parseMood(formData.get("mood"));
  const tags = parseTags(formData.get("tags"));
  const summary = formData.get("summary")?.toString().trim() ?? "";
  const body = formData.get("body")?.toString().trim() ?? "";

  if (!Number.isInteger(thoughtId) || thoughtId <= 0 || !title || !category || !mood || !summary) {
    redirect("/dashboard?toast=update_failed&type=error");
  }

  try {
    const updated = await updateThought({
      id: thoughtId,
      title,
      category,
      mood,
      tags,
      summary,
      body,
      userId: currentUser.id,
    });

    if (!updated) {
      redirect("/dashboard?toast=update_failed&type=error");
    }
  } catch {
    redirect("/dashboard?toast=save_failed&type=error");
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  redirect("/dashboard?toast=updated&type=success");
}

export async function deleteThoughtAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const thoughtId = Number(formData.get("thoughtId"));

  if (!Number.isInteger(thoughtId) || thoughtId <= 0) {
    redirect("/dashboard?toast=delete_failed&type=error");
  }

  try {
    const deleted = await deleteThought({
      id: thoughtId,
      userId: currentUser.id,
    });

    if (!deleted) {
      redirect("/dashboard?toast=delete_failed&type=error");
    }
  } catch {
    redirect("/dashboard?toast=delete_failed&type=error");
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  redirect("/dashboard?toast=deleted&type=success");
}

export async function registerAction(formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!name || !email || password.length < 8) {
    redirect("/register?toast=invalid&type=error");
  }

  let existingUser = null;

  try {
    existingUser = await getUserByEmail(email);
  } catch {
    redirect("/register?toast=db&type=error");
  }

  if (existingUser) {
    redirect("/register?toast=exists&type=error");
  }

  let user = null;

  try {
    user = await createUser({
      name,
      email,
      passwordHash: hashPassword(password),
    });
  } catch {
    redirect("/register?toast=db&type=error");
  }

  if (!user) {
    redirect("/register?toast=failed&type=error");
  }

  await createSession(user.id);
  redirect("/dashboard?toast=registered&type=success");
}

export async function loginAction(formData: FormData) {
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!email || !password) {
    redirect("/login?toast=invalid&type=error");
  }

  let user = null;

  try {
    user = await getUserByEmail(email);
  } catch {
    redirect("/login?toast=db&type=error");
  }

  if (!user || !verifyPassword(password, user.password_hash)) {
    redirect("/login?toast=credentials&type=error");
  }

  await createSession(user.id);
  redirect("/dashboard?toast=welcome_back&type=success");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login?toast=signed_out&type=success");
}
