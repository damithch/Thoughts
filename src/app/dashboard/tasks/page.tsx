import Link from "next/link";
import { redirect } from "next/navigation";

import {
  applyRecurringTasksAction,
  createDailyCheckInAction,
  rolloverTasksAction,
  saveDayRecordAction,
} from "@/app/actions";
import { Toast } from "@/app/components/toast";
import { OverdueBanner } from "@/app/dashboard/tasks/_components/overdue-banner";
import { TaskList } from "@/app/dashboard/tasks/_components/task-list";
import { TaskQuickAddForm } from "@/app/dashboard/tasks/_components/task-quick-add-form";
import { getCurrentUser } from "@/lib/auth";
import {
  generateDailyTasksFromRecurring,
  getDailyCheckInsByUserAndDate,
  getDayRecordByUserAndDate,
  getOverdueOpenTasks,
  getTasksByUserAndDate,
  TaskItem,
} from "@/lib/db";
import { isValidTaskDate } from "@/lib/tasks/validation";
import {
  formatColomboDateLabel,
  getCurrentColomboDate,
  shiftColomboDate,
  toColomboDateTime,
} from "@/lib/time";

export const dynamic = "force-dynamic";

type TodayPageProps = {
  searchParams?: Promise<{
    date?: string;
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

const todayToastMessages: Record<string, string> = {
  checkin_invalid: "Choose a mood, energy level, and focus before saving the check-in.",
  checkin_save_failed: "That check-in could not be saved.",
  checkin_saved: "Check-in saved.",
  day_invalid: "Choose a valid date and mood before saving the day note.",
  day_save_failed: "The day note could not be saved.",
  day_saved: "Day note saved.",
  rollover_done: "Unfinished one-off tasks were moved to tomorrow.",
  rollover_empty: "There were no unfinished one-off tasks to move.",
  rollover_failed: "Those tasks could not be moved.",
  overdue_moved: "Overdue tasks were moved to this day.",
  overdue_empty: "There were no overdue tasks to move.",
  overdue_failed: "The overdue tasks could not be moved.",
  recurring_applied: "Routines added to this day.",
  apply_empty: "All routines for this day are already here (or were removed on purpose).",
  apply_failed: "Routines could not be added.",
  task_created: "Task added for the day.",
  task_invalid: "Add a task title, priority, and date before saving.",
  task_save_failed: "That task could not be created.",
  task_update_failed: "That task could not be updated.",
  task_updated: "Task status updated.",
};

function getPriorityClassName(priority: TaskItem["priority"]) {
  if (priority === "high") {
    return "bg-rose-100 text-rose-900 border-rose-900/10";
  }

  if (priority === "medium") {
    return "bg-amber-100 text-amber-900 border-amber-900/10";
  }

  return "bg-stone-100 text-stone-700 border-stone-900/10";
}

function getStatusMeta(status: TaskItem["status"]) {
  if (status === "in_progress") {
    return {
      label: "In progress",
      cardClassName: "border-amber-900/10 bg-amber-50/85",
    };
  }

  if (status === "done") {
    return {
      label: "Done",
      cardClassName: "border-emerald-900/10 bg-emerald-50/90",
    };
  }

  if (status === "skipped") {
    return {
      label: "Skipped",
      cardClassName: "border-stone-900/10 bg-stone-100/90",
    };
  }

  return {
    label: "To do",
    cardClassName: "border-stone-900/10 bg-white/80",
  };
}

function PriorityPreviewCard({ task }: { task: TaskItem }) {
  const statusMeta = getStatusMeta(task.status);

  return (
    <div className="rounded-[1.5rem] border border-emerald-950/10 bg-white/78 p-4 shadow-[0_14px_32px_rgba(48,84,53,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
            {statusMeta.label}
          </p>
          <h3 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900">
            {task.title}
          </h3>
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${getPriorityClassName(task.priority)}`}
        >
          {task.priority}
        </span>
      </div>

      {task.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={`${task.id}-${tag}`}
              className="rounded-full border border-emerald-950/10 bg-emerald-50/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-emerald-950"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {task.note ? (
        <p className="mt-4 text-sm leading-7 text-stone-700">{task.note}</p>
      ) : null}
    </div>
  );
}

function EmptyTaskState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-stone-900/12 bg-white/55 p-6 text-sm leading-7 text-stone-600">
      <p className="font-[family:var(--font-display)] text-2xl leading-none text-stone-900">
        {title}
      </p>
      <p className="mt-3">{description}</p>
    </div>
  );
}

function TaskSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="grid gap-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">{eyebrow}</p>
        <h2 className="mt-1 font-[family:var(--font-display)] text-3xl leading-none text-stone-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default async function TasksTodayPage({ searchParams }: TodayPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const requestedDate = params?.date ?? getCurrentColomboDate();
  const activeDate = isValidTaskDate(requestedDate) ? requestedDate : getCurrentColomboDate();
  const previousDate = shiftColomboDate(activeDate, -1);
  const nextDate = shiftColomboDate(activeDate, 1);
  const toastMessage = params?.toast ? todayToastMessages[params.toast] : undefined;

  const today = getCurrentColomboDate();
  const isToday = activeDate === today;

  // Routines are created automatically only for today (idempotent, and deleted occurrences stay
  // deleted). Other days get them through the explicit "Add routines" button, so browsing the
  // calendar never fills days with tasks.
  if (isToday) {
    try {
      await generateDailyTasksFromRecurring(currentUser.id, today);
    } catch (error) {
      console.error("Failed to generate today's routine tasks.", error);
    }
  }

  const [tasks, dayRecord, overdueTasks, checkIns] = await Promise.all([
    getTasksByUserAndDate(currentUser.id, activeDate),
    getDayRecordByUserAndDate(currentUser.id, activeDate),
    getOverdueOpenTasks(currentUser.id, activeDate),
    getDailyCheckInsByUserAndDate(currentUser.id, activeDate),
  ]);

  const overdueCount = overdueTasks.length;
  const todoTasks = tasks.filter((task) => task.status === "todo");
  const inProgressTasks = tasks.filter((task) => task.status === "in_progress");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const skippedTasks = tasks.filter((task) => task.status === "skipped");
  const completedCount = doneTasks.length;
  const totalCount = tasks.length;
  const topPriorities = tasks
    .filter((task) => task.status === "todo" || task.status === "in_progress")
    .sort((left, right) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };

      return priorityOrder[left.priority] - priorityOrder[right.priority];
    })
    .slice(0, 3);

  return (
    <>
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}
      <div className="flex w-full flex-col gap-6 sm:gap-8">
        <header className="rounded-[2rem] border border-emerald-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-800/70 sm:text-sm sm:tracking-[0.28em]">
                {isToday ? "Today" : activeDate < today ? "Past day" : "Upcoming day"}
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl md:text-6xl">
                {formatColomboDateLabel(activeDate)}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-700">
                Use this view to run the day: set an intention, keep only a few active priorities,
                and close the loop with a short note before tomorrow.
              </p>
            </div>

          </div>
        </header>

        <OverdueBanner
          tasks={overdueTasks}
          targetDate={activeDate}
          targetLabel={isToday ? "today" : "this day"}
        />

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Progress
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {completedCount}/{totalCount}
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              Tasks finished today.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Day close mood
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {dayRecord?.end_of_day_mood ?? "-"}
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              End-of-day rating saved for this date.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              In motion
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {inProgressTasks.length}
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              Tasks currently in progress.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Carry-over
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {overdueCount}
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              Older one-off tasks still open.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                  Daily focus
                </p>
                <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                  Top priorities for this date
                </h2>
              </div>
              <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em]">
                <Link
                  href={`/dashboard/tasks?date=${previousDate}`}
                  className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-emerald-950 transition hover:bg-white"
                >
                  Previous day
                </Link>
                <Link
                  href={`/dashboard/tasks?date=${nextDate}`}
                  className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-emerald-950 transition hover:bg-white"
                >
                  Next day
                </Link>
              </div>
              <form action="/dashboard/tasks" method="get" className="flex items-center gap-2 text-xs">
                <label htmlFor="jump-to-date" className="uppercase tracking-[0.16em] text-emerald-800/70">
                  Go to
                </label>
                <input
                  id="jump-to-date"
                  type="date"
                  name="date"
                  required
                  defaultValue={activeDate}
                  className="rounded-full border border-emerald-950/10 bg-white/80 px-3 py-2 text-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
                />
                <button
                  type="submit"
                  className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
                >
                  Go
                </button>
              </form>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-stone-500">
              <span className="rounded-full border border-emerald-950/10 bg-white/65 px-3 py-2">
                {topPriorities.length} active priorities
              </span>
              <span className="rounded-full border border-emerald-950/10 bg-white/65 px-3 py-2">
                {doneTasks.length} tasks closed
              </span>
              <span className="rounded-full border border-emerald-950/10 bg-white/65 px-3 py-2">
                {overdueCount} older carry-over
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {topPriorities.length === 0 ? (
                <div className="md:col-span-3">
                  <EmptyTaskState
                    title="No active priorities."
                    description="Add a task below or reopen one from the completed list when this day still needs shape."
                  />
                </div>
              ) : (
                topPriorities.map((task) => <PriorityPreviewCard key={task.id} task={task} />)
              )}
            </div>
          </div>

          <form
            action={saveDayRecordAction}
            className="rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8"
          >
            <input type="hidden" name="date" value={activeDate} />
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Daily note
            </p>
            <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
              Open and close the day
            </h2>

            <div className="mt-6 grid gap-5">
              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                  Intention
                </span>
                <textarea
                  name="intention"
                  rows={3}
                  defaultValue={dayRecord?.intention ?? ""}
                  placeholder="What needs to matter most today?"
                  className="resize-none rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                />
              </label>

              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                  Day note
                </span>
                <textarea
                  name="note"
                  rows={6}
                  defaultValue={dayRecord?.note ?? ""}
                  placeholder="What worked, what got blocked, and what should move tomorrow?"
                  className="resize-y rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                />
              </label>

              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                  End-of-day mood
                </span>
                <select
                  name="endOfDayMood"
                  defaultValue={dayRecord?.end_of_day_mood ? String(dayRecord.end_of_day_mood) : ""}
                  className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                >
                  <option value="">Leave unset</option>
                  {Array.from({ length: 10 }, (_, index) => {
                    const level = index + 1;

                    return (
                      <option key={level} value={level}>
                        {level} / 10
                      </option>
                    );
                  })}
                </select>
              </label>

              <button
                type="submit"
                className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800"
              >
                Save day note
              </button>

              <div className="rounded-[1.5rem] border border-emerald-950/10 bg-white/65 p-4 text-sm leading-7 text-stone-700">
                Save the intention and closing note here so the export for this date includes both
                the day plan and the reflection state.
              </div>
            </div>
          </form>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <form
            action={createDailyCheckInAction}
            className="rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8"
          >
            <input type="hidden" name="date" value={activeDate} />
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Quick check-in
            </p>
            <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
              Capture the mood as the day moves
            </h2>
            <p className="mt-4 text-sm leading-7 text-stone-700">
              Save a timestamped snapshot now so the end-of-day export can show how your mood,
              energy, and focus changed over time.
            </p>

            <div className="mt-6 grid gap-5">
              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                  Mood
                </span>
                <select
                  name="mood"
                  defaultValue=""
                  required
                  className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                >
                  <option value="" disabled>
                    Select a mood from 1 to 10
                  </option>
                  {Array.from({ length: 10 }, (_, index) => {
                    const level = index + 1;

                    return (
                      <option key={level} value={level}>
                        {level} / 10
                      </option>
                    );
                  })}
                </select>
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                    Energy
                  </span>
                  <select
                    name="energy"
                    defaultValue=""
                    required
                    className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                  >
                    <option value="" disabled>
                      Select energy
                    </option>
                    <option value="low">Low</option>
                    <option value="steady">Steady</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                    Focus
                  </span>
                  <select
                    name="focus"
                    defaultValue=""
                    required
                    className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                  >
                    <option value="" disabled>
                      Select focus
                    </option>
                    <option value="scattered">Scattered</option>
                    <option value="okay">Okay</option>
                    <option value="locked_in">Locked in</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                  Short note
                </span>
                <textarea
                  name="note"
                  rows={3}
                  placeholder="Optional reason for the shift: meetings drained me, calm after finishing the brief, and so on."
                  className="resize-none rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                />
              </label>

              <button
                type="submit"
                className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800"
              >
                Save check-in
              </button>
            </div>
          </form>

          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Mood timeline
            </p>
            <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
              Check-ins for this date
            </h2>

            <div className="mt-6 grid gap-4">
              {checkIns.length === 0 ? (
                <EmptyTaskState
                  title="No check-ins yet."
                  description="Save a quick snapshot during the day and it will appear here with its time stamp for the daily export."
                />
              ) : (
                checkIns.map((checkIn) => (
                  <article
                    key={checkIn.id}
                    className="rounded-[1.5rem] border border-emerald-950/10 bg-white/82 p-4 shadow-[0_14px_30px_rgba(48,84,53,0.06)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                          {toColomboDateTime(checkIn.created_at)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em]">
                          <span className="rounded-full border border-emerald-950/10 bg-emerald-50 px-3 py-1 text-emerald-900">
                            Mood {checkIn.mood}/10
                          </span>
                          <span className="rounded-full border border-stone-900/10 bg-stone-50 px-3 py-1 text-stone-700">
                            Energy {checkIn.energy}
                          </span>
                          <span className="rounded-full border border-stone-900/10 bg-stone-50 px-3 py-1 text-stone-700">
                            Focus {checkIn.focus.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                    </div>
                    {checkIn.note ? (
                      <p className="mt-4 text-sm leading-7 text-stone-700">{checkIn.note}</p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <TaskQuickAddForm defaultDate={activeDate} today={getCurrentColomboDate()} />

          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                  Day controls
                </p>
                <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                  Keep the day moving
                </h2>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <form action={rolloverTasksAction} className="flex-1">
                  <input type="hidden" name="date" value={activeDate} />
                  <button
                    type="submit"
                    className="w-full rounded-full border border-emerald-950/10 bg-white/75 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
                  >
                    Move unfinished to tomorrow
                  </button>
                </form>
                {isToday ? null : (
                  <form action={applyRecurringTasksAction} className="flex-1">
                    <input type="hidden" name="date" value={activeDate} />
                    <button
                      type="submit"
                      className="w-full rounded-full border border-emerald-950/10 bg-white/75 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
                    >
                      Add routines to this day
                    </button>
                  </form>
                )}
              </div>
              <p className="text-xs leading-6 text-stone-600">
                Routines are added to today automatically. Unfinished routines stay on their own
                day instead of being carried forward, because they come back anyway.
              </p>
            </div>

            <div className="mt-6 rounded-[1.6rem] border border-emerald-950/10 bg-[linear-gradient(180deg,rgba(243,250,243,0.95)_0%,rgba(232,245,233,0.82)_100%)] p-4 sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                    Export snapshot
                  </p>
                  <p className="mt-2 text-sm leading-7 text-stone-700">
                    Download the final task list, progress totals, day note, and thought summary
                    in one payload.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <a
                    href={`/api/reports/daily?date=${activeDate}&format=json`}
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-emerald-200 bg-white px-5 py-3 text-center text-sm uppercase tracking-[0.16em] text-emerald-900 transition hover:-translate-y-0.5 hover:bg-emerald-50"
                  >
                    Export JSON
                  </a>
                  <a
                    href={`/api/reports/daily?date=${activeDate}&format=csv`}
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-stone-200 bg-stone-50 px-5 py-3 text-center text-sm uppercase tracking-[0.16em] text-stone-700 transition hover:-translate-y-0.5 hover:bg-white"
                  >
                    Export CSV
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-emerald-950/10 bg-white/88 p-4 shadow-[0_12px_26px_rgba(48,84,53,0.06)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-800/70">
                  To do
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                    {todoTasks.length}
                  </p>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">
                    queued
                  </span>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/85 p-4 shadow-[0_12px_26px_rgba(48,84,53,0.06)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-800/70">
                  Done
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="font-[family:var(--font-display)] text-4xl leading-none text-emerald-950">
                    {doneTasks.length}
                  </p>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-emerald-700">
                    closed
                  </span>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-stone-900/10 bg-stone-100/80 p-4 shadow-[0_12px_26px_rgba(48,84,53,0.05)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                  Skipped
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="font-[family:var(--font-display)] text-4xl leading-none text-stone-800">
                    {skippedTasks.length}
                  </p>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                    paused
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
          <TaskSection id="now" eyebrow="Now" title={`In progress (${inProgressTasks.length})`}>
            <TaskList tasks={inProgressTasks} emptyText="Nothing active. Start one task when you want the day to narrow down." />
          </TaskSection>
          <TaskSection id="later" eyebrow="Later" title={`To do (${todoTasks.length})`}>
            <TaskList tasks={todoTasks} emptyText="Nothing queued for this day." />
          </TaskSection>
          <TaskSection
            id="closed"
            eyebrow="Closed loop"
            title={`Done and skipped (${doneTasks.length + skippedTasks.length})`}
          >
            <TaskList
              tasks={[...doneTasks, ...skippedTasks]}
              emptyText="Completed and skipped tasks will collect here."
            />
          </TaskSection>
        </section>
      </div>
    </>
  );
}
