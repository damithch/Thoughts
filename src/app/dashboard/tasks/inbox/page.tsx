import { redirect } from "next/navigation";

import { TaskInlineAdd } from "@/app/dashboard/tasks/_components/task-inline-add";
import { TaskList } from "@/app/dashboard/tasks/_components/task-list";
import { getCurrentUser } from "@/lib/auth";
import { getInboxTasksByUser } from "@/lib/db";

// Tasks without a date. Give one a date with its date picker to schedule it.
export default async function InboxPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const tasks = await getInboxTasksByUser(currentUser.id);

  return (
    <section className="grid gap-4 rounded-[1.5rem] border border-emerald-950/10 bg-white/75 p-4 shadow-sm backdrop-blur sm:p-6">
      <div>
        <h2 className="font-[family:var(--font-display)] text-3xl leading-none text-stone-900">Inbox</h2>
        <p className="mt-2 text-sm text-stone-600">
          Capture tasks that don&apos;t have a day yet. Pick a date on any task to schedule it.
        </p>
      </div>
      <TaskInlineAdd date={null} label="Add to Inbox" />
      <TaskList tasks={tasks} showDate emptyText="Inbox is empty." />
    </section>
  );
}
