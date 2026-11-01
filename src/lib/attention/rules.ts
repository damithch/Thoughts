// Attention training: shared, dependency-free rules. Used by the server actions, the mobile API
// and the MCP tools so every way in is validated the same way.
import { shiftColomboDate } from "../time.ts";
import { isValidTaskDate } from "../tasks/validation.ts";

export const ATTENTION_SESSION_TYPES = ["mundane_task", "meditation"] as const;
export const ATTENTION_ANCHORS = ["touch", "sight", "hearing", "smell", "taste"] as const;

export type AttentionSessionType = (typeof ATTENTION_SESSION_TYPES)[number];
export type AttentionAnchor = (typeof ATTENTION_ANCHORS)[number];

export const ATTENTION_LIMITS = {
  minMinutes: 1,
  maxMinutes: 120,
  taskNameLength: 120,
  commentsLength: 4000,
  ideaCount: 40,
  listDefault: 200,
  listMax: 500,
} as const;

export const DEFAULT_MEDITATION_NAME = "Breathing meditation";

// Meditation steps from the worksheet, in seconds (adjustable in settings).
export const DEFAULT_MEDITATION_STEPS = { observe: 60, belly: 120, body: 120 } as const;
export const MEDITATION_STEP_LIMITS = { min: 15, max: 600 } as const;

export type AttentionSessionValues = {
  sessionType: AttentionSessionType;
  taskName: string;
  entryDate: string;
  startedAt: string | null;
  durationMinutes: number;
  selfFocusBefore: number | null;
  selfFocusAfter: number | null;
  anchorsUsed: AttentionAnchor[] | null;
  moodBefore: number | null;
  moodAfter: number | null;
  comments: string | null;
};

export type ParseResult = { ok: true; value: AttentionSessionValues } | { ok: false; error: string };

type Body = Record<string, unknown>;

function isMissing(value: unknown) {
  return value === undefined || value === null || value === "";
}

function readIntInRange(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

// Optional integer field: undefined/null/"" -> null; a bad value -> an error message.
function readOptionalInt(body: Body, key: string, min: number, max: number, label: string) {
  if (isMissing(body[key])) return { value: null };
  const value = readIntInRange(body[key], min, max);

  return value === undefined ? { error: `${label} must be a whole number from ${min} to ${max}.` } : { value };
}

export function normalizeTaskName(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, ATTENTION_LIMITS.taskNameLength)
    : "";
}

export function parseAttentionAnchors(value: unknown): { value: AttentionAnchor[] | null } | { error: string } {
  if (isMissing(value)) return { value: null };
  if (!Array.isArray(value)) return { error: "anchorsUsed must be a list of senses." };

  const picked = new Set<string>();
  for (const item of value) {
    const anchor = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (!(ATTENTION_ANCHORS as readonly string[]).includes(anchor)) {
      return { error: `anchorsUsed can only contain ${ATTENTION_ANCHORS.join(", ")}.` };
    }
    picked.add(anchor);
  }

  const anchors = ATTENTION_ANCHORS.filter((anchor) => picked.has(anchor));

  return { value: anchors.length > 0 ? anchors : null };
}

// Validates a full session (for an update, merge the stored values with the changes first).
// Task focus is never read from the client: the database derives it from self focus.
export function parseAttentionSessionInput(body: Body, today: string): ParseResult {
  const sessionType = ATTENTION_SESSION_TYPES.find((type) => type === body.sessionType);
  if (!sessionType) {
    return { ok: false, error: "sessionType must be mundane_task or meditation." };
  }

  const isMundane = sessionType === "mundane_task";
  const taskName = normalizeTaskName(body.taskName) || (isMundane ? "" : DEFAULT_MEDITATION_NAME);
  if (!taskName) {
    return { ok: false, error: "Name the everyday task you practised with." };
  }

  const durationMinutes = readIntInRange(body.durationMinutes, ATTENTION_LIMITS.minMinutes, ATTENTION_LIMITS.maxMinutes);
  if (durationMinutes === undefined) {
    return { ok: false, error: "durationMinutes must be a whole number from 1 to 120." };
  }

  let entryDate = today;
  if (!isMissing(body.entryDate)) {
    if (!isValidTaskDate(body.entryDate)) return { ok: false, error: "entryDate must be a valid YYYY-MM-DD date." };
    if (body.entryDate > today) return { ok: false, error: "A session can't be logged for a future day." };
    entryDate = body.entryDate;
  }

  let startedAt: string | null = null;
  if (!isMissing(body.startedAt)) {
    const parsed = typeof body.startedAt === "string" ? new Date(body.startedAt) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "startedAt must be an ISO date-time." };
    }
    startedAt = parsed.toISOString();
  }

  const before = readOptionalInt(body, "selfFocusBefore", 0, 100, "selfFocusBefore");
  const after = readOptionalInt(body, "selfFocusAfter", 0, 100, "selfFocusAfter");
  const moodBefore = readOptionalInt(body, "moodBefore", 1, 10, "moodBefore");
  const moodAfter = readOptionalInt(body, "moodAfter", 1, 10, "moodAfter");
  const anchors = parseAttentionAnchors(body.anchorsUsed);

  for (const field of [before, after, moodBefore, moodAfter, anchors]) {
    if ("error" in field) return { ok: false, error: field.error as string };
  }

  const selfFocusBefore = (before as { value: number | null }).value;
  const selfFocusAfter = (after as { value: number | null }).value;
  const anchorsUsed = (anchors as { value: AttentionAnchor[] | null }).value;

  if (!isMundane && (selfFocusBefore !== null || selfFocusAfter !== null || anchorsUsed !== null)) {
    return { ok: false, error: "Attention percentages and sense anchors are only for mundane task sessions." };
  }

  const comments =
    typeof body.comments === "string" ? body.comments.trim().slice(0, ATTENTION_LIMITS.commentsLength) : "";

  return {
    ok: true,
    value: {
      sessionType,
      taskName,
      entryDate,
      startedAt,
      durationMinutes,
      selfFocusBefore,
      selfFocusAfter,
      anchorsUsed,
      moodBefore: (moodBefore as { value: number | null }).value,
      moodAfter: (moodAfter as { value: number | null }).value,
      comments: comments || null,
    },
  };
}

// Stored row -> the camelCase input shape, so an update can be "stored values + changes".
export function sessionToInput(session: AttentionSessionLike): Body {
  return {
    sessionType: session.session_type,
    taskName: session.task_name,
    entryDate: session.entry_date,
    startedAt: session.started_at instanceof Date ? session.started_at.toISOString() : session.started_at,
    durationMinutes: session.duration_minutes,
    selfFocusBefore: session.self_focus_before,
    selfFocusAfter: session.self_focus_after,
    anchorsUsed: session.anchors_used,
    moodBefore: session.mood_before,
    moodAfter: session.mood_after,
    comments: session.comments ?? "",
  };
}

// Only the keys an update may change; anything else in the body is ignored.
export const ATTENTION_EDITABLE_KEYS = [
  "sessionType",
  "taskName",
  "entryDate",
  "startedAt",
  "durationMinutes",
  "selfFocusBefore",
  "selfFocusAfter",
  "anchorsUsed",
  "moodBefore",
  "moodAfter",
  "comments",
] as const;

export function mergeAttentionUpdate(stored: Body, changes: Body): Body {
  const merged: Body = { ...stored };
  for (const key of ATTENTION_EDITABLE_KEYS) {
    if (key in changes) merged[key] = changes[key];
  }
  // Switching a session to meditation drops the mundane-only fields unless they were re-sent.
  if (merged.sessionType === "meditation") {
    for (const key of ["selfFocusBefore", "selfFocusAfter", "anchorsUsed"] as const) {
      if (!(key in changes)) merged[key] = null;
    }
  }
  return merged;
}

export function parseStatsRange(value: unknown): 7 | 30 {
  return value === "30d" || value === "30" || value === 30 ? 30 : 7;
}

// --- Progress ---

export type AttentionSessionLike = {
  session_type: AttentionSessionType;
  task_name: string;
  entry_date: string;
  started_at: string | Date;
  duration_minutes: number;
  self_focus_before: number | null;
  self_focus_after: number | null;
  task_focus_before: number | null;
  task_focus_after: number | null;
  anchors_used: AttentionAnchor[] | null;
  mood_before: number | null;
  mood_after: number | null;
  comments: string | null;
};

export type AttentionDay = { date: string; mundane: number; meditation: number; minutes: number };

export type AttentionStats = {
  range: 7 | 30;
  from: string;
  to: string;
  days: AttentionDay[];
  sessionCount: number;
  mundaneCount: number;
  meditationCount: number;
  totalMinutes: number;
  // Average change in task focus (after minus before) for mundane sessions with both ratings.
  avgTaskFocusChange: number | null;
  // Days in the range with at least one of each kind of practice (the worksheet's daily target).
  daysWithBoth: number;
  streak: number;
  trend: { date: string; taskName: string; before: number; after: number }[];
};

// Consecutive days with any practice, ending today. Today not logged yet doesn't reset it:
// the streak then runs up to yesterday.
export function computeAttentionStreak(activeDates: string[], today: string) {
  const active = new Set(activeDates);
  let day = active.has(today) ? today : shiftColomboDate(today, -1);
  let streak = 0;

  while (active.has(day)) {
    streak += 1;
    day = shiftColomboDate(day, -1);
  }

  return streak;
}

export function computeAttentionStats(
  sessions: AttentionSessionLike[],
  activeDates: string[],
  today: string,
  range: 7 | 30,
): AttentionStats {
  const from = shiftColomboDate(today, -(range - 1));
  const days: AttentionDay[] = [];
  const byDate = new Map<string, AttentionDay>();

  for (let offset = 0; offset < range; offset += 1) {
    const day = { date: shiftColomboDate(from, offset), mundane: 0, meditation: 0, minutes: 0 };
    days.push(day);
    byDate.set(day.date, day);
  }

  const inRange = sessions
    .filter((session) => byDate.has(session.entry_date))
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  const changes: number[] = [];
  const trend: AttentionStats["trend"] = [];

  for (const session of inRange) {
    const day = byDate.get(session.entry_date)!;
    day.minutes += session.duration_minutes;
    if (session.session_type === "mundane_task") day.mundane += 1;
    else day.meditation += 1;

    if (session.task_focus_before !== null && session.task_focus_after !== null) {
      changes.push(session.task_focus_after - session.task_focus_before);
      trend.push({
        date: session.entry_date,
        taskName: session.task_name,
        before: session.task_focus_before,
        after: session.task_focus_after,
      });
    }
  }

  const average = changes.length > 0 ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;

  return {
    range,
    from,
    to: today,
    days,
    sessionCount: inRange.length,
    mundaneCount: inRange.filter((session) => session.session_type === "mundane_task").length,
    meditationCount: inRange.filter((session) => session.session_type === "meditation").length,
    totalMinutes: inRange.reduce((sum, session) => sum + session.duration_minutes, 0),
    avgTaskFocusChange: average === null ? null : Math.round(average * 10) / 10,
    daysWithBoth: days.filter((day) => day.mundane > 0 && day.meditation > 0).length,
    streak: computeAttentionStreak(activeDates, today),
    trend,
  };
}

// "30% → 60% on the task" (neutral wording, whichever way it moved).
export function describeFocusChange(before: number | null, after: number | null) {
  if (before === null && after === null) return null;
  if (after === null) return `${before}% on the task before`;
  if (before === null) return `${after}% on the task after`;
  return `${before}% → ${after}% on the task`;
}

// Which open daily task a session ticks off: an "attention" task first; meditation also
// counts for a breathing or meditation habit.
export function taskTitlePatterns(type: AttentionSessionType) {
  return type === "meditation" ? ["%attention%", "%meditat%", "%breath%"] : ["%attention%"];
}

// --- Date ranges (reports, MCP) ---

export const REPORT_MAX_DAYS = 92;

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Missing dates default to the last 7 days ending today. Both ends inclusive.
export function parseDateRange(
  fromValue: unknown,
  toValue: unknown,
  today: string,
  maxDays: number = REPORT_MAX_DAYS,
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const to = isMissing(toValue) ? today : toValue;
  if (!isValidTaskDate(to)) return { ok: false, error: "to must be a valid YYYY-MM-DD date." };
  const from = isMissing(fromValue) ? shiftColomboDate(to, -6) : fromValue;
  if (!isValidTaskDate(from)) return { ok: false, error: "from must be a valid YYYY-MM-DD date." };
  if (from > to) return { ok: false, error: "from must be on or before to." };
  if (daysBetween(from, to) + 1 > maxDays) {
    return { ok: false, error: `A report can cover at most ${maxDays} days.` };
  }
  return { ok: true, from, to };
}

// --- Insights (analysis over a date range) ---

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function average(values: number[]) {
  return values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export type AttentionInsights = {
  from: string;
  to: string;
  sessionCount: number;
  mundaneCount: number;
  meditationCount: number;
  totalMinutes: number;
  daysPractised: number;
  focus: {
    ratedSessions: number;
    avgTaskFocusBefore: number | null;
    avgTaskFocusAfter: number | null;
    avgChange: number | null;
    // Average "after" task focus in the first and second half of the rated sessions (oldest first).
    earlierAvgAfter: number | null;
    laterAvgAfter: number | null;
  };
  byTask: { taskName: string; sessions: number; minutes: number; avgBefore: number | null; avgAfter: number | null; avgChange: number | null }[];
  anchors: { anchor: AttentionAnchor; count: number; shareOfTaskSessions: number }[];
  meditation: { sessions: number; minutes: number; avgMinutes: number | null; avgMoodChange: number | null };
  byWeekday: { weekday: (typeof WEEKDAYS)[number]; sessions: number }[];
  recentNotes: { date: string; type: AttentionSessionType; taskName: string; comments: string }[];
};

export function computeAttentionInsights(sessions: AttentionSessionLike[], from: string, to: string): AttentionInsights {
  const inRange = sessions
    .filter((session) => session.entry_date >= from && session.entry_date <= to)
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  const mundane = inRange.filter((session) => session.session_type === "mundane_task");
  const meditation = inRange.filter((session) => session.session_type === "meditation");
  const rated = mundane.filter((session) => session.task_focus_before !== null && session.task_focus_after !== null);
  const half = Math.floor(rated.length / 2);

  const tasks = new Map<string, AttentionSessionLike[]>();
  for (const session of mundane) {
    const key = session.task_name.trim().toLowerCase();
    tasks.set(key, [...(tasks.get(key) ?? []), session]);
  }

  const moodChanges = meditation
    .filter((session) => session.mood_before !== null && session.mood_after !== null)
    .map((session) => (session.mood_after as number) - (session.mood_before as number));

  return {
    from,
    to,
    sessionCount: inRange.length,
    mundaneCount: mundane.length,
    meditationCount: meditation.length,
    totalMinutes: inRange.reduce((sum, session) => sum + session.duration_minutes, 0),
    daysPractised: new Set(inRange.map((session) => session.entry_date)).size,
    focus: {
      ratedSessions: rated.length,
      avgTaskFocusBefore: average(rated.map((session) => session.task_focus_before as number)),
      avgTaskFocusAfter: average(rated.map((session) => session.task_focus_after as number)),
      avgChange: average(rated.map((session) => (session.task_focus_after as number) - (session.task_focus_before as number))),
      earlierAvgAfter: half > 0 ? average(rated.slice(0, half).map((session) => session.task_focus_after as number)) : null,
      laterAvgAfter: half > 0 ? average(rated.slice(rated.length - half).map((session) => session.task_focus_after as number)) : null,
    },
    byTask: [...tasks.values()]
      .map((group) => {
        const groupRated = group.filter((session) => session.task_focus_before !== null && session.task_focus_after !== null);
        return {
          taskName: group[group.length - 1].task_name,
          sessions: group.length,
          minutes: group.reduce((sum, session) => sum + session.duration_minutes, 0),
          avgBefore: average(group.filter((s) => s.task_focus_before !== null).map((s) => s.task_focus_before as number)),
          avgAfter: average(group.filter((s) => s.task_focus_after !== null).map((s) => s.task_focus_after as number)),
          avgChange: average(groupRated.map((s) => (s.task_focus_after as number) - (s.task_focus_before as number))),
        };
      })
      .sort((a, b) => b.sessions - a.sessions || a.taskName.localeCompare(b.taskName)),
    anchors: ATTENTION_ANCHORS.map((anchor) => {
      const count = mundane.filter((session) => session.anchors_used?.includes(anchor)).length;
      return { anchor, count, shareOfTaskSessions: mundane.length ? Math.round((count / mundane.length) * 100) : 0 };
    })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count),
    meditation: {
      sessions: meditation.length,
      minutes: meditation.reduce((sum, session) => sum + session.duration_minutes, 0),
      avgMinutes: average(meditation.map((session) => session.duration_minutes)),
      avgMoodChange: average(moodChanges),
    },
    byWeekday: WEEKDAYS.map((weekday, index) => ({
      weekday,
      sessions: inRange.filter((session) => {
        const [year, month, day] = session.entry_date.split("-").map(Number);
        return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === index;
      }).length,
    })),
    recentNotes: inRange
      .filter((session) => session.comments && session.comments.trim())
      .slice(-10)
      .reverse()
      .map((session) => ({
        date: session.entry_date,
        type: session.session_type,
        taskName: session.task_name,
        comments: (session.comments as string).trim(),
      })),
  };
}
