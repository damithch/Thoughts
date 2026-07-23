import { redirect } from "next/navigation";

import { Toast } from "@/app/components/toast";
import { getCurrentUser } from "@/lib/auth";
import {
  getRecurringTasksByUser,
  getTasksByUserMonth,
  type RecurringTask,
  type TaskItem,
  type TaskStatus,
} from "@/lib/db";
import {
  getCurrentColomboDate,
  getCurrentColomboMonth,
} from "@/lib/time";

type CompletionPageProps = {
  searchParams?: Promise<{
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

type MatrixRow = {
  id: string;
  title: string;
  source: "recurring" | "task";
  priority: TaskItem["priority"];
  tags: string[];
  note: string;
  cells: Record<string, TaskStatus | null>;
  closedCount: number;
  totalCount: number;
  currentStreak: number;
  bestStreak: number;
};

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function getMonthDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return Array.from({ length: lastDay }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");

    return `${month}-${day}`;
  });
}

function getWeekdayCode(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return WEEKDAY_ORDER[weekday];
}

function isRecurringScheduled(task: RecurringTask, date: string) {
  if (date < task.start_date) {
    return false;
  }

  if (task.end_date && date > task.end_date) {
    return false;
  }

  return task.days_of_week.includes(getWeekdayCode(date));
}

function isClosed(status: TaskStatus | null) {
  return status === "done" || status === "skipped";
}

function getStreakMetrics(cells: Record<string, TaskStatus | null>, days: string[]) {
  let current = 0;
  let best = 0;
  let running = 0;

  for (const day of days) {
    const status = cells[day];

    if (isClosed(status)) {
      running += 1;
      best = Math.max(best, running);
    } else if (status !== null) {
      running = 0;
    }
  }

  for (let index = days.length - 1; index >= 0; index -= 1) {
    const status = cells[days[index]];

    if (isClosed(status)) {
      current += 1;
      continue;
    }

    if (status !== null) {
      break;
    }
  }

  return {
    current,
    best,
  };
}

function getStatusClasses(status: TaskStatus | null) {
  if (status === "done") {
    return "border-emerald-300 bg-emerald-400 text-white";
  }

  if (status === "skipped") {
    return "border-stone-300 bg-stone-300 text-stone-700";
  }

  if (status === "in_progress") {
    return "border-amber-300 bg-amber-300 text-amber-950";
  }

  if (status === "todo") {
    return "border-slate-300 bg-white text-transparent";
  }

  return "border-transparent bg-transparent text-transparent";
}

function getStatusMark(status: TaskStatus | null) {
  if (status === "done") {
    return "✓";
  }

  if (status === "skipped") {
    return "–";
  }

  if (status === "in_progress") {
    return "•";
  }

  return "•";
}

function getPriorityBadge(priority: TaskItem["priority"]) {
  if (priority === "high") {
    return "bg-rose-100 text-rose-900";
  }

  if (priority === "medium") {
    return "bg-amber-100 text-amber-900";
  }

  return "bg-stone-100 text-stone-700";
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-stone-900/8 bg-white/80 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-stone-950">
        {value}
      </p>
      <p className="mt-1 text-sm text-stone-600">{sublabel}</p>
    </div>
  );
}

function buildMatrixRows(
  recurringTasks: RecurringTask[],
  monthTasks: TaskItem[],
  monthDays: string[],
  today: string,
) {
  const rows = new Map<string, MatrixRow>();

  for (const recurringTask of recurringTasks) {
    const intersectsMonth = monthDays.some((day) => isRecurringScheduled(recurringTask, day));

    if (!intersectsMonth) {
      continue;
    }

    const cells = Object.fromEntries(monthDays.map((day) => [day, null])) as Record<
      string,
      TaskStatus | null
    >;

    rows.set(`recurring-${recurringTask.id}`, {
      id: `recurring-${recurringTask.id}`,
      title: recurringTask.title,
      source: "recurring",
      priority: recurringTask.priority,
      tags: recurringTask.tags,
      note: recurringTask.note,
      cells,
      closedCount: 0,
      totalCount: 0,
      currentStreak: 0,
      bestStreak: 0,
    });
  }

  for (const task of monthTasks) {
    const key =
      task.recurring_task_id !== null ? `recurring-${task.recurring_task_id}` : `task-${task.title}`;

    if (!rows.has(key)) {
      const cells = Object.fromEntries(monthDays.map((day) => [day, null])) as Record<
        string,
        TaskStatus | null
      >;

      rows.set(key, {
        id: key,
        title: task.title,
        source: task.recurring_task_id !== null ? "recurring" : "task",
        priority: task.priority,
        tags: task.tags,
        note: task.note,
        cells,
        closedCount: 0,
        totalCount: 0,
        currentStreak: 0,
        bestStreak: 0,
      });
    }

    const row = rows.get(key);

    if (!row) {
      continue;
    }

    row.cells[task.scheduled_date] = task.status;
    row.priority = task.priority;

    if (row.tags.length === 0 && task.tags.length > 0) {
      row.tags = task.tags;
    }

    if (!row.note && task.note) {
      row.note = task.note;
    }
  }

  const output = Array.from(rows.values())
    .map((row) => {
      for (const day of monthDays) {
        const status = row.cells[day];

        if (status !== null) {
          row.totalCount += 1;
          if (isClosed(status)) {
            row.closedCount += 1;
          }
          continue;
        }

        if (row.source === "recurring") {
          const recurringTask = recurringTasks.find((task) => `recurring-${task.id}` === row.id);

          if (recurringTask && day <= today && isRecurringScheduled(recurringTask, day)) {
            row.cells[day] = "todo";
            row.totalCount += 1;
          }
        }
      }

      const streaks = getStreakMetrics(row.cells, monthDays.filter((day) => day <= today));
      row.currentStreak = streaks.current;
      row.bestStreak = streaks.best;

      return row;
    })
    .filter((row) => row.totalCount > 0)
    .sort((left, right) => {
      const sourceOrder = { recurring: 0, task: 1 };
      const priorityOrder = { high: 0, medium: 1, low: 2 };

      return (
        sourceOrder[left.source] - sourceOrder[right.source] ||
        priorityOrder[left.priority] - priorityOrder[right.priority] ||
        left.title.localeCompare(right.title)
      );
    });

  return output;
}

export default async function TaskCompletionPage(props: CompletionPageProps) {
  const params = await props.searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const currentDate = getCurrentColomboDate();
  const currentMonth = getCurrentColomboMonth();
  const monthDays = getMonthDays(currentMonth);
  const [recurringTasks, monthTasks] = await Promise.all([
    getRecurringTasksByUser(currentUser.id),
    getTasksByUserMonth(currentUser.id, currentMonth),
  ]);

  const matrixRows = buildMatrixRows(recurringTasks, monthTasks, monthDays, currentDate);
  const activeDays = monthDays.filter((day) => day <= currentDate);
  const monthDayStats = activeDays.map((day) => {
    const statuses = matrixRows
      .map((row) => row.cells[day])
      .filter((status): status is TaskStatus => status !== null);

    return {
      date: day,
      total_tasks: statuses.length,
      completed_tasks: statuses.filter((status) => isClosed(status)).length,
    };
  });
  const totalTasks = monthDayStats.reduce((sum, day) => sum + day.total_tasks, 0);
  const closedTasks = monthDayStats.reduce((sum, day) => sum + day.completed_tasks, 0);
  const overallRate = totalTasks === 0 ? 0 : Math.round((closedTasks / totalTasks) * 100);
  const todayStats = monthDayStats.find((day) => day.date === currentDate) ?? null;
  const bestRowStreak = matrixRows.length > 0 ? Math.max(...matrixRows.map((row) => row.bestStreak)) : 0;
  const perfectDays = monthDayStats.filter(
    (day) => day.total_tasks > 0 && day.completed_tasks === day.total_tasks,
  ).length;
  const currentMonthLabel = new Date(`${currentMonth}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="min-h-screen bg-[#f7f4ee] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      {params?.toast ? <Toast message="View task completion" tone={params?.type} /> : null}

      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="font-[family:var(--font-display)] text-4xl leading-none text-stone-950">
            Task consistency
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
            Same scan pattern as a Notion-style tracker: tasks on the left, days across the top,
            and one cell per day showing whether the task was done, skipped, in progress, or still open.
          </p>
        </div>

        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-medium text-stone-950">My tasks</h2>
            <p className="mt-1 text-sm text-stone-500">
              {currentMonthLabel} · {monthDays.length}-day tracker
            </p>
          </div>
          <span className="mt-1 text-sm text-stone-500">
            Day <span className="font-medium text-stone-700">{currentDate.slice(-2)}</span> /{" "}
            {monthDays.length}
          </span>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            label="Overall"
            value={`${overallRate}%`}
            sublabel="completion"
          />
          <StatCard
            label="Today"
            value={
              todayStats ? `${todayStats.completed_tasks}/${todayStats.total_tasks}` : "0/0"
            }
            sublabel="tasks closed"
          />
          <StatCard
            label="Best Streak"
            value={`${bestRowStreak}`}
            sublabel="days in a row"
          />
          <StatCard
            label="Perfect Days"
            value={`${perfectDays}`}
            sublabel="all scheduled tasks closed"
          />
        </div>

        <div className="overflow-x-auto rounded-[1.5rem] border border-stone-900/10 bg-white/80 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
          <table className="w-full border-collapse" style={{ minWidth: `${340 + monthDays.length * 34}px` }}>
            <thead>
              <tr className="border-b border-stone-200">
                <th className="sticky left-0 z-10 w-72 border-r border-stone-200 bg-white/95 px-4 py-3 text-left text-xs font-medium text-stone-500 backdrop-blur">
                  Task
                </th>

                {monthDays.map((day) => {
                  const dayNumber = Number(day.slice(-2));
                  const isToday = day === currentDate;
                  const isFuture = day > currentDate;

                  return (
                    <th
                      key={day}
                      className={`min-w-[34px] border-r border-stone-100 py-2.5 text-center text-[11px] font-medium ${
                        isToday
                          ? "bg-emerald-100 text-emerald-800"
                          : isFuture
                            ? "text-stone-300"
                            : "text-stone-500"
                      }`}
                    >
                      {dayNumber}
                      {isToday ? (
                        <span className="mt-0.5 block text-[8px] font-normal leading-none text-emerald-700">
                          today
                        </span>
                      ) : null}
                    </th>
                  );
                })}

                <th className="w-28 border-l border-stone-200 px-3 py-3 text-left text-xs font-medium text-stone-500">
                  Progress
                </th>
              </tr>
            </thead>

            <tbody>
              {matrixRows.map((row) => {
                const progress = row.totalCount === 0 ? 0 : Math.round((row.closedCount / row.totalCount) * 100);

                return (
                  <tr
                    key={row.id}
                    className="border-b border-stone-100 transition-colors hover:bg-stone-50/70"
                  >
                    <td className="sticky left-0 z-10 border-r border-stone-200 bg-white/95 px-4 py-3 align-top backdrop-blur">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium leading-tight text-stone-900">
                              {row.title}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getPriorityBadge(row.priority)}`}
                            >
                              {row.priority}
                            </span>
                            {row.currentStreak >= 2 ? (
                              <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">
                                {row.currentStreak}d
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-1 text-[10px] text-stone-500">
                            best: {row.bestStreak} days
                            {row.source === "recurring" ? " · recurring" : " · one-off"}
                          </div>

                          {row.tags.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {row.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={`${row.id}-${tag}`}
                                  className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    {monthDays.map((day) => {
                      const status = row.cells[day];
                      const isToday = day === currentDate;
                      const isFuture = day > currentDate;
                      const classes = getStatusClasses(status);

                      return (
                        <td
                          key={`${row.id}-${day}`}
                          className={`border-r border-stone-100 p-1 text-center ${
                            isToday ? "bg-emerald-50/70" : ""
                          } ${isFuture ? "opacity-30" : ""}`}
                        >
                          <span
                            className={`mx-auto flex h-4 w-4 items-center justify-center rounded-[4px] border text-[10px] font-bold transition-all ${classes}`}
                            title={`${row.title} · ${day} · ${status ?? "not scheduled"}`}
                          >
                            {status !== null ? getStatusMark(status) : "•"}
                          </span>
                        </td>
                      );
                    })}

                    <td className="border-l border-stone-200 px-3 py-3">
                      <p className="text-[12px] font-medium text-stone-700">{progress}%</p>
                      <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-stone-400">
                        {row.closedCount}/{row.totalCount}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-stone-500">
          <span className="rounded-full border border-stone-200 bg-white/80 px-3 py-1.5">
            Done = green
          </span>
          <span className="rounded-full border border-stone-200 bg-white/80 px-3 py-1.5">
            Skipped = gray
          </span>
          <span className="rounded-full border border-stone-200 bg-white/80 px-3 py-1.5">
            In progress = amber
          </span>
          <span className="rounded-full border border-stone-200 bg-white/80 px-3 py-1.5">
            To do = empty box
          </span>
          <span className="rounded-full border border-stone-200 bg-white/80 px-3 py-1.5">
            Future days are faded
          </span>
        </div>
      </div>
    </div>
  );
}
