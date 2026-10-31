// Decides which reminders the phone should schedule for the next few days. Pure (no React
// Native), so the web project's test runner can test it. Times are the phone's local time.

export type ReminderSettings = {
  reminders_evening_enabled: boolean;
  reminders_evening_time: string;
  reminders_thinking_enabled: boolean;
  reminders_morning_enabled: boolean;
  reminders_morning_time: string;
  reminders_habits_enabled: boolean;
  reminders_quiet_enabled: boolean;
  reminders_quiet_start: string;
  reminders_quiet_end: string;
};

export type PlanRoutine = {
  id: number;
  title: string;
  remind_at: string | null;
  is_active: boolean;
  days_of_week: string[];
  start_date: string;
  end_date: string | null;
};

export type PlanInput = {
  now: Date;
  settings: ReminderSettings;
  // Today's evening close is done (anchor written, or a day note/end-of-day mood saved).
  dayClosed: boolean;
  // Routines whose task for today is already done or skipped.
  doneRoutineIdsToday: number[];
  worry: { active: boolean; start: string; minutes: number; place: string } | null;
  routines: PlanRoutine[];
  // When the latest rough patch was triggered (ISO), even if dismissed; null if none.
  roughPatchAt: string | null;
  days?: number;
};

export type ReminderKind = "evening" | "thinking" | "morning" | "habit";

export type PlannedReminder = {
  id: string;
  kind: ReminderKind;
  channelId: "reminders" | "thinking" | "care";
  title: string;
  body: string;
  url: string;
  at: Date;
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// A rough patch further back than this doesn't get a morning check.
const MORNING_WINDOW_HOURS = 36;

export function parseClock(value: string | null | undefined): { hour: number; minute: number } | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((value ?? "").trim());

  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

function minutesOf(value: string) {
  const clock = parseClock(value);
  return clock ? clock.hour * 60 + clock.minute : null;
}

// Quiet hours can wrap past midnight (23:00-07:00). Equal start and end means none.
export function isQuietTime(at: Date, settings: ReminderSettings) {
  if (!settings.reminders_quiet_enabled) return false;

  const start = minutesOf(settings.reminders_quiet_start);
  const end = minutesOf(settings.reminders_quiet_end);

  if (start === null || end === null || start === end) return false;

  const minute = at.getHours() * 60 + at.getMinutes();

  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function dateKey(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function atTime(day: Date, clock: { hour: number; minute: number }) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock.hour, clock.minute, 0, 0);
}

function routineRunsOn(routine: PlanRoutine, day: Date) {
  const key = dateKey(day);

  return (
    routine.is_active &&
    key >= routine.start_date &&
    (!routine.end_date || key <= routine.end_date) &&
    routine.days_of_week.includes(WEEKDAYS[day.getDay()])
  );
}

export function planReminders(input: PlanInput): PlannedReminder[] {
  const { now, settings } = input;
  const days = input.days ?? 7;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const planned: PlannedReminder[] = [];

  const add = (reminder: PlannedReminder) => {
    if (reminder.at.getTime() > now.getTime() && !isQuietTime(reminder.at, settings)) {
      planned.push(reminder);
    }
  };

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() + offset);
    const key = dateKey(day);
    const isToday = offset === 0;

    const evening = parseClock(settings.reminders_evening_time);
    if (settings.reminders_evening_enabled && evening && !(isToday && input.dayClosed)) {
      add({
        id: `evening:${key}`,
        kind: "evening",
        channelId: "reminders",
        title: "Time to close the day",
        body: "Tick off your habits, drop your anchor, and add a line about today.",
        url: "/",
        at: atTime(day, evening),
      });
    }

    const thinking = input.worry?.active ? parseClock(input.worry.start) : null;
    if (settings.reminders_thinking_enabled && input.worry && thinking) {
      const place = input.worry.place.trim();
      add({
        id: `thinking:${key}`,
        kind: "thinking",
        channelId: "thinking",
        title: "Thinking time",
        body: `${input.worry.minutes} minutes${place ? ` · ${place}` : ""}. Your parked worries are waiting.`,
        url: "/worry",
        at: atTime(day, thinking),
      });
    }

    if (settings.reminders_habits_enabled) {
      for (const routine of input.routines) {
        const clock = parseClock(routine.remind_at);

        if (!clock || !routineRunsOn(routine, day)) continue;
        if (isToday && input.doneRoutineIdsToday.includes(routine.id)) continue;

        const breathing = /breath/i.test(routine.title);
        const attention = /attention/i.test(routine.title);
        add({
          id: `habit:${key}:${routine.id}`,
          kind: "habit",
          channelId: "reminders",
          title: routine.title,
          body: attention
            ? "One everyday task with full attention. Wandering is part of it."
            : breathing
              ? "Two slow minutes. Tap to start."
              : "A gentle reminder for today's habit.",
          url: attention ? "/attention" : breathing ? "/breathe?minutes=2" : "/",
          at: atTime(day, clock),
        });
      }
    }
  }

  // The morning after a rough patch: the first morning time after it, within a day and a half.
  const morning = parseClock(settings.reminders_morning_time);
  const roughAt = input.roughPatchAt ? new Date(input.roughPatchAt) : null;
  if (settings.reminders_morning_enabled && morning && roughAt && Number.isFinite(roughAt.getTime())) {
    let target = atTime(roughAt, morning);
    if (target.getTime() <= roughAt.getTime()) {
      target = atTime(new Date(roughAt.getFullYear(), roughAt.getMonth(), roughAt.getDate() + 1), morning);
    }

    if (target.getTime() - roughAt.getTime() <= MORNING_WINDOW_HOURS * 3_600_000) {
      add({
        id: `morning:${dateKey(target)}`,
        kind: "morning",
        channelId: "care",
        title: "Good morning",
        body: "How are you this morning? Your support plan is here if you need it.",
        url: "/support",
        at: target,
      });
    }
  }

  return planned.sort((a, b) => a.at.getTime() - b.at.getTime());
}
