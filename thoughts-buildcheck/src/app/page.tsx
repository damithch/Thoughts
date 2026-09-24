import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const currentUser = await getCurrentUser();
  const largeButtonClassName =
    "inline-flex min-h-14 w-full items-center justify-center rounded-full border border-white/70 bg-white/88 px-6 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-emerald-950 shadow-[0_18px_34px_rgba(255,255,255,0.38)] transition-all hover:-translate-y-0.5 hover:bg-white sm:w-auto sm:px-7";

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center sm:min-h-[calc(100vh-5rem)]">
        <section className="relative overflow-hidden rounded-[2rem] border border-emerald-950/10 bg-white/65 p-6 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-8 md:p-14">
          <div className="absolute -right-16 top-0 h-36 w-36 rounded-full bg-emerald-200/60 blur-3xl sm:-right-12 sm:top-10 sm:h-48 sm:w-48" />
          <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full bg-lime-100/80 blur-3xl sm:left-10 sm:h-36 sm:w-36" />

          <div className="relative grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-end md:gap-10">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-emerald-800/70 sm:text-sm sm:tracking-[0.30em]">
                Personal journal
              </p>
              <h1 className="mt-4 max-w-3xl font-[family:var(--font-display)] text-4xl leading-none sm:mt-6 sm:text-5xl md:text-8xl">
                A quieter place for your ideas.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-700 sm:text-base sm:leading-8 md:text-lg">
                Thoughts is a journal web app where users can register, log in,
                and manage their own thought cards from a private dashboard.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
                <Link
                  href={currentUser ? "/dashboard" : "/login"}
                  className={largeButtonClassName}
                >
                  {currentUser ? "Open Dashboard" : "Login"}
                </Link>
                {!currentUser ? (
                  <Link
                    href="/register"
                    className={largeButtonClassName}
                  >
                    Create Account
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-emerald-950/10 bg-emerald-950 p-6 text-emerald-50 shadow-[0_20px_50px_rgba(25,55,30,0.22)] sm:rounded-[2rem] sm:p-8">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/70">
                What it does
              </p>
              <p className="mt-4 font-[family:var(--font-display)] text-3xl leading-none sm:text-4xl">
                Capture.
                <br />
                Reflect.
                <br />
                Understand.
              </p>
              <p className="mt-5 text-sm leading-6 text-emerald-100/80 sm:leading-7">
                Thoughts helps you turn scattered ideas into a personal record
                you can return to, organize by day, and review later through
                structured reports.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
