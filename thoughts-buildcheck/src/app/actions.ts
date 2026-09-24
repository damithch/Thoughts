"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearSession, createSession, getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import {
  BookIdeaStatus,
  CheckInEnergy,
  CheckInFocus,
  createBook,
  createBookIdea,
  createDailyCheckIn,
  createRecurringTask,
  createTask,
  createThought,
  createUser,
  deleteRecurringTask,
  deleteThought,
  generateDailyTasksFromRecurring,
  getUserByEmail,
  moveOpenTasksToDate,
  TaskPriority,
  TaskStatus,
  updateBookIdeaStatus,
  updateRecurringTask,
  updateTaskStatus,
  updateThought,
  upsertDayRecord,
} from "@/lib/db";
import { shiftColomboDate } from "@/lib/time";

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

function parseSourceType(value: FormDataEntryValue | null) {
  const sourceType = value?.toString() ?? "";

  if (
    sourceType === "book" ||
    sourceType === "article" ||
    sourceType === "podcast" ||
    sourceType === "principle"
  ) {
    return sourceType;
  }

  return null;
}

function parseIdeaStatus(value: FormDataEntryValue | null): BookIdeaStatus | null {
  const status = value?.toString() ?? "";

  if (
    status === "understood" ||
    status === "noticed" ||
    status === "applied" ||
    status === "internalized"
  ) {
    return status;
  }

  return null;
}

function parseTaskPriority(value: FormDataEntryValue | null): TaskPriority | null {
  const priority = value?.toString() ?? "";

  if (priority === "low" || priority === "medium" || priority === "high") {
    return priority;
  }

  return null;
}

function parseTaskStatus(value: FormDataEntryValue | null): TaskStatus | null {
  const status = value?.toString() ?? "";

  if (status === "todo" || status === "in_progress" || status === "done" || status === "skipped") {
    return status;
  }

  return null;
}

function parseCheckInEnergy(value: FormDataEntryValue | null): CheckInEnergy | null {
  const energy = value?.toString() ?? "";

  if (energy === "low" || energy === "steady" || energy === "high") {
    return energy;
  }

  return null;
}

function parseCheckInFocus(value: FormDataEntryValue | null): CheckInFocus | null {
  const focus = value?.toString() ?? "";

  if (focus === "scattered" || focus === "okay" || focus === "locked_in") {
    return focus;
  }

  return null;
}

function parseDate(value: FormDataEntryValue | null) {
  const date = value?.toString() ?? "";

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  const date = value?.toString().trim() ?? "";

  if (!date) {
    return null;
  }

  return parseDate(date);
}

function parseDaysOfWeek(formData: FormData) {
  const allowedDays = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

  return Array.from(
    new Set(
      formData
        .getAll("daysOfWeek")
        .map((value) => value.toString())
        .filter((value) => allowedDays.has(value)),
    ),
  );
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
  const conceptTags = parseTags(formData.get("conceptTags"));
  const summary = formData.get("summary")?.toString().trim() ?? "";
  const body = formData.get("body")?.toString().trim() ?? "";
  const linkedBookIdeaIdValue = Number(formData.get("bookIdeaId"));
  const linkedBookIdeaId =
    Number.isInteger(linkedBookIdeaIdValue) && linkedBookIdeaIdValue > 0
      ? linkedBookIdeaIdValue
      : null;
  const insightReflection = formData.get("insightReflection")?.toString().trim() ?? "";

  if (!title || !category || !mood || !summary) {
    redirect("/dashboard?toast=invalid_entry&type=error");
  }

  try {
    await createThought({
      title,
      category,
      mood,
      tags,
      conceptTags,
      summary,
      body,
      linkedBookIdeaId,
      insightReflection,
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
  const conceptTags = parseTags(formData.get("conceptTags"));
  const summary = formData.get("summary")?.toString().trim() ?? "";
  const body = formData.get("body")?.toString().trim() ?? "";
  const linkedBookIdeaIdValue = Number(formData.get("bookIdeaId"));
  const linkedBookIdeaId =
    Number.isInteger(linkedBookIdeaIdValue) && linkedBookIdeaIdValue > 0
      ? linkedBookIdeaIdValue
      : null;
  const insightReflection = formData.get("insightReflection")?.toString().trim() ?? "";

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
      conceptTags,
      summary,
      body,
      linkedBookIdeaId,
      insightReflection,
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

export async function createTaskAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const priority = parseTaskPriority(formData.get("priority"));
  const tags = parseTags(formData.get("tags"));
  const note = formData.get("note")?.toString().trim() ?? "";
  const date = parseDate(formData.get("date"));

  if (!title || !priority || !date) {
    redirect("/dashboard/today?toast=task_invalid&type=error");
  }

  try {
    await createTask({
      title,
      priority,
      tags,
      note,
      scheduledDate: date,
      userId: currentUser.id,
    });
  } catch {
    redirect("/dashboard/today?toast=task_save_failed&type=error");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/today");
  redirect(`/dashboard/today?date=${date}&toast=task_created&type=success`);
}

export async function updateTaskStatusAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const taskId = Number(formData.get("taskId"));
  const status = parseTaskStatus(formData.get("status"));
  const date = parseDate(formData.get("date"));

  if (!Number.isInteger(taskId) || taskId <= 0 || !status || !date) {
    redirect("/dashboard/today?toast=task_update_failed&type=error");
  }

  try {
    const updated = await updateTaskStatus({
      id: taskId,
      status,
      userId: currentUser.id,
    });

    if (!updated) {
      redirect(`/dashboard/today?date=${date}&toast=task_update_failed&type=error`);
    }
  } catch {
    redirect(`/dashboard/today?date=${date}&toast=task_update_failed&type=error`);
  }

  revalidatePath("/dashboard/today");
  redirect(`/dashboard/today?date=${date}&toast=task_updated&type=success`);
}

export async function saveDayRecordAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const date = parseDate(formData.get("date"));
  const intention = formData.get("intention")?.toString().trim() ?? "";
  const note = formData.get("note")?.toString().trim() ?? "";
  const moodValue = formData.get("endOfDayMood");
  const mood = moodValue ? parseMood(moodValue) : null;

  if (!date) {
    redirect("/dashboard/today?toast=day_invalid&type=error");
  }

  if (moodValue && !mood) {
    redirect(`/dashboard/today?date=${date}&toast=day_invalid&type=error`);
  }

  try {
    await upsertDayRecord({
      entryDate: date,
      intention,
      note,
      endOfDayMood: mood,
      userId: currentUser.id,
    });
  } catch {
    redirect(`/dashboard/today?date=${date}&toast=day_save_failed&type=error`);
  }

  revalidatePath("/dashboard/today");
  redirect(`/dashboard/today?date=${date}&toast=day_saved&type=success`);
}

export async function rolloverTasksAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const fromDate = parseDate(formData.get("date"));

  if (!fromDate) {
    redirect("/dashboard/today?toast=rollover_failed&type=error");
  }

  const toDate = shiftColomboDate(fromDate, 1);

  try {
    const moved = await moveOpenTasksToDate(currentUser.id, fromDate, toDate);

    if (moved === 0) {
      redirect(`/dashboard/today?date=${fromDate}&toast=rollover_empty&type=info`);
    }
  } catch {
    redirect(`/dashboard/today?date=${fromDate}&toast=rollover_failed&type=error`);
  }

  revalidatePath("/dashboard/today");
  redirect(`/dashboard/today?date=${toDate}&toast=rollover_done&type=success`);
}

export async function createDailyCheckInAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const date = parseDate(formData.get("date"));
  const mood = parseMood(formData.get("mood"));
  const energy = parseCheckInEnergy(formData.get("energy"));
  const focus = parseCheckInFocus(formData.get("focus"));
  const note = formData.get("note")?.toString().trim() ?? "";

  if (!date || !mood || !energy || !focus) {
    redirect(`/dashboard/today?date=${date ?? ""}&toast=checkin_invalid&type=error`);
  }

  try {
    await createDailyCheckIn({
      entryDate: date,
      mood,
      energy,
      focus,
      note,
      userId: currentUser.id,
    });
  } catch {
    redirect(`/dashboard/today?date=${date}&toast=checkin_save_failed&type=error`);
  }

  revalidatePath("/dashboard/today");
  redirect(`/dashboard/today?date=${date}&toast=checkin_saved&type=success`);
}

export async function createRecurringTaskAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const priority = parseTaskPriority(formData.get("priority"));
  const tags = parseTags(formData.get("tags"));
  const note = formData.get("note")?.toString().trim() ?? "";
  const daysOfWeek = parseDaysOfWeek(formData);
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseOptionalDate(formData.get("endDate"));

  if (!title || !priority || daysOfWeek.length === 0 || !startDate || (endDate && endDate < startDate)) {
    redirect("/dashboard/tasks?toast=recurring_invalid&type=error");
  }

  try {
    await createRecurringTask({
      title,
      priority,
      tags,
      note,
      daysOfWeek,
      startDate,
      endDate,
      userId: currentUser.id,
    });
  } catch {
    redirect("/dashboard/tasks?toast=recurring_save_failed&type=error");
  }

  revalidatePath("/dashboard/tasks");
  redirect("/dashboard/tasks?toast=recurring_created&type=success");
}

export async function updateRecurringTaskAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const taskId = Number(formData.get("taskId"));
  const title = formData.get("title")?.toString().trim() ?? "";
  const priority = parseTaskPriority(formData.get("priority"));
  const tags = parseTags(formData.get("tags"));
  const note = formData.get("note")?.toString().trim() ?? "";
  const isActive = formData.get("isActive") === "on";
  const daysOfWeek = parseDaysOfWeek(formData);
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseOptionalDate(formData.get("endDate"));

  if (
    !Number.isInteger(taskId) ||
    taskId <= 0 ||
    !title ||
    !priority ||
    daysOfWeek.length === 0 ||
    !startDate ||
    (endDate && endDate < startDate)
  ) {
    redirect("/dashboard/tasks?toast=recurring_update_failed&type=error");
  }

  try {
    const updated = await updateRecurringTask({
      id: taskId,
      title,
      priority,
      tags,
      note,
      isActive,
      daysOfWeek,
      startDate,
      endDate,
      userId: currentUser.id,
    });

    if (!updated) {
      redirect("/dashboard/tasks?toast=recurring_update_failed&type=error");
    }
  } catch {
    redirect("/dashboard/tasks?toast=recurring_update_failed&type=error");
  }

  revalidatePath("/dashboard/tasks");
  redirect("/dashboard/tasks?toast=recurring_updated&type=success");
}

export async function deleteRecurringTaskAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const taskId = Number(formData.get("taskId"));

  if (!Number.isInteger(taskId) || taskId <= 0) {
    redirect("/dashboard/tasks?toast=recurring_delete_failed&type=error");
  }

  try {
    const deleted = await deleteRecurringTask(taskId, currentUser.id);

    if (!deleted) {
      redirect("/dashboard/tasks?toast=recurring_delete_failed&type=error");
    }
  } catch {
    redirect("/dashboard/tasks?toast=recurring_delete_failed&type=error");
  }

  revalidatePath("/dashboard/tasks");
  redirect("/dashboard/tasks?toast=recurring_deleted&type=success");
}

export async function applyRecurringTasksAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const date = parseDate(formData.get("date"));

  if (!date) {
    redirect("/dashboard/today?toast=apply_failed&type=error");
  }

  try {
    const count = await generateDailyTasksFromRecurring(currentUser.id, date);

    if (count === 0) {
      redirect(`/dashboard/today?date=${date}&toast=apply_empty&type=info`);
    }

    revalidatePath("/dashboard/today");
    redirect(`/dashboard/today?date=${date}&toast=recurring_applied&type=success`);
  } catch {
    redirect(`/dashboard/today?date=${date}&toast=apply_failed&type=error`);
  }
}

export async function createBookAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const author = formData.get("author")?.toString().trim() ?? "";
  const sourceType = parseSourceType(formData.get("sourceType"));

  if (!title || !sourceType) {
    redirect("/dashboard/insights?toast=book_invalid&type=error");
  }

  try {
    await createBook({
      title,
      author,
      sourceType,
      userId: currentUser.id,
    });
  } catch {
    redirect("/dashboard/insights?toast=book_failed&type=error");
  }

  revalidatePath("/dashboard/insights");
  redirect("/dashboard/insights?toast=book_created&type=success");
}

export async function createBookIdeaAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const bookId = Number(formData.get("bookId"));
  const ideaText = formData.get("ideaText")?.toString().trim() ?? "";
  const status = parseIdeaStatus(formData.get("status"));

  if (!Number.isInteger(bookId) || bookId <= 0 || !ideaText || !status) {
    redirect("/dashboard/insights?toast=idea_invalid&type=error");
  }

  try {
    const created = await createBookIdea(
      {
        bookId,
        ideaText,
        status,
      },
      currentUser.id,
    );

    if (!created) {
      redirect("/dashboard/insights?toast=idea_invalid&type=error");
    }
  } catch {
    redirect("/dashboard/insights?toast=idea_failed&type=error");
  }

  revalidatePath("/dashboard/insights");
  redirect("/dashboard/insights?toast=idea_created&type=success");
}

export async function updateBookIdeaStatusAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const bookIdeaId = Number(formData.get("bookIdeaId"));
  const status = parseIdeaStatus(formData.get("status"));

  if (!Number.isInteger(bookIdeaId) || bookIdeaId <= 0 || !status) {
    redirect("/dashboard/insights?toast=idea_update_failed&type=error");
  }

  try {
    const updated = await updateBookIdeaStatus(bookIdeaId, status, currentUser.id);

    if (!updated) {
      redirect("/dashboard/insights?toast=idea_update_failed&type=error");
    }
  } catch {
    redirect("/dashboard/insights?toast=idea_update_failed&type=error");
  }

  revalidatePath("/dashboard/insights");
  revalidatePath("/dashboard");
  redirect("/dashboard/insights?toast=idea_updated&type=success");
}
