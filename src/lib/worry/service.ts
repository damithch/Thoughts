import "server-only";

import {
  createPostponedItem,
  createWorryEvidence,
  createWorryModule,
  getActiveWorryModule,
  getLatestWorryModule,
  getPostponedItemsForModule,
  updateWorryModule,
  upsertWorryExperimentDay,
} from "@/lib/db/worry-postponement";
import type { WorryPostponementModule } from "@/lib/db/types";
import { toColomboExportParts } from "@/lib/time";
import {
  computeWorryProgress,
  parseExperimentDay,
  parseModuleChanges,
  parseNewModule,
  parseWorryDate,
  parseWorryText,
  WORRY_LIMITS,
} from "@/lib/worry/rules";

// Worry postponement for the MCP tools: everything acts on the user's active experiment, so
// Claude never has to know module ids.

type Failure = { ok: false; error: string };

const NO_ACTIVE =
  "No worry postponement experiment is running. Start one with start_worry_module (the worry belief to test), or in the app.";

async function requireActive(userId: number): Promise<WorryPostponementModule | Failure> {
  return (await getActiveWorryModule(userId)) ?? { ok: false, error: NO_ACTIVE };
}

function isFailure(value: unknown): value is Failure {
  return typeof value === "object" && value !== null && (value as Failure).ok === false;
}

// The current experiment (or the most recent one if none is running) with its progress.
export async function getWorryOverview(userId: number, today: string) {
  const experiment = (await getActiveWorryModule(userId)) ?? (await getLatestWorryModule(userId));
  if (!experiment) return { active: false, module: null, message: NO_ACTIVE };

  const items = await getPostponedItemsForModule(experiment.id);
  const startedOn = toColomboExportParts(experiment.created_at).date;

  return {
    active: experiment.status === "active",
    module: {
      id: experiment.id,
      status: experiment.status,
      belief: experiment.belief_text,
      beliefBeforePct: experiment.belief_before_pct,
      beliefAfterPct: experiment.belief_after_pct,
      thinkingTime: {
        start: experiment.thinking_time_start || null,
        durationMinutes: experiment.thinking_time_duration,
        place: experiment.thinking_time_place || null,
      },
      prediction: experiment.prediction_text || null,
      predictionConfidence: experiment.prediction_confidence,
      reflection: experiment.reflection_text || null,
      startedOn,
    },
    progress: computeWorryProgress(
      { started_on: startedOn, belief_before_pct: experiment.belief_before_pct, belief_after_pct: experiment.belief_after_pct },
      experiment.experiment_days,
      items,
      today,
    ),
    evidence: {
      for: experiment.evidence.filter((item) => item.side === "for").map((item) => ({ id: item.id, content: item.content })),
      against: experiment.evidence.filter((item) => item.side === "against").map((item) => ({ id: item.id, content: item.content })),
    },
    experimentDays: experiment.experiment_days,
    postponedToday: items.filter((item) => item.entry_date === today).map((item) => ({ id: item.id, content: item.content, createdAt: item.created_at })),
    recentPostponed: items.slice(-20).reverse().map((item) => ({ id: item.id, date: item.entry_date, content: item.content })),
  };
}

export async function startWorryModule(userId: number, body: Record<string, unknown>) {
  const parsed = parseNewModule(body);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  if (await getActiveWorryModule(userId)) {
    return { ok: false as const, error: "An experiment is already running. Finish it with update_worry_module (status completed or abandoned) first." };
  }
  const experiment = await createWorryModule({ userId, ...parsed.value });
  return { ok: true as const, module: experiment };
}

export async function logPostponedWorry(userId: number, body: Record<string, unknown>, today: string) {
  const text = parseWorryText(body.content);
  if (!text.ok) return { ok: false as const, error: text.error };
  const date = parseWorryDate(body.date, today);
  if (!date.ok) return { ok: false as const, error: date.error };
  const experiment = await requireActive(userId);
  if (isFailure(experiment)) return experiment;

  const item = await createPostponedItem(experiment.id, date.value, text.value);
  const items = await getPostponedItemsForModule(experiment.id);

  return {
    ok: true as const,
    item,
    postponedThatDay: items.filter((entry) => entry.entry_date === date.value).length,
    thinkingTime: {
      start: experiment.thinking_time_start || null,
      durationMinutes: experiment.thinking_time_duration,
      place: experiment.thinking_time_place || null,
    },
  };
}

export async function recordWorryExperimentDay(userId: number, body: Record<string, unknown>, today: string) {
  const date = parseWorryDate(body.date, today);
  if (!date.ok) return { ok: false as const, error: date.error };
  const experiment = await requireActive(userId);
  if (isFailure(experiment)) return experiment;

  const existing = experiment.experiment_days.find((day) => day.entry_date === date.value);
  const parsed = parseExperimentDay(
    body,
    existing
      ? { whatHappened: existing.what_happened, thinkingTimeNotes: existing.thinking_time_notes, controllability: existing.controllability }
      : null,
  );
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  const day = await upsertWorryExperimentDay({ moduleId: experiment.id, entryDate: date.value, ...parsed.value });
  return { ok: true as const, day, updatedExisting: Boolean(existing) };
}

export async function changeWorryModule(userId: number, body: Record<string, unknown>) {
  const parsed = parseModuleChanges(body);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const experiment = await requireActive(userId);
  if (isFailure(experiment)) return experiment;

  const updated = await updateWorryModule({ id: experiment.id, userId, ...parsed.value });
  return updated ? { ok: true as const, module: updated } : { ok: false as const, error: NO_ACTIVE };
}

export async function addWorryEvidence(userId: number, body: Record<string, unknown>) {
  if (body.side !== "for" && body.side !== "against") {
    return { ok: false as const, error: "side must be 'for' (supports the worry belief) or 'against'." };
  }
  const content = typeof body.content === "string" ? body.content.replace(/\s+/g, " ").trim().slice(0, WORRY_LIMITS.evidenceLength) : "";
  if (!content) return { ok: false as const, error: "Write the evidence in a sentence." };
  const experiment = await requireActive(userId);
  if (isFailure(experiment)) return experiment;

  const evidence = await createWorryEvidence({ moduleId: experiment.id, side: body.side, content });
  return { ok: true as const, evidence };
}
