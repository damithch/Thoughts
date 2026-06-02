import Link from "next/link";

import { createThoughtAction, logoutAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { getThoughts } from "@/lib/db";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const currentUser = await getCurrentUser();
  const { thoughts, databaseAvailable } = await getThoughts();
  const params = await searchParams;
  const databaseWriteError = params?.error === "db";

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#f7efe3_0%,#efe2d0_35%,#e3d0bb_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="sticky top-4 z-10 rounded-full border border-stone-900/10 bg-white/75 px-4 py-3 shadow-[0_18px_40px_rgba(86,58,34,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <a
              href="#home"
              className="font-[family:var(--font-display)] text-3xl leading-none"
            >
              Thoughts
            </a>
            <nav aria-label="Primary" className="flex flex-wrap gap-2 text-sm">
              <a
                href="#home"
                className="rounded-full bg-stone-900 px-4 py-2 text-stone-50 transition-colors hover:bg-stone-700"
              >
                Home
              </a>
              <a
                href="#today"
                className="rounded-full border border-stone-900/10 px-4 py-2 text-stone-700 transition-colors hover:bg-white"
              >
                Today&apos;s Note
              </a>
              <a
                href="#archive"
                className="rounded-full border border-stone-900/10 px-4 py-2 text-stone-700 transition-colors hover:bg-white"
              >
                Archive
              </a>
              {currentUser ? (
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="rounded-full border border-stone-900/10 px-4 py-2 text-stone-700 transition-colors hover:bg-white"
                  >
                    Logout
                  </button>
                </form>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-full border border-stone-900/10 px-4 py-2 text-stone-700 transition-colors hover:bg-white"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-full bg-stone-900 px-4 py-2 text-stone-50 transition-colors hover:bg-stone-700"
                  >
                    Register
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>

        <section
          id="home"
          className="rounded-[2rem] border border-stone-900/10 bg-white/65 p-8 shadow-[0_20px_60px_rgba(86,58,34,0.12)] backdrop-blur md:p-12"
        >
          {databaseWriteError ? (
            <div className="mb-6 rounded-2xl border border-rose-700/10 bg-rose-100/80 px-4 py-3 text-sm text-rose-950">
              The thought could not be saved because the database is currently
              unavailable.
            </div>
          ) : null}
          {!databaseAvailable ? (
            <div className="mb-6 rounded-2xl border border-amber-700/15 bg-amber-100/80 px-4 py-3 text-sm text-amber-950">
              Neon is unreachable right now, so the page is showing fallback
              cards. Your hostname or local DNS cannot currently resolve the
              database server.
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm uppercase tracking-[0.28em] text-stone-500">
              Personal journal
            </p>
            <p className="text-sm text-stone-500">
              {currentUser
                ? `Signed in as ${currentUser.name}.`
                : "A home for notes, fragments, and quiet ideas."}
            </p>
          </div>
          <div className="mt-6 grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <h1 className="font-[family:var(--font-display)] text-5xl leading-none md:text-7xl">
                Thoughts worth keeping should feel easy to revisit.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-stone-700 md:text-lg">
                Start collecting your ideas, memories, and short reflections as
                visual cards. This homepage is ready to evolve into your journal.
              </p>
            </div>
            <div
              id="today"
              className="rounded-[1.75rem] bg-stone-900 p-6 text-stone-100"
            >
              <p className="text-sm uppercase tracking-[0.24em] text-stone-400">
                Today&apos;s note
              </p>
              <p className="mt-4 font-[family:var(--font-display)] text-3xl leading-tight">
                {thoughts[0]?.excerpt ??
                  "Some thoughts arrive complete. Most become meaningful after you return to them."}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.75rem] border border-stone-900/10 bg-stone-900 p-8 text-stone-100 shadow-[0_18px_40px_rgba(86,58,34,0.12)]">
            <p className="text-sm uppercase tracking-[0.24em] text-stone-400">
              Add a thought
            </p>
            <h2 className="mt-4 font-[family:var(--font-display)] text-4xl leading-none md:text-5xl">
              Write now. Sort later.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-stone-300">
              {currentUser
                ? "This form posts to a server action, inserts a row into Neon, and refreshes the archive below."
                : "Create an account or log in first. After that, this form will save your cards to Neon."}
            </p>
          </div>

          <form
            action={createThoughtAction}
            className="rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-[0_18px_40px_rgba(86,58,34,0.08)] md:p-8"
          >
            <div className="grid gap-5">
              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-stone-500">
                  Title
                </span>
                <input
                  type="text"
                  name="title"
                  placeholder="An idea worth returning to"
                  required
                  className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-500"
                />
              </label>

              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-stone-500">
                  Category
                </span>
                <input
                  type="text"
                  name="category"
                  placeholder="Reflection"
                  required
                  className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-500"
                />
              </label>

              <label className="grid gap-2 text-sm text-stone-700">
                <span className="uppercase tracking-[0.18em] text-stone-500">
                  Thought
                </span>
                <textarea
                  name="excerpt"
                  rows={5}
                  placeholder="Write the thought exactly as it arrives."
                  required
                  className="resize-none rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-500"
                />
              </label>

              <div className="flex items-center justify-between gap-4 pt-2">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                  {databaseAvailable
                    ? currentUser
                      ? "Saved to Neon"
                      : "Login required"
                    : "Database offline"}
                </p>
                <button
                  type="submit"
                  disabled={!currentUser || !databaseAvailable}
                  className="rounded-full bg-stone-900 px-5 py-3 text-sm uppercase tracking-[0.16em] text-stone-50 transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  Add Card
                </button>
              </div>
            </div>
          </form>
        </section>

        <section id="archive" className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-stone-500">
                Archive
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-4xl leading-none md:text-5xl">
                Thought cards
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-stone-600 md:text-right">
              Browse your latest entries as cards. This section is already
              reading from Neon, so new records can appear here next.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {thoughts.map((thought, index) => (
              <article
                key={thought.id}
                className="group rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-[0_18px_40px_rgba(86,58,34,0.08)] transition-transform duration-300 hover:-translate-y-1"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-stone-500">
                  <span>{thought.category}</span>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h2 className="mt-6 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                  {thought.title}
                </h2>
                <p className="mt-4 text-base leading-7 text-stone-700">
                  {thought.excerpt}
                </p>
                <p className="mt-6 text-xs uppercase tracking-[0.2em] text-stone-400">
                  {new Date(thought.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
