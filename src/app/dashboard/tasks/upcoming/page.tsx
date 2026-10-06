import Link from "next/link";
import { redirect } from "next/navigation";

import { Toast } from "@/app/components/toast";
import { OverdueBanner } from "@/app/dashboard/tasks/_components/overdue-banner";
import { TaskInlineAdd } from "@/app/dashboard/tasks/_components/task-inline-add";
import { TaskList } from "@/app/dashboard/tasks/_components/task-list";
import { getCurrentUser } from "@/lib/auth";
import {
  getOverdueOpenTasks,
  getRecurringSkipsByUserMonth,
  getRecurringTasksByUser,
  getTasksByUserDateRange,
} from "@/lib/db";
import { isRoutineScheduledOn } from "@/lib/tasks/recurrence";
import { formatColomboDateLabel, getCurrentColomboDate, shiftColomboDate } from "@/lib/time";

const UPCOMING_DAYS = 14;

const upcomingToastMessages: Record<string, string> = {
  overdue_moved: "Overdue tasks were moved to today.",
  overdue_empty: "There were no overdue tasks to move.",
  overdue_failed: "The overdue tasks could not be moved.",
};

type UpcomingPageProps = {
  searchParams?: Promise<{ toast?: string; type?: "success" | "error" | "info" }>;
};

export default async function UpcomingPage({ searchParams }: UpcomingPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const toastMessage = params?.toast ? upcomingToastMessages[params.toast] : undefined;
  const today = getCurrentColomboDate();
  const days = Array.from({ length: UPCOMING_DAYS }, (_, index) => shiftColomboDate(today, index));
  const lastDay = days[days.length - 1];
  const months = Array.from(new Set(days.map((day) => day.slice(0, 7))));

  const [tasks, routines, overdueTasks, ...skipsByMonth] = await Promise.all([
    getTasksByUserDateRange(currentUser.id, today, lastDay),
    getRecurringTasksByUser(currentUser.id),
    getOverdueOpenTasks(currentUser.id, today),
    ...months.map((month) => getRecurringSkipsByUserMonth(currentUser.id, month)),
  ]);

  const skipped = new Set(skipsByMonth.flat().map((skip) => `${skip.recurring_task_id}:${skip.skip_date}`));
  const activeRoutines = routines.filter((routine) => routine.is_active);

  return (
    <div className="grid gap-5">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}

      <OverdueBanner tasks={overdueTasks} targetDate={today} targetLabel="today" view="upcoming" />

      <ol className="grid gap-4">
        {days.map((day, index) => {
          const dayTasks = tasks.filter((task) => task.scheduled_date === day);
          const createdRoutineIds = new Set(dayTasks.map((task) => task.recurring_task_id));
          // Future routines aren't created yet; preview them so the day's load is visible.
          const pendingRoutines = activeRoutines.filter(
            (routine) =>
              isRoutineScheduledOn(routine, day) &&
              !createdRoutineIds.has(routine.id) &&
              !skipped.has(`${routine.id}:${day}`),
          );
          const relative = index === 0 ? "Today" : index === 1 ? "Tomorrow" : null;
          const openCount = dayTasks.filter((task) => task.status === "todo" || task.status === "in_progress").length;

          return (
            <li
              key={day}
              className="rounded-[1.5rem] border border-emerald-950/10 bg-white/75 p-4 shadow-sm backdrop-blur sm:p-5"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg text-stone-900">
                  {relative ? <span className="font-semibold">{relative} · </span> : null}
                  {formatColomboDateLabel(day)}
                </h2>
                <div className="flex items-center gap-3 text-xs text-stone-600">
                  <span>{openCount} open</span>
                  <Link
                    href={`/dashboard/tasks?date=${day}`}
                    className="rounded-full border border-emerald-950/10 px-3 py-1 text-emerald-950 transition hover:bg-white"
                  >
                    Open day →
                  </Link>
                </div>
              </div>

              {dayTasks.length > 0 ? <TaskList tasks={dayTasks} /> : null}

              {pendingRoutines.length > 0 ? (
                <p className="mt-2 text-xs text-stone-600">
                  <span className="font-semibold text-emerald-900">Routines:</span>{" "}
                  {pendingRoutines.map((routine) => routine.title).join(" · ")}
                  <span className="text-stone-500"> (added on the day)</span>
                </p>
              ) : null}

              {dayTasks.length === 0 && pendingRoutines.length === 0 ? (
                <p className="text-sm text-stone-500">Nothing planned.</p>
              ) : null}

              <div className="mt-2">
                <TaskInlineAdd date={day} collapsible />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
