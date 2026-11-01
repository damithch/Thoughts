// Worry postponement: dependency-free validation and progress maths, shared by the MCP tools
// and their tests. Limits match the web worksheet and voice capture.
import { shiftColomboDate } from "../time.ts";
import { isValidTaskDate } from "../tasks/validation.ts";

export const WORRY_LIMITS = {
  worryLength: 300,
  beliefLength: 500,
  evidenceLength: 500,
  textLength: 4000,
  placeLength: 120,
} as const;

export const THINKING_TIME_DURATIONS = [5, 10, 15, 20, 30] as const;
export const WORRY_STATUSES = ["active", "completed", "abandoned"] as const;
export type WorryStatus = (typeof WORRY_STATUSES)[number];

type Body = Record<string, unknown>;
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// Multi-line text keeps its line breaks.
function cleanLongText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function intInRange(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

// A date that is missing means today; future days are refused (you can't have lived them yet).
export function parseWorryDate(value: unknown, today: string): Result<string> {
  if (value === undefined || value === null || value === "") return { ok: true, value: today };
  if (!isValidTaskDate(value)) return { ok: false, error: "date must be a valid YYYY-MM-DD date." };
  if (value > today) return { ok: false, error: "date can't be in the future." };
  return { ok: true, value };
}

export function parseWorryText(value: unknown): Result<string> {
  const text = cleanText(value, WORRY_LIMITS.worryLength);
  return text ? { ok: true, value: text } : { ok: false, error: "Write the worry in a few words." };
}

export function parseNewModule(body: Body): Result<{ beliefText: string; beliefBeforePct: number | null }> {
  const beliefText = cleanText(body.beliefText, WORRY_LIMITS.beliefLength);
  if (!beliefText) return { ok: false, error: "beliefText is required: the worry belief to test, e.g. 'Worrying helps me prepare'." };
  if (body.beliefBeforePct === undefined || body.beliefBeforePct === null) return { ok: true, value: { beliefText, beliefBeforePct: null } };
  const pct = intInRange(body.beliefBeforePct, 0, 100);
  if (pct === undefined) return { ok: false, error: "beliefBeforePct must be a whole number from 0 to 100." };
  return { ok: true, value: { beliefText, beliefBeforePct: pct } };
}

export type WorryModuleChanges = {
  beliefText?: string;
  beliefBeforePct?: number | null;
  beliefAfterPct?: number | null;
  thinkingTimeStart?: string;
  thinkingTimeDuration?: number;
  thinkingTimePlace?: string;
  predictionText?: string;
  predictionConfidence?: number | null;
  reflectionText?: string;
  status?: WorryStatus;
};

// Only the fields that were sent change. null clears a rating.
export function parseModuleChanges(body: Body): Result<WorryModuleChanges> {
  const changes: WorryModuleChanges = {};

  if (body.beliefText !== undefined) {
    const text = cleanText(body.beliefText, WORRY_LIMITS.beliefLength);
    if (!text) return { ok: false, error: "beliefText can't be empty." };
    changes.beliefText = text;
  }

  for (const key of ["beliefBeforePct", "beliefAfterPct"] as const) {
    if (body[key] === undefined) continue;
    if (body[key] === null) {
      changes[key] = null;
      continue;
    }
    const pct = intInRange(body[key], 0, 100);
    if (pct === undefined) return { ok: false, error: `${key} must be a whole number from 0 to 100, or null.` };
    changes[key] = pct;
  }

  if (body.predictionConfidence !== undefined) {
    if (body.predictionConfidence === null) changes.predictionConfidence = null;
    else {
      const confidence = intInRange(body.predictionConfidence, 0, 10);
      if (confidence === undefined) return { ok: false, error: "predictionConfidence must be a whole number from 0 to 10, or null." };
      changes.predictionConfidence = confidence;
    }
  }

  if (body.thinkingTimeStart !== undefined) {
    const start = typeof body.thinkingTimeStart === "string" ? body.thinkingTimeStart.trim() : "";
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(start);
    if (!match) return { ok: false, error: "thinkingTimeStart must be a time like 18:30." };
    changes.thinkingTimeStart = `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  if (body.thinkingTimeDuration !== undefined) {
    if (!(THINKING_TIME_DURATIONS as readonly unknown[]).includes(body.thinkingTimeDuration)) {
      return { ok: false, error: `thinkingTimeDuration must be one of ${THINKING_TIME_DURATIONS.join(", ")} minutes.` };
    }
    changes.thinkingTimeDuration = body.thinkingTimeDuration as number;
  }

  if (body.thinkingTimePlace !== undefined) changes.thinkingTimePlace = cleanText(body.thinkingTimePlace, WORRY_LIMITS.placeLength);
  if (body.predictionText !== undefined) changes.predictionText = cleanLongText(body.predictionText, WORRY_LIMITS.textLength);
  if (body.reflectionText !== undefined) changes.reflectionText = cleanLongText(body.reflectionText, WORRY_LIMITS.textLength);

  if (body.status !== undefined) {
    const status = WORRY_STATUSES.find((value) => value === body.status);
    if (!status) return { ok: false, error: "status must be active, completed or abandoned." };
    changes.status = status;
  }

  if (Object.keys(changes).length === 0) return { ok: false, error: "Send at least one field to change." };
  return { ok: true, value: changes };
}

export type ExperimentDayInput = { whatHappened: string; thinkingTimeNotes: string; controllability: number };

// Fields left out keep what was already recorded for that day; a new day needs controllability.
export function parseExperimentDay(body: Body, existing: ExperimentDayInput | null): Result<ExperimentDayInput> {
  let controllability = existing?.controllability;
  if (body.controllability !== undefined) {
    controllability = intInRange(body.controllability, 0, 10);
    if (controllability === undefined) return { ok: false, error: "controllability must be a whole number from 0 to 10." };
  }
  if (controllability === undefined) {
    return { ok: false, error: "controllability (0-10) is required: how controllable did the worry feel today?" };
  }

  return {
    ok: true,
    value: {
      whatHappened: body.whatHappened === undefined ? existing?.whatHappened ?? "" : cleanLongText(body.whatHappened, WORRY_LIMITS.textLength),
      thinkingTimeNotes:
        body.thinkingTimeNotes === undefined ? existing?.thinkingTimeNotes ?? "" : cleanLongText(body.thinkingTimeNotes, WORRY_LIMITS.textLength),
      controllability,
    },
  };
}

export type WorryProgress = {
  // Day 1 is the day the experiment started (Colombo dates).
  dayNumber: number;
  startedOn: string;
  experimentDaysRecorded: number;
  postponedTotal: number;
  postponedToday: number;
  postponedByDay: { date: string; count: number }[];
  avgControllability: number | null;
  // Controllability on the first and the latest recorded day, to see the trend.
  firstControllability: number | null;
  latestControllability: number | null;
  beliefChange: number | null;
};

export function computeWorryProgress(
  module: { started_on: string; belief_before_pct: number | null; belief_after_pct: number | null },
  days: { entry_date: string; controllability: number }[],
  items: { entry_date: string }[],
  today: string,
): WorryProgress {
  const ordered = [...days].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const byDay = new Map<string, number>();
  for (const item of items) byDay.set(item.entry_date, (byDay.get(item.entry_date) ?? 0) + 1);

  let dayNumber = 1;
  for (let day = module.started_on; day < today; day = shiftColomboDate(day, 1)) dayNumber += 1;

  const average = ordered.length
    ? Math.round((ordered.reduce((sum, day) => sum + day.controllability, 0) / ordered.length) * 10) / 10
    : null;

  return {
    dayNumber,
    startedOn: module.started_on,
    experimentDaysRecorded: ordered.length,
    postponedTotal: items.length,
    postponedToday: byDay.get(today) ?? 0,
    postponedByDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    avgControllability: average,
    firstControllability: ordered[0]?.controllability ?? null,
    latestControllability: ordered[ordered.length - 1]?.controllability ?? null,
    beliefChange:
      module.belief_before_pct !== null && module.belief_after_pct !== null ? module.belief_after_pct - module.belief_before_pct : null,
  };
}
