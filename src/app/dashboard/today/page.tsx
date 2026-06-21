import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createDailyCheckInAction,
  createTaskAction,
  logoutAction,
  rolloverTasksAction,
  saveDayRecordAction,
  updateTaskStatusAction,
} from "@/app/actions";
import { Toast } from "@/app/components/toast";
import { getCurrentUser } from "@/lib/auth";
import {
  generateDailyTasksFromRecurring,
  getDailyCheckInsByUserAndDate,
  getDayRecordByUserAndDate,
  getOpenTaskCountBeforeDate,
  getTasksByUserAndDate,
  TaskItem,
} from "@/lib/db";
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
  rollover_done: "Open tasks were moved to tomorrow.",
  rollover_empty: "There were no unfinished tasks to move.",
  rollover_failed: "Those tasks could not be moved.",
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

function TaskStatusForm({
  date,
  nextStatus,
  taskId,
  label,
  className,
}: {
  date: string;
  nextStatus: TaskItem["status"];
  taskId: number;
  label: string;
  className: string;
}) {
  return (
    <form action={updateTaskStatusAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value={nextStatus} />
      <input type="hidden" name="date" value={date} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
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

function TaskCard({ task, date }: { task: TaskItem; date: string }) {
  const statusMeta = getStatusMeta(task.status);

  return (
    <article
      className={`rounded-[1.5rem] border p-4 shadow-[0_18px_40px_rgba(48,84,53,0.08)] ${statusMeta.cardClassName}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
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
          <div className="flex flex-wrap gap-2">
            {task.tags.map((tag) => (
              <span
                key={`${task.id}-${tag}`}
                className="rounded-full border border-emerald-950/10 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-emerald-950"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {task.note ? (
          <p className="text-sm leading-7 text-stone-700">{task.note}</p>
        ) : null}

        <div className="text-xs uppercase tracking-[0.16em] text-stone-400">
          Created {toColomboDateTime(task.created_at)}
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
          {task.status === "todo" ? (
            <>
              <TaskStatusForm
                date={date}
                nextStatus="in_progress"
                taskId={task.id}
                label="Start"
                className="rounded-full bg-emerald-950 px-4 py-2 text-xs uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800"
              />
              <TaskStatusForm
                date={date}
                nextStatus="done"
                taskId={task.id}
                label="Finish"
                className="rounded-full border border-emerald-950/10 bg-white/80 px-4 py-2 text-xs uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
              />
              <TaskStatusForm
                date={date}
                nextStatus="skipped"
                taskId={task.id}
                label="Skip"
                className="rounded-full border border-stone-900/10 bg-stone-100 px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-700 transition hover:bg-stone-200"
              />
            </>
          ) : null}

          {task.status === "in_progress" ? (
            <>
              <TaskStatusForm
                date={date}
                nextStatus="done"
                taskId={task.id}
                label="Mark done"
                className="rounded-full bg-emerald-950 px-4 py-2 text-xs uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800"
              />
              <TaskStatusForm
                date={date}
                nextStatus="todo"
                taskId={task.id}
                label="Move back"
                className="rounded-full border border-emerald-950/10 bg-white/80 px-4 py-2 text-xs uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
              />
              <TaskStatusForm
                date={date}
                nextStatus="skipped"
                taskId={task.id}
                label="Skip"
                className="rounded-full border border-stone-900/10 bg-stone-100 px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-700 transition hover:bg-stone-200"
              />
            </>
          ) : null}

          {(task.status === "done" || task.status === "skipped") ? (
            <TaskStatusForm
              date={date}
              nextStatus="todo"
              taskId={task.id}
              label="Reopen"
              className="rounded-full border border-emerald-950/10 bg-white/80 px-4 py-2 text-xs uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
            />
          ) : null}
        </div>
      </div>
    </article>
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

export default async function TodayPage({ searchParams }: TodayPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const requestedDate = params?.date ?? getCurrentColomboDate();
  const activeDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : getCurrentColomboDate();
  const previousDate = shiftColomboDate(activeDate, -1);
  const nextDate = shiftColomboDate(activeDate, 1);
  const toastMessage = params?.toast ? todayToastMessages[params.toast] : undefined;

  try {
    await generateDailyTasksFromRecurring(currentUser.id, activeDate);
  } catch (error) {
    console.error("Failed to auto-generate recurring tasks for the viewed date.", error);
  }

  const [tasks, dayRecord, overdueCount, checkIns] = await Promise.all([
    getTasksByUserAndDate(currentUser.id, activeDate),
    getDayRecordByUserAndDate(currentUser.id, activeDate),
    getOpenTaskCountBeforeDate(currentUser.id, activeDate),
    getDailyCheckInsByUserAndDate(currentUser.id, activeDate),
  ]);

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
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
        <header className="rounded-[2rem] border border-emerald-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-800/70 sm:text-sm sm:tracking-[0.28em]">
                Today
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl md:text-6xl">
                {formatColomboDateLabel(activeDate)}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-700">
                Use this view to run the day: set an intention, keep only a few active priorities,
                and close the loop with a short note before tomorrow.
              </p>
            </div>

            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
              <Link
                href="/dashboard"
                className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                Journal Dashboard
              </Link>
              <Link
                href="/dashboard/tasks"
                className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                Task Management
              </Link>
              <Link
                href="/dashboard/completion"
                className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                Completion Stats
              </Link>
              <Link
                href="/"
                className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                Public Home
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-full bg-emerald-950 px-4 py-3 text-emerald-50 transition-colors hover:bg-emerald-800"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </header>

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
              Older unfinished tasks still open.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                  Daily focus
                </p>
                <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                  Top priorities for this date
                </h2>
              </div>
              <div className="flex gap-3 text-xs uppercase tracking-[0.16em]">
                <Link
                  href={`/dashboard/today?date=${previousDate}`}
                  className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-emerald-950 transition hover:bg-white"
                >
                  Previous day
                </Link>
                <Link
                  href={`/dashboard/today?date=${nextDate}`}
                  className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-emerald-950 transition hover:bg-white"
                >
                  Next day
                </Link>
              </div>
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
          <form
            action={createTaskAction}
            className="rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8"
          >
            <input type="hidden" name="date" value={activeDate} />
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Quick add
            </p>
            <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
              Add a task for this day
            </h2>

            <div className="mt-6 grid gap-5">
              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                  Task
                </span>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="Finish API outline"
                  className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                />
              </label>

              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                  Priority
                </span>
                <select
                  name="priority"
                  defaultValue="medium"
                  className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                  Tags
                </span>
                <input
                  type="text"
                  name="tags"
                  placeholder="work, admin, health"
                  className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                />
              </label>

              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                  Note
                </span>
                <textarea
                  name="note"
                  rows={4}
                  placeholder="Optional context, blocker, or success condition."
                  className="resize-none rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                />
              </label>

              <button
                type="submit"
                className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800"
              >
                Add task
              </button>
            </div>
          </form>

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
              </div>
            </div>

            <div className="mt-6 rounded-[1.6rem] border border-emerald-950/10 bg-[linear-gradient(180deg,rgba(243,250,243,0.95)_0%,rgba(232,245,233,0.82)_100%)] p-4 sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                    Export snapshot
                  </p>
                  <p className="mt-2 text-sm leading-7 text-stone-700">
                    Recurring tasks are generated automatically for this date. Download the final
                    task list, progress totals, day note, and thought summary in one payload.
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

        <section className="grid gap-6 xl:grid-cols-3">
          <div id="now" className="grid gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-stone-500">Now</p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                In progress ({inProgressTasks.length})
              </h2>
            </div>
            {inProgressTasks.length === 0 ? (
              <EmptyTaskState
                title="Nothing active."
                description="Start one task when you want the day to narrow down."
              />
            ) : (
              inProgressTasks.map((task) => <TaskCard key={task.id} task={task} date={activeDate} />)
            )}
          </div>

          <div id="later" className="grid gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-stone-500">Later</p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                To do ({todoTasks.length})
              </h2>
            </div>
            {todoTasks.length === 0 ? (
              <EmptyTaskState
                title="Nothing queued."
                description="Add another task only if it truly belongs on this date."
              />
            ) : (
              todoTasks.map((task) => <TaskCard key={task.id} task={task} date={activeDate} />)
            )}
          </div>

          <div id="closed" className="grid gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-stone-500">Closed loop</p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                Done and skipped ({doneTasks.length + skippedTasks.length})
              </h2>
            </div>
            {[...doneTasks, ...skippedTasks].length === 0 ? (
              <EmptyTaskState
                title="Nothing finished yet."
                description="Completed and skipped tasks will collect here so the day stays readable."
              />
            ) : (
              [...doneTasks, ...skippedTasks].map((task) => (
                <TaskCard key={task.id} task={task} date={activeDate} />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
