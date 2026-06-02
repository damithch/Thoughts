"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearSession, createSession, getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { createThought, createUser, getUserByEmail, updateThought } from "@/lib/db";

export async function createThoughtAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const category = formData.get("category")?.toString().trim() ?? "";
  const excerpt = formData.get("excerpt")?.toString().trim() ?? "";

  if (!title || !category || !excerpt) {
    return;
  }

  try {
    await createThought({
      title,
      category,
      excerpt,
      userId: currentUser.id,
    });
  } catch {
    redirect("/dashboard?error=db");
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  redirect("/dashboard");
}

export async function updateThoughtAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const thoughtId = Number(formData.get("thoughtId"));
  const title = formData.get("title")?.toString().trim() ?? "";
  const category = formData.get("category")?.toString().trim() ?? "";
  const excerpt = formData.get("excerpt")?.toString().trim() ?? "";

  if (!Number.isInteger(thoughtId) || thoughtId <= 0 || !title || !category || !excerpt) {
    redirect("/dashboard?error=invalid");
  }

  try {
    const updated = await updateThought({
      id: thoughtId,
      title,
      category,
      excerpt,
      userId: currentUser.id,
    });

    if (!updated) {
      redirect("/dashboard?error=invalid");
    }
  } catch {
    redirect("/dashboard?error=db");
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
  const name = formData.get("name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!name || !email || password.length < 8) {
    redirect("/register?error=invalid");
  }

  let existingUser = null;

  try {
    existingUser = await getUserByEmail(email);
  } catch {
    redirect("/register?error=db");
  }

  if (existingUser) {
    redirect("/register?error=exists");
  }

  let user = null;

  try {
    user = await createUser({
      name,
      email,
      passwordHash: hashPassword(password),
    });
  } catch {
    redirect("/register?error=db");
  }

  if (!user) {
    redirect("/register?error=failed");
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!email || !password) {
    redirect("/login?error=invalid");
  }

  let user = null;

  try {
    user = await getUserByEmail(email);
  } catch {
    redirect("/login?error=db");
  }

  if (!user || !verifyPassword(password, user.password_hash)) {
    redirect("/login?error=credentials");
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
