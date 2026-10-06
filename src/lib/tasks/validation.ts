// Shared, dependency-free validation for task input. Used by Server Actions and the agent API
// so a bad value is rejected with a clear message instead of failing on a DB CHECK constraint.

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "done", "skipped"] as const;

export type ValidTaskPriority = (typeof TASK_PRIORITIES)[number];
export type ValidTaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_NOTE_MAX_LENGTH = 2000;

// True only for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30, 2026-13-01).
export function isValidTaskDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseTaskPriorityValue(value: unknown): ValidTaskPriority | null {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value)
    ? (value as ValidTaskPriority)
    : null;
}

export function parseTaskStatusValue(value: unknown): ValidTaskStatus | null {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value)
    ? (value as ValidTaskStatus)
    : null;
}

export function parseTaskId(value: unknown): number | null {
  const id = typeof value === "string" ? Number(value) : value;

  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
}

export function normalizeTaskTitle(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, TASK_TITLE_MAX_LENGTH) : "";
}

export function normalizeTaskNote(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, TASK_NOTE_MAX_LENGTH) : "";
}

export function normalizeTaskTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      raw
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}
