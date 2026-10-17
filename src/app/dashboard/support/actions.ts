"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { recordBreathingSession, updateSupportDay, upsertUserSettings } from "@/lib/db";
import type { SupportDayUpdate } from "@/lib/db";
import { readSupportPlanInput } from "@/lib/support";
import { getCurrentColomboDate } from "@/lib/time";

type ActionResult = { ok: true } | { ok: false; error: string };

const SESSION_EXPIRED = "Your session has expired. Sign in again.";

function revalidateSupport() {
  revalidatePath("/dashboard/support");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks", "layout");
}

export async function updateSupportDayAction(update: {
  ate?: boolean | null;
  slept?: boolean | null;
  connected?: boolean | null;
  stepsTried?: string[];
}): Promise<ActionResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: SESSION_EXPIRED };
  }

  const clean: SupportDayUpdate = {};
  for (const key of ["ate", "slept", "connected"] as const) {
    const value = update[key];
    if (value === true || value === false || value === null) clean[key] = value;
  }

  if (Array.isArray(update.stepsTried)) {
    clean.stepsTried = update.stepsTried.filter((step) => typeof step === "string").map((step) => step.slice(0, 140)).slice(0, 20);
  }

  try {
    await updateSupportDay(currentUser.id, getCurrentColomboDate(), clean);
  } catch (error) {
    console.error("Failed to update the support day.", error);
    return { ok: false, error: "That couldn't be saved. Try again." };
  }

  revalidatePath("/dashboard/support");
  return { ok: true };
}

// "I'm okay for now": hides the rough-patch card until a newer low entry.
export async function dismissSupportAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  await updateSupportDay(currentUser.id, getCurrentColomboDate(), { dismiss: true });
  revalidateSupport();

  const back = formData.get("back")?.toString() ?? "";
  redirect(back.startsWith("/dashboard") ? back : "/dashboard");
}

export async function logBreathingAction(
  seconds: number,
): Promise<{ ok: true; completedTask: string | null } | { ok: false; error: string }> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false, error: SESSION_EXPIRED };
  }

  const rounded = Math.round(seconds);

  if (!Number.isFinite(rounded) || rounded < 1 || rounded > 3600) {
    return { ok: false, error: "That session couldn't be logged." };
  }

  try {
    const result = await recordBreathingSession(currentUser.id, getCurrentColomboDate(), rounded, true);
    revalidateSupport();
    revalidatePath("/dashboard/completion");
    return { ok: true, completedTask: result.completedTask };
  } catch (error) {
    console.error("Failed to log a breathing session.", error);
    return { ok: false, error: "That session couldn't be logged." };
  }
}

// The plan editor form: steps one per line, up to three people, the helpline, and on/off.
export async function saveSupportPlanAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const contacts = [0, 1, 2]
    .map((index) => ({
      name: formData.get(`contactName${index}`)?.toString() ?? "",
      phone: formData.get(`contactPhone${index}`)?.toString() ?? "",
    }))
    .filter((contact) => contact.name.trim() || contact.phone.trim());

  const input = readSupportPlanInput({
    enabled: formData.get("enabled") === "on",
    copingSteps: (formData.get("copingSteps")?.toString() ?? "").split(/\r?\n/),
    contacts,
    helpline: {
      name: formData.get("helplineName")?.toString() ?? "",
      phone: formData.get("helplinePhone")?.toString() ?? "",
    },
  });

  if ("error" in input) {
    redirect(`/dashboard/support?toast=${encodeURIComponent(input.error)}&type=error#plan`);
  }

  await upsertUserSettings(currentUser.id, input.patch);
  revalidateSupport();
  redirect("/dashboard/support?toast=plan_saved&type=success#plan");
}
