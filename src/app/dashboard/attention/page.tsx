import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions";
import { AttentionClient } from "@/app/dashboard/attention/attention-client";
import { ATTENTION_COPY } from "@/lib/attention/copy";
import { getCurrentUser } from "@/lib/auth";
import {
  getAttentionReminder,
  getAttentionSessions,
  getAttentionStats,
  getAttentionTaskIdeas,
  getUserSettings,
} from "@/lib/db";
import { getCurrentColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AttentionPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const today = getCurrentColomboDate();
  const [sessions, week, month, ideas, settings, reminder] = await Promise.all([
    getAttentionSessions(currentUser.id, { limit: 200 }),
    getAttentionStats(currentUser.id, today, 7),
    getAttentionStats(currentUser.id, today, 30),
    getAttentionTaskIdeas(currentUser.id),
    getUserSettings(currentUser.id),
    getAttentionReminder(currentUser.id),
  ]);

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 sm:gap-8">
        <header className="rounded-[2rem] border border-emerald-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-800/70 sm:text-sm sm:tracking-[0.28em]">
                What? Me Worry!?! · Module 4
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl md:text-6xl">
                {ATTENTION_COPY.title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-700">{ATTENTION_COPY.principle}</p>
            </div>

            <nav className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
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
                Tasks
              </Link>
              <Link
                href="/dashboard/worry-postponement"
                className="rounded-full border border-teal-950/10 px-4 py-3 text-center text-teal-950 transition-colors hover:bg-teal-50"
              >
                Worry Postponement
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-full bg-emerald-950 px-4 py-3 text-emerald-50 transition-colors hover:bg-emerald-800"
                >
                  Logout
                </button>
              </form>
            </nav>
          </div>
        </header>

        <AttentionClient
          today={today}
          sessions={JSON.parse(JSON.stringify(sessions))}
          week={week}
          month={month}
          ideas={ideas}
          steps={{
            observe: settings.attention_observe_seconds,
            belly: settings.attention_belly_seconds,
            body: settings.attention_body_seconds,
          }}
          reminderTime={reminder?.time ?? null}
          morningTime={settings.reminders_morning_time}
        />
      </div>
    </main>
  );
}
