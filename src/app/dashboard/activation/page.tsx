import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentColomboDate } from "@/lib/time";
import { ActivationWorksheetClient } from "@/app/dashboard/activation/worksheet-client";

export const dynamic = "force-dynamic";

const ratingScale = [
  { value: 0, label: "Absolutely None" },
  { value: 1, label: "Minimal" },
  { value: 2, label: "Slight" },
  { value: 3, label: "Mild" },
  { value: 4, label: "Moderate" },
  { value: 5, label: "Much" },
  { value: 6, label: "Higher" },
  { value: 7, label: "Very High" },
  { value: 8, label: "Extreme" },
] as const;

export default async function ActivationPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
        <header className="rounded-[2rem] border border-emerald-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-800/70 sm:text-sm sm:tracking-[0.28em]">
                Behavioural Activation
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl md:text-6xl">
                Worksheet
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-700">
                Track activities alongside before-and-after ratings for depression,
                pleasure, and achievement, then save the sheet directly to your journal.
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
                href="/dashboard/today"
                className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                Today View
              </Link>
              <Link
                href="/dashboard/tasks"
                className="rounded-full border border-blue-950/10 px-4 py-3 text-center text-blue-950 transition-colors hover:bg-blue-50"
              >
                Task Management
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

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Default date
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {getCurrentColomboDate()}
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              New rows start on today&apos;s Colombo date unless you change them.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Workflow
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              Before / After
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              Save an activity with the three before ratings, then return later to complete the after section.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Scale
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              0-8
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              Use the same rating scale across depression, pleasure, and achievement.
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-emerald-950/10 bg-white/74 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="mx-auto max-w-5xl">
            <header className="text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                Guided worksheet
              </p>
              <h2 className="mt-3 font-[family:var(--font-display)] text-[2.3rem] font-semibold uppercase leading-none tracking-[0.04em] text-stone-900 sm:text-[3.2rem] md:text-[4rem]">
                Behavioural Activation Worksheet
              </h2>
              <p className="mt-3 font-[family:var(--font-display)] text-[2rem] font-semibold uppercase leading-none tracking-[0.18em] text-emerald-950 sm:text-[2.7rem] md:text-[3.4rem]">
                Fun &amp; Achievement
              </p>
            </header>

            <div className="mt-10">
              <div className="space-y-6 text-[1.02rem] leading-[1.75] text-stone-700 sm:text-[1.12rem]">
                <p>
                  One simple way of combating depression is to prescribe some fun for
                  yourself. By engaging in some simple, pleasant activities, you can
                  actually improve your mood and your energy level. Try it and see!
                </p>
                <p>
                  You may also want to engage in some simple tasks or responsibilities
                  that you have neglected for some time. Often, accomplishing tasks can
                  improve your motivation and give you a sense of achievement. Start
                  with tasks that are simple and achievable. BUT remember that it is
                  important to BALANCE both responsibilities and pleasurable
                  activities. Try not to go overboard on one and leave out the other.
                </p>
                <p>
                  Use the following rating scale to rate your depression, pleasant
                  feelings, and sense of achievement BEFORE and AFTER the activity.
                </p>
              </div>
            </div>

            <section className="mt-10 rounded-[1.75rem] border border-emerald-950/10 bg-[linear-gradient(180deg,rgba(243,250,243,0.95)_0%,rgba(232,245,233,0.82)_100%)] px-4 py-4 shadow-[0_16px_36px_rgba(48,84,53,0.08)] sm:px-5 sm:py-5">
              <div className="overflow-x-auto">
                <div className="grid min-w-[760px] grid-cols-9 gap-3 text-center">
                  {ratingScale.map((item) => (
                    <div key={item.value} className="flex flex-col items-center gap-1">
                      <span className="text-[1.45rem] text-emerald-950 sm:text-[1.7rem]">{item.value}</span>
                      <span className="max-w-[6rem] text-sm leading-5 text-stone-700 sm:text-base">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <ActivationWorksheetClient defaultDate={getCurrentColomboDate()} />

            <footer className="mt-10 text-center">
              <p className="font-[family:var(--font-display)] text-[2rem] font-semibold text-stone-900 sm:text-[2.5rem]">
                What did you notice about yourself?
              </p>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
