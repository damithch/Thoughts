import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions";
import { TaskCommandBar } from "@/app/dashboard/tasks/_components/task-command-bar";
import { TasksTabs } from "@/app/dashboard/tasks/_components/tasks-tabs";
import { getCurrentUser } from "@/lib/auth";
import { ensureTodaysRoutines } from "@/app/dashboard/tasks/_lib/ensure-todays-routines";
import { getInboxOpenTaskCount } from "@/lib/db";
import { getCurrentColomboDate } from "@/lib/time";

// One Tasks area: Today, Upcoming, Inbox and Routines share this header, the tabs and the
// agent command bar.
export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const today = getCurrentColomboDate();

  // Today's routines are created on the first visit of the day, whichever tab is opened.
  // Idempotent, and occurrences the user deleted stay deleted.
  await ensureTodaysRoutines(currentUser.id, today);

  const inboxCount = await getInboxOpenTaskCount(currentUser.id);

  return (
    <main className="min-h-screen thought-network-bg px-4 py-6 text-stone-900 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl">Tasks</h1>
          <nav aria-label="Other sections" className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/dashboard"
              className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-emerald-950 transition hover:bg-white"
            >
              Journal
            </Link>
            <Link
              href="/dashboard/completion"
              className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-emerald-950 transition hover:bg-white"
            >
              Completion stats
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-full bg-emerald-950 px-4 py-2 text-emerald-50 transition hover:bg-emerald-800"
              >
                Logout
              </button>
            </form>
          </nav>
        </header>

        <TasksTabs inboxCount={inboxCount} />

        <Suspense fallback={null}>
          <TaskCommandBar today={today} />
        </Suspense>

        {children}
      </div>
    </main>
  );
}
