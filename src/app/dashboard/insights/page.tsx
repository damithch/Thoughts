import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createBookAction,
  createBookIdeaAction,
  logoutAction,
  updateBookIdeaStatusAction,
} from "@/app/actions";
import { Toast } from "@/app/components/toast";
import { getCurrentUser } from "@/lib/auth";
import { getBookIdeasByUser, getBooksByUser, type BookIdeaStatus } from "@/lib/db";

type InsightsPageProps = {
  searchParams?: Promise<{
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

const insightToastMessages: Record<string, string> = {
  book_created: "Source added to your library.",
  book_failed: "That source could not be saved.",
  book_invalid: "Add a title and source type before saving.",
  idea_created: "Idea added to the library.",
  idea_failed: "That idea could not be saved.",
  idea_invalid: "Choose a source, add idea text, and pick a status.",
  idea_updated: "Idea status updated.",
  idea_update_failed: "That idea could not be updated.",
};

const ideaStatuses: Array<{ value: BookIdeaStatus; label: string }> = [
  { value: "understood", label: "Understood" },
  { value: "noticed", label: "Noticed" },
  { value: "applied", label: "Applied" },
  { value: "internalized", label: "Internalized" },
];

function getStatusClassName(status: BookIdeaStatus) {
  if (status === "internalized") {
    return "bg-emerald-100 text-emerald-900 border-emerald-900/10";
  }

  if (status === "applied") {
    return "bg-blue-100 text-blue-900 border-blue-900/10";
  }

  if (status === "noticed") {
    return "bg-amber-100 text-amber-900 border-amber-900/10";
  }

  return "bg-stone-100 text-stone-700 border-stone-900/10";
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const toastMessage = params?.toast ? insightToastMessages[params.toast] : undefined;
  const [books, ideas] = await Promise.all([
    getBooksByUser(currentUser.id),
    getBookIdeasByUser(currentUser.id),
  ]);

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f6f2e7_0%,#efe6d1_52%,#e7d8bf_100%)] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
        <header className="rounded-[2rem] border border-amber-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(84,64,34,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-amber-800/70 sm:text-sm sm:tracking-[0.28em]">
                Insight Library
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl md:text-6xl">
                Ideas you are trying to live
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-700">
                Add books, articles, podcasts, or standalone principles. Then link your journal
                thoughts back to those ideas when they show up in real life.
              </p>
            </div>

            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
              <Link
                href="/dashboard"
                className="rounded-full border border-amber-950/10 px-4 py-3 text-center text-amber-950 transition-colors hover:bg-white"
              >
                Journal Dashboard
              </Link>
              <Link
                href="/dashboard/today"
                className="rounded-full border border-amber-950/10 px-4 py-3 text-center text-amber-950 transition-colors hover:bg-white"
              >
                Today View
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-full bg-amber-950 px-4 py-3 text-amber-50 transition-colors hover:bg-amber-800"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-6">
            <form
              action={createBookAction}
              className="rounded-[1.75rem] border border-amber-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(84,64,34,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-amber-800/70">
                Source library
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                Add a source
              </h2>

              <div className="mt-6 grid gap-5">
                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="uppercase tracking-[0.18em] text-amber-800/70">
                    Title
                  </span>
                  <input
                    type="text"
                    name="title"
                    required
                    placeholder="The 48 Laws of Power"
                    className="rounded-2xl border border-amber-950/10 bg-amber-50/60 px-4 py-3 outline-none transition focus:border-amber-700"
                  />
                </label>

                <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
                  <label className="grid gap-2 text-sm text-stone-700">
                    <span className="uppercase tracking-[0.18em] text-amber-800/70">
                      Author / source
                    </span>
                    <input
                      type="text"
                      name="author"
                      placeholder="Robert Greene"
                      className="rounded-2xl border border-amber-950/10 bg-amber-50/60 px-4 py-3 outline-none transition focus:border-amber-700"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-stone-700">
                    <span className="uppercase tracking-[0.18em] text-amber-800/70">
                      Type
                    </span>
                    <select
                      name="sourceType"
                      defaultValue="book"
                      className="rounded-2xl border border-amber-950/10 bg-amber-50/60 px-4 py-3 outline-none transition focus:border-amber-700"
                    >
                      <option value="book">Book</option>
                      <option value="article">Article</option>
                      <option value="podcast">Podcast</option>
                      <option value="principle">Standalone principle</option>
                    </select>
                  </label>
                </div>

                <button
                  type="submit"
                  className="rounded-full bg-amber-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-amber-50 transition hover:bg-amber-800"
                >
                  Add source
                </button>
              </div>
            </form>

            <form
              action={createBookIdeaAction}
              className="rounded-[1.75rem] border border-amber-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(84,64,34,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-amber-800/70">
                Idea capture
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                Add an idea to practice
              </h2>

              <div className="mt-6 grid gap-5">
                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="uppercase tracking-[0.18em] text-amber-800/70">
                    Source
                  </span>
                  <select
                    name="bookId"
                    defaultValue=""
                    required
                    className="rounded-2xl border border-amber-950/10 bg-amber-50/60 px-4 py-3 outline-none transition focus:border-amber-700"
                  >
                    <option value="" disabled>
                      Choose a source
                    </option>
                    {books.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.title}{book.author ? ` - ${book.author}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="uppercase tracking-[0.18em] text-amber-800/70">
                    Idea text
                  </span>
                  <textarea
                    name="ideaText"
                    rows={4}
                    required
                    placeholder="Never outshine the master."
                    className="resize-none rounded-2xl border border-amber-950/10 bg-amber-50/60 px-4 py-3 outline-none transition focus:border-amber-700"
                  />
                </label>

                <label className="grid gap-2 text-sm text-stone-700">
                  <span className="uppercase tracking-[0.18em] text-amber-800/70">
                    Current depth
                  </span>
                  <select
                    name="status"
                    defaultValue="understood"
                    className="rounded-2xl border border-amber-950/10 bg-amber-50/60 px-4 py-3 outline-none transition focus:border-amber-700"
                  >
                    {ideaStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="submit"
                  className="rounded-full bg-amber-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-amber-50 transition hover:bg-amber-800"
                >
                  Add idea
                </button>
              </div>
            </form>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[1.75rem] border border-amber-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(84,64,34,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
              <p className="text-xs uppercase tracking-[0.18em] text-amber-800/70">
                Library snapshot
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.5rem] border border-amber-950/10 bg-white/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-800/70">Sources</p>
                  <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                    {books.length}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-amber-950/10 bg-white/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-800/70">Ideas</p>
                  <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                    {ideas.length}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-amber-950/10 bg-white/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-800/70">Applied+</p>
                  <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                    {ideas.filter((idea) => idea.status === "applied" || idea.status === "internalized").length}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-amber-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(84,64,34,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
              <p className="text-xs uppercase tracking-[0.18em] text-amber-800/70">
                Ideas in progress
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                Your current absorption map
              </h2>

              <div className="mt-6 grid gap-4">
                {ideas.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-stone-900/12 bg-white/55 p-6 text-sm leading-7 text-stone-600">
                    Add a source and at least one idea to start linking your journal to the things
                    you are trying to understand and practice.
                  </div>
                ) : (
                  ideas.map((idea) => (
                    <article
                      key={idea.id}
                      className="rounded-[1.5rem] border border-amber-950/10 bg-white/80 p-4 shadow-[0_14px_30px_rgba(84,64,34,0.06)]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                            {idea.source_type} - {idea.book_title}
                            {idea.book_author ? ` - ${idea.book_author}` : ""}
                          </p>
                          <p className="mt-3 text-sm leading-7 text-stone-800">{idea.idea_text}</p>
                        </div>

                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${getStatusClassName(idea.status)}`}
                        >
                          {idea.status}
                        </span>
                      </div>

                      <form action={updateBookIdeaStatusAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <input type="hidden" name="bookIdeaId" value={idea.id} />
                        <select
                          name="status"
                          defaultValue={idea.status}
                          className="rounded-full border border-amber-950/10 bg-white px-4 py-2 text-sm text-stone-800 outline-none transition focus:border-amber-700"
                        >
                          {ideaStatuses.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-full bg-amber-950 px-4 py-2 text-sm uppercase tracking-[0.16em] text-amber-50 transition hover:bg-amber-800"
                        >
                          Update depth
                        </button>
                      </form>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
