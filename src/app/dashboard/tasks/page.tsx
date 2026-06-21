import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createRecurringTaskAction,
  deleteRecurringTaskAction,
  updateRecurringTaskAction,
} from "@/app/actions";
import { Toast } from "@/app/components/toast";
import { getCurrentUser } from "@/lib/auth";
import { getRecurringTasksByUser, type RecurringTask } from "@/lib/db";
import { getCurrentColomboDate } from "@/lib/time";

type TasksPageProps = {
  searchParams?: Promise<{
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

const tasksToastMessages: Record<string, string> = {
  recurring_created: "Recurring task created.",
  recurring_delete_failed: "That task could not be deleted.",
  recurring_deleted: "Recurring task deleted.",
  recurring_invalid: "Add a title, at least one weekday, and a valid date range.",
  recurring_save_failed: "The task could not be saved.",
  recurring_update_failed: "That task could not be updated.",
  recurring_updated: "Recurring task updated.",
};

const weekdayOptions = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

function WeekdayPicker({
  selectedDays,
}: {
  selectedDays: string[];
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {weekdayOptions.map((option) => (
        <label
          key={option.value}
          className="flex items-center justify-center gap-2 rounded-xl border border-emerald-950/10 bg-white/80 px-3 py-2 text-xs font-medium text-emerald-950"
        >
          <input
            type="checkbox"
            name="daysOfWeek"
            value={option.value}
            defaultChecked={selectedDays.includes(option.value)}
            className="h-4 w-4 accent-emerald-900"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function formatSchedule(task: RecurringTask) {
  const labels = weekdayOptions
    .filter((option) => task.days_of_week.includes(option.value))
    .map((option) => option.label);

  const range = task.end_date
    ? `${task.start_date} to ${task.end_date}`
    : `From ${task.start_date}`;

  return `${labels.join(", ")} | ${range}`;
}

function RecurringTaskEditor({ task }: { task: RecurringTask }) {
  return (
    <article className="p-6 hover:bg-emerald-50/30 transition">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-emerald-950">{task.title}</h3>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                task.priority === "high"
                  ? "bg-rose-100 text-rose-900"
                  : task.priority === "medium"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-stone-100 text-stone-700"
              }`}
            >
              {task.priority}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                task.is_active ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-700"
              }`}
            >
              {task.is_active ? "Active" : "Inactive"}
            </span>
          </div>

          <p className="mt-2 text-sm text-stone-600">{formatSchedule(task)}</p>

          {task.note ? (
            <p className="mt-3 text-sm text-emerald-700">{task.note}</p>
          ) : null}

          {task.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {task.tags.map((tag) => (
                <span key={`${task.id}-${tag}`} className="rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-700">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <form action={deleteRecurringTaskAction}>
          <input type="hidden" name="taskId" value={task.id} />
          <button
            type="submit"
            className="rounded-full border border-rose-900/10 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
          >
            Delete
          </button>
        </form>
      </div>

      <details className="mt-5 rounded-2xl border border-emerald-950/10 bg-white/70 p-4">
        <summary className="cursor-pointer text-sm font-medium text-emerald-950">
          Edit recurrence
        </summary>

        <form action={updateRecurringTaskAction} className="mt-5 grid gap-4">
          <input type="hidden" name="taskId" value={task.id} />

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="font-medium text-emerald-900">Task Title</span>
            <input
              name="title"
              type="text"
              required
              defaultValue={task.title}
              className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-stone-700">
              <span className="font-medium text-emerald-900">Priority</span>
              <select
                name="priority"
                defaultValue={task.priority}
                className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-stone-700">
              <span className="font-medium text-emerald-900">Tags</span>
              <input
                name="tags"
                type="text"
                defaultValue={task.tags.join(", ")}
                className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="font-medium text-emerald-900">Weekdays</span>
            <WeekdayPicker selectedDays={task.days_of_week} />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-stone-700">
              <span className="font-medium text-emerald-900">Start date</span>
              <input
                name="startDate"
                type="date"
                required
                defaultValue={task.start_date}
                className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </label>

            <label className="grid gap-2 text-sm text-stone-700">
              <span className="font-medium text-emerald-900">End date</span>
              <input
                name="endDate"
                type="date"
                defaultValue={task.end_date ?? ""}
                className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="font-medium text-emerald-900">Note</span>
            <textarea
              name="note"
              rows={3}
              defaultValue={task.note}
              className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-emerald-950/10 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={task.is_active}
              className="h-4 w-4 accent-emerald-900"
            />
            <span>Generate this task automatically on matching dates</span>
          </label>

          <button
            type="submit"
            className="w-full rounded-full bg-emerald-950 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-900"
          >
            Save changes
          </button>
        </form>
      </details>
    </article>
  );
}

export default async function TasksPage(props: TasksPageProps) {
  const params = await props.searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const recurringTasks = await getRecurringTasksByUser(currentUser.id);
  const toastMessage = params?.toast ? tasksToastMessages[params.toast] : undefined;
  const today = getCurrentColomboDate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-stone-50 p-6">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}

      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-emerald-950">Task Management</h1>
            <p className="mt-2 text-emerald-700">
              Create recurring templates, choose which weekdays they run, and let matching dates
              generate the real daily tasks automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/today"
              className="rounded-full border border-emerald-950/10 bg-white px-4 py-3 text-sm text-emerald-950 transition hover:bg-emerald-50"
            >
              Today View
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-emerald-950/10 bg-white px-4 py-3 text-sm text-emerald-950 transition hover:bg-emerald-50"
            >
              Journal Dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="sticky top-6 rounded-2xl border border-emerald-950/10 bg-white/80 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-emerald-950">Create Recurring Task</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                This creates a rule. Matching dates will generate separate daily task instances
                whose completion status shows up in each day&apos;s report.
              </p>

              <form action={createRecurringTaskAction} className="mt-6 grid gap-4">
                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="font-medium text-emerald-900">Task Title</span>
                  <input
                    name="title"
                    type="text"
                    placeholder="Morning exercise"
                    required
                    className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>

                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="font-medium text-emerald-900">Priority</span>
                  <select
                    name="priority"
                    defaultValue="medium"
                    className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="font-medium text-emerald-900">Weekdays</span>
                  <WeekdayPicker selectedDays={["mon", "tue", "wed", "thu", "fri"]} />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm text-stone-700">
                    <span className="font-medium text-emerald-900">Start date</span>
                    <input
                      name="startDate"
                      type="date"
                      required
                      defaultValue={today}
                      className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-stone-700">
                    <span className="font-medium text-emerald-900">End date</span>
                    <input
                      name="endDate"
                      type="date"
                      className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </label>
                </div>

                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="font-medium text-emerald-900">Tags</span>
                  <input
                    name="tags"
                    type="text"
                    placeholder="health, routine"
                    className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>

                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="font-medium text-emerald-900">Note</span>
                  <textarea
                    name="note"
                    rows={3}
                    placeholder="Optional instructions or context."
                    className="w-full rounded-xl border border-emerald-900/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>

                <button
                  type="submit"
                  className="w-full rounded-full bg-emerald-950 py-3 font-medium text-emerald-50 transition hover:bg-emerald-900"
                >
                  Add Recurring Task
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-white/78 shadow-sm">
              <div className="border-b border-emerald-950/10 p-6">
                <h2 className="text-xl font-semibold text-emerald-950">
                  Your Recurring Tasks ({recurringTasks.length})
                </h2>
              </div>

              {recurringTasks.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  <p>No recurring tasks yet. Create one to get started.</p>
                </div>
              ) : (
                <div className="divide-y divide-emerald-950/10">
                  {recurringTasks.map((task) => (
                    <RecurringTaskEditor key={task.id} task={task} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
