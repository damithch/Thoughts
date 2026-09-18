"use client";

import { useState } from "react";
import type { AnchorNote, AnchorStreak } from "@/lib/db/types";
import { SubmitButton } from "@/app/components/submit-button";

type AnchorNoteCardProps = {
  todayNote: AnchorNote | null;
  streak: AnchorStreak;
  recentNotes: AnchorNote[];
  createAction: (formData: FormData) => Promise<void>;
  databaseAvailable?: boolean;
};

export function AnchorNoteCard({
  todayNote,
  streak,
  recentNotes,
  createAction,
  databaseAvailable = true,
}: AnchorNoteCardProps) {
  const [content, setContent] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const charCount = content.length;
  const isLocked = Boolean(todayNote);

  return (
    <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm text-emerald-900">
              ⚓
            </span>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-800/80 font-medium">
              Daily Anchor
            </p>
          </div>
          <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
            What stayed true about you today?
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            A single sentence of steady ground. Locks once submitted to prevent second-guessing.
          </p>
        </div>

        {/* Streak & Stats Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {streak.currentStreak > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-600/20 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900">
              <span className="animate-pulse">🔥</span>
              <span>
                {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"} streak
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-950/10 bg-emerald-50/70 px-3 py-1.5 font-medium text-emerald-950">
              🌱 Day 1
            </span>
          )}

          {streak.totalEntries > 0 ? (
            <span className="rounded-full border border-stone-900/10 bg-stone-50 px-3 py-1.5 text-stone-600">
              {streak.totalEntries} total anchor{streak.totalEntries === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>

      {/* Main Content: Locked state OR Input form */}
      <div className="mt-6">
        {isLocked && todayNote ? (
          <div className="relative overflow-hidden rounded-2xl border border-emerald-900/15 bg-gradient-to-br from-emerald-50/90 via-emerald-100/40 to-teal-50/50 p-5 sm:p-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-900/20 bg-emerald-950/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-900">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  Locked for today
                </span>
                <span className="text-xs text-emerald-900/60 font-mono">
                  {todayNote.date}
                </span>
              </div>

              <blockquote className="mt-2 text-lg sm:text-xl font-[family:var(--font-display)] italic text-emerald-950 leading-relaxed">
                &ldquo;{todayNote.content}&rdquo;
              </blockquote>

              <p className="mt-1 text-xs text-emerald-800/70">
                Anchored for today. This intentional friction keeps it authentic — return tomorrow to log your next anchor.
              </p>
            </div>
          </div>
        ) : (
          <form action={createAction} className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="relative">
                <input
                  type="text"
                  name="content"
                  required
                  maxLength={280}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={!databaseAvailable}
                  placeholder="One true sentence (e.g., I held my boundaries even when it felt uncomfortable.)"
                  className="w-full rounded-2xl border border-emerald-950/15 bg-white/90 px-4 py-3.5 pr-20 text-sm text-stone-900 shadow-inner outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:bg-white focus:ring-2 focus:ring-emerald-700/10 disabled:opacity-50"
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-stone-400">
                  <span className={charCount > 250 ? "text-amber-600 font-bold" : ""}>
                    {charCount}
                  </span>
                  /280
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
              <p className="text-xs text-stone-500">
                ⚠️ Once dropped, today&apos;s anchor cannot be edited. Keep it grounded and brief.
              </p>

              <SubmitButton
                label="Drop Anchor ⚓"
                pendingLabel="Anchoring…"
                disabled={!databaseAvailable || !content.trim()}
                className="inline-flex items-center justify-center rounded-full bg-emerald-950 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50 shadow-md transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:text-emerald-500"
              />
            </div>
          </form>
        )}
      </div>

      {/* Retrospective Section Toggle */}
      {recentNotes.length > 0 ? (
        <div className="mt-6 border-t border-emerald-950/10 pt-4">
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900 hover:text-emerald-700 transition"
          >
            <span>{showHistory ? "Hide past anchors" : `View past anchors (${recentNotes.length})`}</span>
            <svg
              className={`h-3.5 w-3.5 transition-transform duration-200 ${showHistory ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showHistory ? (
            <div className="mt-4 max-h-72 overflow-y-auto pr-2 space-y-2.5 divide-y divide-emerald-950/5">
              {recentNotes.map((note) => (
                <div
                  key={note.id}
                  className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-mono text-emerald-800/60 shrink-0">
                      {note.date}
                    </span>
                    <span className="text-sm text-stone-800 leading-relaxed font-normal">
                      &ldquo;{note.content}&rdquo;
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
