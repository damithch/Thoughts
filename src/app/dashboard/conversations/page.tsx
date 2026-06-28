import Link from "next/link";
import { redirect } from "next/navigation";

import { deleteConversationSummaryAction, logoutAction } from "@/app/actions";
import { Toast } from "@/app/components/toast";
import { getCurrentUser } from "@/lib/auth";
import { getConversationSummariesByUser } from "@/lib/db";
import { toColomboDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type ConversationsPageProps = {
  searchParams?: Promise<{
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

const conversationToastMessages: Record<string, string> = {
  deleted: "Conversation log deleted.",
  delete_failed: "That conversation log could not be deleted.",
};

export default async function ConversationsPage({ searchParams }: ConversationsPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const toastMessage = params?.toast ? conversationToastMessages[params.toast] : undefined;
  const conversationSummaries = await getConversationSummariesByUser(currentUser.id, 24);

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
        <header className="rounded-[2rem] border border-cyan-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-900/70 sm:text-sm sm:tracking-[0.28em]">
                Claude Conversation Log
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl md:text-6xl">
                Assistant summaries
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-700">
                This page is separate from your thought archive. It stores structured summaries
                pushed from Claude, including topics, insights, action items, and optional mood
                context.
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
          <div className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-900/70">
              Total logs
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {conversationSummaries.length}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-900/70">
              Latest log date
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              {conversationSummaries[0]?.conversation_date ?? "No entries"}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-900/70">
              Purpose
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              Structured AI summaries kept outside the thought-card archive.
            </p>
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-stone-500">
              Conversation archive
            </p>
            <h2 className="mt-2 font-[family:var(--font-display)] text-4xl leading-none md:text-5xl">
              {conversationSummaries.length === 1
                ? "1 conversation log"
                : `${conversationSummaries.length} conversation logs`}
            </h2>
          </div>

          {conversationSummaries.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-cyan-950/15 bg-white/60 p-8 text-center text-stone-600 sm:p-10">
              <p className="font-[family:var(--font-display)] text-2xl text-stone-900 sm:text-3xl">
                No Claude conversation logs yet.
              </p>
              <p className="mt-4 text-sm leading-7">
                When Claude calls the `create_conversation_log` MCP tool, new summaries will appear
                here.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {conversationSummaries.map((summary) => (
                <article
                  key={summary.id}
                  className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_26px_70px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6"
                >
                  <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.22em] text-stone-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>Claude Conversation Log</span>
                    <span>{summary.conversation_date}</span>
                  </div>

                  <h3 className="mt-5 font-[family:var(--font-display)] text-3xl leading-none text-stone-900 sm:mt-6 sm:text-4xl">
                    {summary.title}
                  </h3>

                  {summary.mood_context ? (
                    <div className="mt-4">
                      <span className="rounded-full border border-cyan-950/10 bg-cyan-50 px-3 py-1 text-xs uppercase tracking-[0.16em] text-cyan-950">
                        Mood context {summary.mood_context}/10
                      </span>
                    </div>
                  ) : null}

                  {summary.key_topics.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {summary.key_topics.map((topic) => (
                        <span
                          key={`${summary.id}-${topic}`}
                          className="rounded-full border border-cyan-950/10 bg-cyan-50/70 px-3 py-1 text-xs uppercase tracking-[0.14em] text-cyan-950"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-5 rounded-2xl border border-cyan-950/10 bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-cyan-900/75">
                      Insights
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                      {summary.insights}
                    </p>
                  </div>

                  {summary.action_items.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-amber-900/10 bg-amber-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-amber-900/75">
                        Action items
                      </p>
                      <ul className="mt-3 grid gap-2 text-sm leading-7 text-stone-700">
                        {summary.action_items.map((item) => (
                          <li key={`${summary.id}-action-${item}`}>- {item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <p className="mt-6 text-xs uppercase tracking-[0.2em] text-stone-400">
                    Saved {toColomboDateTime(summary.created_at)}
                  </p>

                  <div className="mt-5">
                    <form action={deleteConversationSummaryAction}>
                      <input type="hidden" name="conversationId" value={summary.id} />
                      <button
                        type="submit"
                        className="inline-flex rounded-full border border-rose-900/10 bg-rose-50/90 px-4 py-3 text-xs uppercase tracking-[0.16em] text-rose-900 transition hover:bg-rose-100 sm:py-2"
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
