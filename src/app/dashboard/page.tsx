import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createThoughtAction,
  deleteThoughtAction,
  logoutAction,
  updateThoughtAction,
} from "@/app/actions";
import { Toast } from "@/app/components/toast";
import { getCurrentUser } from "@/lib/auth";
import { getThoughtByIdForUser, getThoughtsByUser } from "@/lib/db";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{
    edit?: string;
    tag?: string;
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

const dashboardToastMessages: Record<string, string> = {
  created: "Thought card created.",
  deleted: "Thought card deleted.",
  delete_failed: "That card could not be deleted.",
  invalid_entry: "Add a title, category, mood, and card text before saving.",
  registered: "Account created. Your dashboard is ready.",
  save_failed: "The card could not be saved.",
  update_failed: "That card could not be updated.",
  updated: "Thought card updated.",
  welcome_back: "Signed in successfully.",
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  let databaseAvailable = true;
  let thoughts: Awaited<ReturnType<typeof getThoughtsByUser>> = [];

  try {
    thoughts = await getThoughtsByUser(currentUser.id);
  } catch (error) {
    console.error("Failed to load dashboard thoughts.", error);
    databaseAvailable = false;
  }

  const params = await searchParams;
  const toastMessage = params?.toast
    ? dashboardToastMessages[params.toast]
    : undefined;
  const activeTag = params?.tag?.trim().toLowerCase() ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const editThoughtId = params?.edit ? Number(params.edit) : null;
  const validEditThoughtId =
    editThoughtId && Number.isInteger(editThoughtId) && editThoughtId > 0
      ? editThoughtId
      : null;
  const editingThought = validEditThoughtId
    ? await getThoughtByIdForUser(validEditThoughtId, currentUser.id)
    : null;
  type DashboardThought = Awaited<ReturnType<typeof getThoughtsByUser>>[number];
  const filteredThoughts = activeTag
    ? thoughts.filter((thought: DashboardThought) => thought.tags.includes(activeTag))
    : thoughts;
  const latestThought = filteredThoughts[0] ?? null;
  const averageMood = filteredThoughts.length
    ? (filteredThoughts.reduce((total, thought) => total + thought.mood, 0) / filteredThoughts.length).toFixed(1)
    : "0.0";
  const visibleTags = Array.from(
    new Set(filteredThoughts.flatMap((thought: DashboardThought) => thought.tags)),
  ).slice(0, 12);
  const latestActivity = latestThought
    ? new Date(latestThought.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No entries";

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-6 py-10 text-stone-900">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-[2.5rem] border border-emerald-950/10 bg-white/70 p-6 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-emerald-800/70">
                Dashboard
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-5xl leading-none md:text-6xl">
                {currentUser.name}
              </h1>
              <p className="mt-4 text-sm leading-7 text-stone-700">
                {currentUser.email}
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href="/"
                className="rounded-full border border-emerald-950/10 px-4 py-2 text-emerald-950 transition-colors hover:bg-white"
              >
                Public Home
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-full bg-emerald-950 px-4 py-2 text-emerald-50 transition-colors hover:bg-emerald-800"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </header>

        {!databaseAvailable ? (
          <div className="rounded-2xl border border-amber-700/15 bg-amber-100/80 px-4 py-3 text-sm text-amber-950">
            Neon is unreachable right now, so your dashboard cannot load saved
            cards until the database connection comes back.
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Total cards
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {filteredThoughts.length}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Latest activity
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              {latestActivity}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Average mood
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              {averageMood}/10
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                Tag filter
              </p>
              <p className="mt-2 text-sm leading-7 text-stone-700">
                Use tags to isolate patterns like work, family, health, or specific projects.
              </p>
            </div>
            {activeTag ? (
              <Link
                href="/dashboard"
                className="inline-flex rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
              >
                Clear filter
              </Link>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {visibleTags.length === 0 ? (
              <p className="text-sm text-stone-600">No tags yet.</p>
            ) : (
              visibleTags.map((tag) => (
                <Link
                  key={tag}
                  href={`/dashboard?tag=${encodeURIComponent(tag)}`}
                  className={`inline-flex rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${
                    activeTag === tag
                      ? "bg-emerald-950 text-emerald-50"
                      : "border border-emerald-950/10 bg-white/70 text-emerald-950 hover:bg-white"
                  }`}
                >
                  {tag}
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="grid gap-6">
            <form
              action={editingThought ? updateThoughtAction : createThoughtAction}
              className="rounded-[2rem] border border-emerald-950/10 bg-white/75 p-6 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur md:p-8"
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                    {editingThought ? "Edit thought" : "New thought"}
                  </p>
                  <h2 className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-stone-900">
                    {editingThought ? "Refine your card" : "Capture a new card"}
                  </h2>
                </div>
              </div>
              <div className="grid gap-5">
                {editingThought ? (
                  <input type="hidden" name="thoughtId" value={editingThought.id} />
                ) : null}
                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                    Title
                  </span>
                  <input
                    type="text"
                    name="title"
                    defaultValue={editingThought?.title ?? ""}
                    required
                    className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                  />
                </label>

                <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
                  <label className="grid gap-2 text-sm text-stone-700">
                    <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                      Category
                    </span>
                    <input
                      type="text"
                      name="category"
                      defaultValue={editingThought?.category ?? ""}
                      required
                      className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-stone-700">
                    <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                      Mood {editingThought?.mood ?? 5}/10
                    </span>
                    <input
                      type="range"
                      name="mood"
                      min="1"
                      max="10"
                      step="1"
                      defaultValue={editingThought?.mood ?? 5}
                      required
                      className="mt-2 accent-emerald-900"
                    />
                    <div className="flex justify-between text-xs uppercase tracking-[0.12em] text-stone-500">
                      <span>Low</span>
                      <span>High</span>
                    </div>
                  </label>
                </div>

                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                    Tags
                  </span>
                  <input
                    type="text"
                    name="tags"
                    defaultValue={editingThought?.tags.join(", ") ?? ""}
                    placeholder="work, family, health"
                    className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                  />
                  <span className="text-xs leading-6 text-stone-500">
                    Separate tags with commas. Use them to group cards across different categories.
                  </span>
                </label>

                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                    Card text
                  </span>
                  <textarea
                    name="excerpt"
                    rows={6}
                    defaultValue={editingThought?.excerpt ?? ""}
                    required
                    className="resize-none rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                  />
                </label>

                <div className="flex items-center justify-between gap-4 pt-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                    {editingThought ? "Updates this card" : "Saves to your account"}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {editingThought ? (
                      <Link
                        href="/dashboard"
                        className="rounded-full border border-emerald-950/10 bg-white/70 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
                      >
                        Cancel
                      </Link>
                    ) : null}
                    <button
                      type="submit"
                      disabled={!databaseAvailable}
                      className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      {editingThought ? "Update Card" : "Create Card"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <div className="grid gap-6">
            <form
              action="/api/reports/daily"
              method="get"
              className="rounded-[2rem] border border-emerald-950/10 bg-white/75 p-6 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur md:p-8"
            >
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                  Reports
                </p>
                <h2 className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-stone-900">
                  Review a specific day
                </h2>
              </div>
              <div className="flex flex-col gap-5">
                <div className="space-y-3">
                  <p className="text-sm leading-7 text-stone-700">
                    JSON is best for AI processing. It preserves structure
                    clearly, so an AI can analyze dates, categories, frequency,
                    mood, repeated themes, and patterns more reliably than from
                    plain text or CSV.
                  </p>
                </div>

                <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                  <div className="grid flex-1 gap-2 text-sm text-stone-700">
                    <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                      Download daily report
                    </span>
                    <input
                      type="date"
                      name="date"
                      defaultValue={today}
                      required
                      className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      name="format"
                      value="csv"
                      disabled={!databaseAvailable}
                      className="rounded-full border border-emerald-950/10 bg-white/70 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-400"
                    >
                      Download CSV
                    </button>
                    <button
                      type="submit"
                      name="format"
                      value="json"
                      disabled={!databaseAvailable}
                      className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      Download JSON
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <div className="rounded-[2rem] border border-emerald-950/10 bg-white/75 p-6 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur md:p-8">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                Summary
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-stone-900">
                Your writing space
              </h2>
              <p className="mt-4 text-sm leading-7 text-stone-700">
                Use this dashboard to track category, mood, and tags together,
                then export daily entries when you want to review patterns or
                run AI analysis.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-stone-500">
                {activeTag ? `Archive: ${activeTag}` : "Archive"}
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-4xl leading-none md:text-5xl">
                {filteredThoughts.length === 1 ? "1 card" : `${filteredThoughts.length} cards`}
              </h2>
            </div>
          </div>

          {filteredThoughts.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/60 p-10 text-center text-stone-600">
              <p className="font-[family:var(--font-display)] text-3xl text-stone-900">
                {activeTag ? "No cards match this tag." : "No cards yet."}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredThoughts.map((thought: DashboardThought) => (
                <article
                  key={thought.id}
                  className="rounded-[2rem] border border-emerald-950/10 bg-white/72 p-6 shadow-[0_26px_70px_rgba(48,84,53,0.10)] backdrop-blur"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-stone-500">
                    <span>{thought.category}</span>
                    <span>Mood {thought.mood}/10</span>
                  </div>
                  <h3 className="mt-6 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                    {thought.title}
                  </h3>
                  <p className="mt-4 text-base leading-7 text-stone-700">
                    {thought.excerpt}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {thought.tags.length === 0 ? (
                      <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
                        No tags
                      </span>
                    ) : (
                      thought.tags.map((tag) => (
                        <Link
                          key={`${thought.id}-${tag}`}
                          href={`/dashboard?tag=${encodeURIComponent(tag)}`}
                          className="rounded-full border border-emerald-950/10 bg-white/75 px-3 py-1 text-xs uppercase tracking-[0.14em] text-emerald-950 transition hover:bg-white"
                        >
                          {tag}
                        </Link>
                      ))
                    )}
                  </div>
                  <p className="mt-6 text-xs uppercase tracking-[0.2em] text-stone-400">
                    {new Date(thought.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-stone-400">
                    Updated{" "}
                    {new Date(thought.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={`/dashboard?edit=${thought.id}`}
                      className="inline-flex rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
                    >
                      Edit
                    </Link>
                    <form action={deleteThoughtAction}>
                      <input type="hidden" name="thoughtId" value={thought.id} />
                      <button
                        type="submit"
                        disabled={!databaseAvailable}
                        className="inline-flex rounded-full border border-rose-900/10 bg-rose-50/90 px-4 py-2 text-xs uppercase tracking-[0.16em] text-rose-900 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
