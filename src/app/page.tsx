import Link from "next/link";

import { logoutAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const currentUser = await getCurrentUser();

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-between gap-8">
        <header className="flex flex-col gap-4 rounded-full border border-emerald-950/10 bg-white/70 px-4 py-3 shadow-[0_18px_40px_rgba(48,84,53,0.08)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <p className="font-[family:var(--font-display)] text-3xl leading-none">
            Thoughts
          </p>
          <nav aria-label="Primary" className="flex flex-wrap gap-2 text-sm">
            {currentUser ? (
              <>
                <Link
                  href="/dashboard"
                  className="rounded-full bg-emerald-950 px-4 py-2 font-medium text-white shadow-[0_10px_24px_rgba(6,78,59,0.22)] transition-colors hover:bg-emerald-800"
                >
                  Dashboard
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="rounded-full border border-emerald-950/15 bg-white/92 px-4 py-2 font-medium text-emerald-950 shadow-[0_8px_18px_rgba(255,255,255,0.4)] transition-colors hover:bg-white"
                  >
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-full border border-emerald-950/15 bg-white/92 px-4 py-2 font-medium text-emerald-950 shadow-[0_8px_18px_rgba(255,255,255,0.4)] transition-colors hover:bg-white"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded-full bg-emerald-950 px-4 py-2 font-medium text-white shadow-[0_10px_24px_rgba(6,78,59,0.22)] transition-colors hover:bg-emerald-800"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </header>

        <section className="relative overflow-hidden rounded-[2.5rem] border border-emerald-950/10 bg-white/65 p-8 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur md:p-14">
          <div className="absolute -right-12 top-10 h-48 w-48 rounded-full bg-emerald-200/60 blur-3xl" />
          <div className="absolute bottom-0 left-10 h-36 w-36 rounded-full bg-lime-100/80 blur-3xl" />

          <div className="relative grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-end">
            <div>
              <p className="text-sm uppercase tracking-[0.30em] text-emerald-800/70">
                Personal journal
              </p>
              <h1 className="mt-6 max-w-3xl font-[family:var(--font-display)] text-6xl leading-none md:text-8xl">
                A quieter place for your ideas.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-stone-700 md:text-lg">
                Thoughts is a journal web app where users can register, log in,
                and manage their own thought cards from a private dashboard.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={currentUser ? "/dashboard" : "/login"}
                  className="inline-flex rounded-full bg-emerald-950 px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-white shadow-[0_14px_28px_rgba(6,78,59,0.22)] transition hover:bg-emerald-800"
                >
                  {currentUser ? "Open Dashboard" : "Login"}
                </Link>
                {!currentUser ? (
                  <Link
                    href="/register"
                    className="inline-flex rounded-full border border-emerald-950/15 bg-white/95 px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-emerald-950 shadow-[0_10px_24px_rgba(255,255,255,0.4)] transition hover:bg-white"
                  >
                    Create Account
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="rounded-[2rem] border border-emerald-950/10 bg-emerald-950 p-8 text-emerald-50 shadow-[0_20px_50px_rgba(25,55,30,0.22)]">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/70">
                What it does
              </p>
              <p className="mt-4 font-[family:var(--font-display)] text-4xl leading-none">
                Write.
                <br />
                Save.
                <br />
                Return later.
              </p>
              <p className="mt-5 text-sm leading-7 text-emerald-100/80">
                The public homepage stays simple. The private dashboard handles
                card creation and personal entries.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
