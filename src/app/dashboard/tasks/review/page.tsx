import { redirect } from "next/navigation";

import { ensureTodaysRoutines } from "@/app/dashboard/tasks/_lib/ensure-todays-routines";
import { OverdueBanner } from "@/app/dashboard/tasks/_components/overdue-banner";
import { TaskList } from "@/app/dashboard/tasks/_components/task-list";
import { getCurrentUser } from "@/lib/auth";
import {
  getOverdueOpenTasks,
  getRecurringSkipsByUserRange,
  getRecurringTasksByUser,
  getSlippingOpenTasks,
  getTaskCompletionStats,
  getTasksByUserDateRange,
} from "@/lib/db";
import { computeDayStreak, routineAdherence } from "@/lib/tasks/stats";
import { getCurrentColomboDate, shiftColomboDate } from "@/lib/time";

const REVIEW_DAYS = 7;

function shortDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[1.25rem] border border-emerald-950/10 bg-white/80 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-emerald-800/80">{label}</p>
      <p className="mt-2 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">{value}</p>
      <p className="mt-2 text-xs text-stone-600">{hint}</p>
    </div>
  );
}

// Weekly review: what got done, what keeps slipping, and how routines are holding up.
export default async function ReviewPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const today = getCurrentColomboDate();
  const days = Array.from({ length: REVIEW_DAYS }, (_, index) => shiftColomboDate(today, index - (REVIEW_DAYS - 1)));
  const firstDay = days[0];

  await ensureTodaysRoutines(currentUser.id, today);

  const [tasks, routines, skips, slipping, overdue, history] = await Promise.all([
    getTasksByUserDateRange(currentUser.id, firstDay, today),
    getRecurringTasksByUser(currentUser.id),
    getRecurringSkipsByUserRange(currentUser.id, firstDay, today),
    getSlippingOpenTasks(currentUser.id, 2),
    getOverdueOpenTasks(currentUser.id, today),
    getTaskCompletionStats(currentUser.id, 120),
  ]);

  const counted = tasks.filter((task) => task.status !== "skipped");
  const doneCount = counted.filter((task) => task.status === "done").length;
  const skippedCount = tasks.length - counted.length;
  const streak = computeDayStreak(
    history.map((day) => ({ date: day.date, total: day.total_tasks, done: day.completed_tasks })),
    today,
  );
  const skipped = new Set(skips.map((skip) => `${skip.recurring_task_id}:${skip.skip_date}`));
  const adherence = routineAdherence(routines, tasks, skipped, days, today);
  const perDay = days.map((day) => {
    const dayTasks = counted.filter((task) => task.scheduled_date === day);
    return { day, total: dayTasks.length, done: dayTasks.filter((task) => task.status === "done").length };
  });

  return (
    <div className="grid gap-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Done this week"
          value={`${doneCount}/${counted.length}`}
          hint={`Last ${REVIEW_DAYS} days, skipped tasks excluded.`}
        />
        <StatTile label="Skipped" value={String(skippedCount)} hint="Deliberately set aside." />
        <StatTile
          label="Day streak"
          value={String(streak.current)}
          hint={`Days with every task done in a row (best ${streak.best}). Empty days don't break it.`}
        />
        <StatTile label="Overdue" value={String(overdue.length)} hint="One-off tasks open from earlier days." />
      </section>

      <section
        aria-label="Daily completion"
        className="rounded-[1.5rem] border border-emerald-950/10 bg-white/75 p-4 shadow-sm sm:p-5"
      >
        <h2 className="text-lg text-stone-900">This week</h2>
        <ol className="mt-3 grid grid-cols-7 gap-2">
          {perDay.map(({ day, total, done }) => {
            const rate = total === 0 ? 0 : done / total;
            return (
              <li key={day} className="grid gap-1 text-center text-xs text-stone-600">
                <div
                  className="relative mx-auto h-20 w-full max-w-10 overflow-hidden rounded-lg bg-stone-200/70"
                  role="img"
                  aria-label={`${shortDay(day)}: ${done} of ${total} done`}
                >
                  <div className="absolute inset-x-0 bottom-0 bg-emerald-700" style={{ height: `${rate * 100}%` }} />
                </div>
                <span className={day === today ? "font-semibold text-stone-900" : ""}>{shortDay(day)}</span>
                <span>{total === 0 ? "–" : `${done}/${total}`}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-[1.5rem] border border-emerald-950/10 bg-white/75 p-4 shadow-sm sm:p-5">
        <h2 className="text-lg text-stone-900">Keeps slipping</h2>
        <p className="mt-1 text-sm text-stone-600">
          Open tasks pushed to a later day two or more times. Do them, schedule them properly, send them
          to the Inbox, or let them go.
        </p>
        <div className="mt-3">
          <TaskList tasks={slipping} showDate emptyText="Nothing keeps slipping. 🎉" />
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-emerald-950/10 bg-white/75 p-4 shadow-sm sm:p-5">
        <h2 className="text-lg text-stone-900">Routines this week</h2>
        {adherence.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">No routines were due this week.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {adherence.map((row) => (
              <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <div>
                  <p className="text-stone-900">{row.title}</p>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full bg-emerald-700" style={{ width: `${(row.done / row.scheduled) * 100}%` }} />
                  </div>
                </div>
                <span className="text-stone-700">
                  {row.done}/{row.scheduled}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-stone-500">
          A routine day counts as missed if its task was left open or never added. Today only counts once it&apos;s done.
        </p>
      </section>

      <OverdueBanner tasks={overdue} targetDate={today} targetLabel="today" />
    </div>
  );
}
