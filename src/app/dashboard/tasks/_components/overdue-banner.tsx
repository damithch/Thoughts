import { rollForwardOverdueAction } from "@/app/actions";
import { TaskList } from "@/app/dashboard/tasks/_components/task-list";
import type { TaskItem } from "@/lib/db";

// Lists one-off tasks left open on earlier days, with a one-click move onto `targetDate`.
export function OverdueBanner({
  tasks,
  targetDate,
  targetLabel,
  view = "today",
}: {
  tasks: TaskItem[];
  targetDate: string;
  targetLabel: string;
  // Which view to come back to after moving them.
  view?: "today" | "upcoming";
}) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-amber-900/15 bg-amber-50/90 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-amber-950">
          <span className="font-semibold">{tasks.length} overdue</span> task{tasks.length === 1 ? "" : "s"} from
          earlier days {tasks.length === 1 ? "is" : "are"} still open.
        </p>
        <form action={rollForwardOverdueAction}>
          <input type="hidden" name="date" value={targetDate} />
          <input type="hidden" name="view" value={view} />
          <button
            type="submit"
            className="rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-50 transition hover:bg-amber-800"
          >
            Move all to {targetLabel}
          </button>
        </form>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-amber-900">Review them one by one</summary>
        <div className="mt-3">
          <TaskList tasks={tasks} showDate />
        </div>
      </details>
    </section>
  );
}
