// Pure helpers for deciding which routines fall on a date. Shared by the completion tracker and
// the Upcoming view (which previews routines before they're created).

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type RoutineSchedule = {
  is_active?: boolean;
  days_of_week: string[];
  start_date: string;
  end_date: string | null;
};

export function getWeekdayCode(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return WEEKDAY_ORDER[weekday];
}

// Whether the routine's schedule covers the date (ignores is_active; callers decide that).
export function isRoutineScheduledOn(routine: RoutineSchedule, date: string) {
  if (date < routine.start_date) {
    return false;
  }

  if (routine.end_date && date > routine.end_date) {
    return false;
  }

  return routine.days_of_week.includes(getWeekdayCode(date));
}
