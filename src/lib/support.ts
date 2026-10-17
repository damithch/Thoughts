import "server-only";

import {
  getLatestSupportDismissal,
  getRecentMoodEntries,
  getSupportDay,
  getUserSettings,
  normalizePhone,
  SUPPORT_LIMITS,
} from "@/lib/db";
import type { SupportContact, SupportDay, UserSettings } from "@/lib/db";
import { detectRoughPatch, RUN_LENGTH, type RoughPatchStatus } from "@/lib/rough-patch";
import { getCurrentColomboDate } from "@/lib/time";

// Support on hard days, shared by the web pages and the /api/v1/support routes.

export type SupportPlan = {
  enabled: boolean;
  copingSteps: string[];
  contacts: SupportContact[];
  helpline: { name: string; phone: string };
};

export type SupportToday = {
  date: string;
  ate: boolean | null;
  slept: boolean | null;
  connected: boolean | null;
  stepsTried: string[];
  breathingSeconds: number;
};

export type SupportOverview = { status: RoughPatchStatus; today: SupportToday; plan: SupportPlan };

export function toSupportPlan(settings: UserSettings): SupportPlan {
  return {
    enabled: settings.support_enabled,
    copingSteps: settings.support_coping_steps,
    contacts: settings.support_contacts,
    helpline: { name: settings.support_helpline_name, phone: settings.support_helpline_phone },
  };
}

export function toSupportToday(day: SupportDay): SupportToday {
  return {
    date: day.entry_date,
    ate: day.ate,
    slept: day.slept,
    connected: day.connected,
    stepsTried: day.steps_tried,
    breathingSeconds: day.breathing_seconds,
  };
}

export async function getSupportStatus(userId: number, settings?: UserSettings): Promise<RoughPatchStatus> {
  const resolved = settings ?? (await getUserSettings(userId));
  const today = getCurrentColomboDate();
  const [entries, dismissedAt] = await Promise.all([
    getRecentMoodEntries(userId, RUN_LENGTH + 3),
    getLatestSupportDismissal(userId, today),
  ]);
  const status = detectRoughPatch(entries, new Date(), dismissedAt);

  return resolved.support_enabled ? status : { ...status, active: false };
}

export async function getSupportOverview(userId: number): Promise<SupportOverview> {
  const settings = await getUserSettings(userId);
  const today = getCurrentColomboDate();
  const [status, day] = await Promise.all([getSupportStatus(userId, settings), getSupportDay(userId, today)]);

  return { status, today: toSupportToday(day), plan: toSupportPlan(settings) };
}

// Validates an edit to the plan. Only the parts sent are changed.
export function readSupportPlanInput(body: Record<string, unknown>):
  | { patch: Partial<UserSettings> }
  | { error: string } {
  const patch: Partial<UserSettings> = {};

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return { error: "enabled must be true or false." };
    patch.support_enabled = body.enabled;
  }

  if (body.copingSteps !== undefined) {
    if (!Array.isArray(body.copingSteps) || body.copingSteps.some((step) => typeof step !== "string")) {
      return { error: "copingSteps must be a list of short sentences." };
    }

    const steps = (body.copingSteps as string[]).map((step) => step.trim()).filter(Boolean);

    if (steps.length > SUPPORT_LIMITS.steps) return { error: `Keep it to ${SUPPORT_LIMITS.steps} steps or fewer.` };
    if (steps.some((step) => step.length > SUPPORT_LIMITS.stepLength)) {
      return { error: `Keep each step under ${SUPPORT_LIMITS.stepLength} characters.` };
    }

    patch.support_coping_steps = steps;
  }

  if (body.contacts !== undefined) {
    if (!Array.isArray(body.contacts)) return { error: "contacts must be a list." };
    if (body.contacts.length > SUPPORT_LIMITS.contacts) return { error: `Add up to ${SUPPORT_LIMITS.contacts} people.` };

    const contacts: SupportContact[] = [];

    for (const raw of body.contacts as unknown[]) {
      const record = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const phone = normalizePhone(record.phone);

      if (!name || name.length > SUPPORT_LIMITS.nameLength) return { error: "Give each person a name." };
      if (!phone) return { error: `Check the phone number for ${name}.` };

      contacts.push({ name, phone });
    }

    patch.support_contacts = contacts;
  }

  if (body.helpline !== undefined) {
    const record = (body.helpline && typeof body.helpline === "object" ? body.helpline : {}) as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim().slice(0, SUPPORT_LIMITS.nameLength) : "";
    const phone = normalizePhone(record.phone);

    if (!name || !phone) return { error: "The helpline needs a name and a valid number." };

    patch.support_helpline_name = name;
    patch.support_helpline_phone = phone;
  }

  return { patch };
}
