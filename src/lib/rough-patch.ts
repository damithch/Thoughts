// Deciding when to offer support. Pure and dependency-free so it can be unit-tested.
//
// A "rough patch" is either:
// - a low run: the latest RUN_LENGTH mood entries are all LOW_MOOD or lower, the newest one
//   within the last RUN_WINDOW_HOURS; or
// - a late-night low: the newest entry is LOW_MOOD or lower, written between 22:00 and 04:59
//   (Colombo time), within the last LATE_NIGHT_WINDOW_HOURS.
// Saying "I'm okay for now" hides it until a newer low entry arrives.

export const LOW_MOOD = 2;
export const RUN_LENGTH = 3;
export const RUN_WINDOW_HOURS = 24;
export const LATE_NIGHT_WINDOW_HOURS = 8;

export type MoodEntry = { mood: number; created_at: string | Date };

export type RoughPatchReason = "low_run" | "late_night";

export type RoughPatchStatus = {
  active: boolean;
  reason: RoughPatchReason | null;
  // Whether the triggering entry was written late at night (true for a late-night low, and
  // possibly for a low run too), so the wording can say so.
  lateNight: boolean;
  // How many of the newest entries in a row are low.
  lowStreak: number;
  // The newest low entry; dismissing at or after this time hides the status.
  triggeredAt: string | null;
};

const INACTIVE: RoughPatchStatus = { active: false, reason: null, lateNight: false, lowStreak: 0, triggeredAt: null };

const HOUR_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", hourCycle: "h23" });

export function colomboHour(value: string | Date) {
  return Number(HOUR_FORMAT.format(new Date(value)));
}

export function isLateNight(value: string | Date) {
  const hour = colomboHour(value);
  return hour >= 22 || hour < 5;
}

export function detectRoughPatch(
  entries: MoodEntry[],
  now: Date = new Date(),
  dismissedAt: string | Date | null = null,
): RoughPatchStatus {
  const sorted = entries
    .map((entry) => ({ mood: entry.mood, at: new Date(entry.created_at) }))
    .filter((entry) => Number.isFinite(entry.at.getTime()) && entry.at.getTime() <= now.getTime())
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const latest = sorted[0];

  if (!latest || latest.mood > LOW_MOOD) {
    return INACTIVE;
  }

  const hoursAgo = (now.getTime() - latest.at.getTime()) / 3_600_000;
  let lowStreak = 0;
  while (lowStreak < sorted.length && sorted[lowStreak].mood <= LOW_MOOD) lowStreak += 1;

  const lowRun = lowStreak >= RUN_LENGTH && hoursAgo <= RUN_WINDOW_HOURS;
  const lateNight = isLateNight(latest.at);
  const lateNightLow = lateNight && hoursAgo <= LATE_NIGHT_WINDOW_HOURS;

  if (!lowRun && !lateNightLow) {
    return INACTIVE;
  }

  if (dismissedAt && new Date(dismissedAt).getTime() >= latest.at.getTime()) {
    return INACTIVE;
  }

  return {
    active: true,
    reason: lowRun ? "low_run" : "late_night",
    lateNight,
    lowStreak,
    triggeredAt: latest.at.toISOString(),
  };
}
