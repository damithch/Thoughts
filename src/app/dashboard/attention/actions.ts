"use server";

import { revalidatePath } from "next/cache";

import { MEDITATION_STEP_LIMITS, normalizeTaskName } from "@/lib/attention/rules";
import { editAttentionSession, reflectOnAttentionSession, saveAttentionSession } from "@/lib/attention/service";
import { getCurrentUser } from "@/lib/auth";
import {
  addAttentionTaskIdea,
  deleteAttentionSession,
  deleteAttentionTaskIdea,
  setAttentionReminder,
  upsertUserSettings,
} from "@/lib/db";
import type { AttentionSession } from "@/lib/db";
import { parseClockTime } from "@/lib/tasks/validation";
import { getCurrentColomboDate } from "@/lib/time";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SESSION_EXPIRED = "Your session has expired. Sign in again.";
const COULD_NOT_SAVE = "That couldn't be saved. Try again.";

function refresh(tasksChanged = false) {
  revalidatePath("/dashboard/attention");
  if (tasksChanged) {
    revalidatePath("/dashboard/tasks", "layout");
    revalidatePath("/dashboard/completion");
  }
}

type Failure = { ok: false; error: string };

async function withUser<R>(run: (userId: number) => Promise<R>): Promise<R | Failure> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SESSION_EXPIRED } satisfies Failure;

  try {
    return await run(user.id);
  } catch (error) {
    console.error("Attention training action error.", error);
    return { ok: false, error: COULD_NOT_SAVE } satisfies Failure;
  }
}

export async function createAttentionSessionAction(
  body: Record<string, unknown>,
): Promise<Result<{ session: AttentionSession; completedTask: string | null }>> {
  return withUser(async (userId) => {
    const result = await saveAttentionSession(userId, body);
    if (!result.ok) return { ok: false as const, error: result.error };
    refresh(result.completedTask !== null);
    return { ok: true as const, session: result.session, completedTask: result.completedTask };
  });
}

export async function updateAttentionSessionAction(
  id: number,
  changes: Record<string, unknown>,
): Promise<Result<{ session: AttentionSession }>> {
  return withUser(async (userId) => {
    const result = await editAttentionSession(userId, id, changes);
    if (!result.ok) return { ok: false as const, error: result.error };
    refresh();
    return { ok: true as const, session: result.session };
  });
}

export async function deleteAttentionSessionAction(id: number): Promise<Result> {
  return withUser(async (userId) => {
    if (!(await deleteAttentionSession(id, userId))) return { ok: false as const, error: "That session doesn't exist." };
    refresh();
    return { ok: true as const };
  });
}

export async function reflectOnAttentionSessionAction(
  id: number,
  input: { mood: number | null; text: string },
): Promise<Result<{ thoughtId: number }>> {
  return withUser(async (userId) => {
    const result = await reflectOnAttentionSession(userId, id, input);
    if (!result.ok) return { ok: false as const, error: result.error };
    revalidatePath("/dashboard");
    return { ok: true as const, thoughtId: result.thoughtId };
  });
}

export async function saveAttentionStepsAction(steps: { observe: number; belly: number; body: number }): Promise<Result> {
  return withUser(async (userId) => {
    const clean = (value: unknown) =>
      typeof value === "number" && Number.isInteger(value) && value >= MEDITATION_STEP_LIMITS.min && value <= MEDITATION_STEP_LIMITS.max
        ? value
        : null;
    const observe = clean(steps.observe);
    const belly = clean(steps.belly);
    const body = clean(steps.body);

    if (observe === null || belly === null || body === null) {
      return { ok: false as const, error: "Each step must be between 15 seconds and 10 minutes." };
    }

    await upsertUserSettings(userId, {
      attention_observe_seconds: observe,
      attention_belly_seconds: belly,
      attention_body_seconds: body,
    });
    refresh();
    return { ok: true as const };
  });
}

export async function setAttentionReminderAction(time: string | null): Promise<Result<{ time: string | null }>> {
  return withUser(async (userId) => {
    const clock = time === null || time === "" ? null : parseClockTime(time);
    if (time && !clock) return { ok: false as const, error: "The reminder time must look like 07:30." };

    const reminder = await setAttentionReminder(userId, clock, getCurrentColomboDate());
    refresh(true);
    return { ok: true as const, time: reminder?.time ?? null };
  });
}

export async function addAttentionIdeaAction(name: string): Promise<Result> {
  return withUser(async (userId) => {
    const clean = normalizeTaskName(name);
    if (!clean) return { ok: false as const, error: "Name the everyday task." };
    await addAttentionTaskIdea(userId, clean);
    refresh();
    return { ok: true as const };
  });
}

export async function deleteAttentionIdeaAction(id: number): Promise<Result> {
  return withUser(async (userId) => {
    await deleteAttentionTaskIdea(id, userId);
    refresh();
    return { ok: true as const };
  });
}
