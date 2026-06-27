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
    <main className="min-h-screen bg-[#ead8c0] px-4 py-6 text-stone-950 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-stone-900/10 bg-white/45 p-5 shadow-[0_22px_50px_rgba(36,27,20,0.08)] backdrop-blur sm:rounded-[2.5rem] sm:p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-600">
                Behavioural Activation
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl">
                Worksheet Preview
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-700">
                Static worksheet layout, matched to the reference image first.
              </p>
            </div>

            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
              <Link
                href="/dashboard"
                className="rounded-full border border-stone-900/10 px-4 py-3 text-center text-stone-900 transition-colors hover:bg-white/70"
              >
                Journal Dashboard
              </Link>
              <Link
                href="/dashboard/today"
                className="rounded-full border border-stone-900/10 px-4 py-3 text-center text-stone-900 transition-colors hover:bg-white/70"
              >
                Today View
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-full bg-stone-900 px-4 py-3 text-stone-50 transition-colors hover:bg-stone-700"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </header>

        <section className="border border-stone-400 bg-[#f9f7f1] px-4 py-8 shadow-[0_18px_40px_rgba(36,27,20,0.06)] sm:px-8 sm:py-10 md:px-14">
          <div className="mx-auto max-w-5xl">
            <header className="text-center">
              <h2 className="font-[family:var(--font-display)] text-[2.3rem] font-semibold uppercase leading-none tracking-[0.04em] text-black sm:text-[3.2rem] md:text-[4rem]">
                Behavioural Activation Worksheet
              </h2>
              <p className="mt-3 font-[family:var(--font-display)] text-[2rem] font-semibold uppercase leading-none tracking-[0.18em] text-black sm:text-[2.7rem] md:text-[3.4rem]">
                Fun &amp; Achievement
              </p>
            </header>

            <div className="mt-10">
              <div className="space-y-6 text-[1.05rem] leading-[1.6] text-black sm:text-[1.28rem] sm:leading-[1.6]">
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

            <section className="mt-10 border border-stone-400 bg-white px-4 py-3 sm:px-5 sm:py-4">
              <div className="overflow-x-auto">
                <div className="grid min-w-[760px] grid-cols-9 gap-3 text-center">
                  {ratingScale.map((item) => (
                    <div key={item.value} className="flex flex-col items-center gap-1">
                      <span className="text-[1.45rem] text-black sm:text-[1.7rem]">{item.value}</span>
                      <span className="max-w-[6rem] text-sm leading-5 text-black sm:text-base">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <ActivationWorksheetClient defaultDate={getCurrentColomboDate()} />

            <footer className="mt-10 text-center">
              <p className="font-[family:var(--font-display)] text-[2rem] font-semibold text-black sm:text-[2.5rem]">
                What did you notice about yourself?
              </p>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
