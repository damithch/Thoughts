import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions";
import SubmitButton from "@/app/components/submit-button";
import { Toast } from "@/app/components/toast";
import {
  addSessionNoteAction,
  deleteSessionNoteAction,
  setSessionNoteDiscussedAction,
} from "@/app/dashboard/session/actions";
import { getCurrentUser } from "@/lib/auth";
import { getSessionNotes } from "@/lib/db";
import { SESSION_NOTE_LIMITS, sourceLabel, splitSessionNotes, type SessionNote } from "@/lib/session-notes";
import { getCurrentColomboDate, shiftColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

type SessionPageProps = {
  searchParams?: Promise<{ toast?: string; type?: "success" | "error" | "info" }>;
};

const toastMessages: Record<string, string> = {
  added: "Added to your list.",
  empty: "Write what you want to bring up first.",
  failed: "That couldn't be saved. Try again.",
  deleted: "Removed from your list.",
};

const card =
  "rounded-[1.75rem] border border-emerald-950/10 bg-white/60 p-5 shadow-[0_20px_60px_rgba(48,84,53,0.08)] backdrop-blur sm:p-6";
const eyebrow = "text-xs uppercase tracking-[0.2em] text-emerald-800/70";
const pill =
  "rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white";

function formatDay(value: Date | string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Colombo" });
}

function NoteRow({ note }: { note: SessionNote }) {
  const discussed = Boolean(note.discussed_at);

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-emerald-950/10 bg-white/70 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className={`text-sm leading-6 ${discussed ? "text-stone-500 line-through" : "text-stone-900"}`}>{note.content}</p>
        <p className="mt-1 text-xs text-stone-500">
          {sourceLabel(note.source)} · {formatDay(note.created_at)}
          {note.discussed_at ? ` · discussed ${formatDay(note.discussed_at)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2 text-sm">
        <form action={setSessionNoteDiscussedAction}>
          <input type="hidden" name="noteId" value={note.id} />
          <input type="hidden" name="discussed" value={discussed ? "0" : "1"} />
          <button type="submit" className="rounded-full border border-emerald-950/15 px-4 py-2 text-emerald-950 hover:bg-white">
            {discussed ? "Put back" : "Discussed"}
          </button>
        </form>
        <form action={deleteSessionNoteAction}>
          <input type="hidden" name="noteId" value={note.id} />
          <button type="submit" className="rounded-full border border-rose-900/15 px-4 py-2 text-rose-900 hover:bg-white">
            Remove
          </button>
        </form>
      </div>
    </li>
  );
}

export default async function SessionPage({ searchParams }: SessionPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const toastMessage = params?.toast ? toastMessages[params.toast] : null;
  const { open, discussed } = splitSessionNotes(await getSessionNotes(currentUser.id));
  const today = getCurrentColomboDate();
  const reportHref = `/api/reports/therapy?from=${shiftColomboDate(today, -13)}&to=${today}&sections=session,attention,worry`;

  return (
    <main className="thought-network-bg min-h-screen overflow-hidden px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="rounded-[2rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur-md sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className={eyebrow}>Therapy</p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl">For my next session</h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-stone-700">
                Things to bring up with your therapist. Add them as they come up, here, from a thought card, by voice or
                through Claude, and tick them off once you have talked about them.
              </p>
            </div>
            <nav aria-label="Other sections" className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
              <Link href="/dashboard" className={pill}>
                Journal
              </Link>
              <Link href="/dashboard/attention" className={pill}>
                Attention
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="w-full rounded-full bg-emerald-950 px-4 py-3 text-emerald-50 transition-colors hover:bg-emerald-800">
                  Logout
                </button>
              </form>
            </nav>
          </div>
        </header>

        <section className={card}>
          <p className={eyebrow}>Add</p>
          <form action={addSessionNoteAction} className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm text-stone-700">
              <span className="sr-only">What do you want to bring up?</span>
              <textarea
                name="content"
                rows={3}
                required
                maxLength={SESSION_NOTE_LIMITS.content}
                placeholder="What do you want to bring up?"
                className="w-full resize-none rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 text-sm outline-none transition focus:border-emerald-700"
              />
            </label>
            <div>
              <SubmitButton
                label="Add to list"
                pendingLabel="Adding…"
                className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
              />
            </div>
          </form>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={eyebrow}>To bring up</p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-2xl">
                {open.length === 0 ? "Nothing waiting" : `${open.length} waiting`}
              </h2>
            </div>
            <a href={reportHref} className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm text-emerald-950 hover:bg-white">
              Download report (PDF)
            </a>
          </div>
          {open.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-stone-600">
              When something comes up that you want to talk through, add it here so it is not lost by session day.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {open.map((note) => (
                <NoteRow key={note.id} note={note} />
              ))}
            </ul>
          )}
        </section>

        {discussed.length > 0 ? (
          <section className={card}>
            <p className={eyebrow}>Discussed</p>
            <ul className="mt-4 flex flex-col gap-3">
              {discussed.slice(0, 30).map((note) => (
                <NoteRow key={note.id} note={note} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
