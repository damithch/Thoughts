// Pure task statistics, shared by the completion page and the weekly review.
import { isRoutineScheduledOn, type RoutineSchedule } from "./recurrence.ts";

export type DayTotals = {
  date: string;
  // Tasks that count (skipped ones excluded).
  total: number;
  done: number;
};

// A "kept" day has tasks and all of them done. Days without tasks are neutral (they neither
// extend nor break a streak), and an unfinished today doesn't break the streak yet.
export function computeDayStreak(days: DayTotals[], today: string) {
  const sorted = [...days].filter((day) => day.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const isKept = (day: DayTotals) => day.total > 0 && day.done >= day.total;

  let best = 0;
  let running = 0;
  for (const day of sorted) {
    if (day.total === 0) continue;
    if (isKept(day)) {
      running += 1;
      best = Math.max(best, running);
    } else if (day.date !== today) {
      running = 0;
    }
  }

  let current = 0;
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const day = sorted[index];
    if (day.total === 0) continue;
    if (isKept(day)) {
      current += 1;
    } else if (day.date !== today) {
      break;
    }
  }

  return { current, best };
}

export type RoutineForStats = RoutineSchedule & { id: number; title: string; is_active: boolean };
export type TaskForStats = { recurring_task_id: number | null; scheduled_date: string | null; status: string };

// For each active routine: how many of its scheduled days in `days` were done. A routine day
// counts as missed when its task is still open or was never created, except today (still in
// progress). Skipped tasks and deliberately removed occurrences don't count either way.
export function routineAdherence(
  routines: RoutineForStats[],
  tasks: TaskForStats[],
  skippedOccurrences: Set<string>,
  days: string[],
  today: string,
) {
  return routines
    .filter((routine) => routine.is_active)
    .map((routine) => {
      let done = 0;
      let scheduled = 0;

      for (const day of days) {
        if (day > today || !isRoutineScheduledOn(routine, day) || skippedOccurrences.has(`${routine.id}:${day}`)) {
          continue;
        }

        const instance = tasks.find((task) => task.recurring_task_id === routine.id && task.scheduled_date === day);

        if (instance?.status === "done") {
          done += 1;
          scheduled += 1;
        } else if (instance?.status === "skipped" || day === today) {
          continue;
        } else {
          scheduled += 1;
        }
      }

      return { id: routine.id, title: routine.title, done, scheduled };
    })
    .filter((row) => row.scheduled > 0);
}
