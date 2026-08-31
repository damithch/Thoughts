"use client";

import React, { useEffect, useRef, useState } from "react";

export type RagResultItem = {
  id?: number | string;
  user_id?: number;
  document_key?: string;
  source_entity_id?: string;
  chunk_index?: number;
  chunk_text: string;
  distance?: number;
  metadata?: {
    category?: string;
    mood?: number;
    tags?: string[];
    concept_tags?: string[];
    created_date?: string;
    source_date?: string;
    entry_date?: string;
    conversation_date?: string;
    book_title?: string;
    idea_text?: string;
    [key: string]: unknown;
  };
};

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "Past item";

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 24 && now.getDate() === date.getDate()) {
    return "Today";
  }
  if (diffDays === 1 || (diffHours < 48 && now.getDate() - date.getDate() === 1)) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

function getDocumentKindInfo(documentKey?: string): { label: string; badgeStyle: string } {
  if (!documentKey) return { label: "Memory", badgeStyle: "bg-emerald-100 text-emerald-800 border-emerald-200" };

  if (documentKey.startsWith("thought:")) {
    return { label: "Thought", badgeStyle: "bg-emerald-100 text-emerald-900 border-emerald-300" };
  }
  if (documentKey.startsWith("book_idea:")) {
    return { label: "Book Idea", badgeStyle: "bg-amber-100 text-amber-900 border-amber-300" };
  }
  if (documentKey.startsWith("conversation_summary:")) {
    return { label: "AI Chat", badgeStyle: "bg-indigo-100 text-indigo-900 border-indigo-300" };
  }
  if (documentKey.startsWith("ba_entry:")) {
    return { label: "CBT Activity", badgeStyle: "bg-rose-100 text-rose-900 border-rose-300" };
  }
  if (documentKey.startsWith("day_note:")) {
    return { label: "Day Note", badgeStyle: "bg-teal-100 text-teal-900 border-teal-300" };
  }
  if (documentKey.startsWith("daily_rollup:")) {
    return { label: "Daily Rollup", badgeStyle: "bg-slate-100 text-slate-900 border-slate-300" };
  }

  return { label: "Past Note", badgeStyle: "bg-stone-100 text-stone-800 border-stone-300" };
}

function getItemTitle(item: RagResultItem): string {
  const meta = item.metadata;
  if (meta?.book_title) {
    return `${meta.book_title} — ${meta.idea_text ?? "Idea"}`;
  }

  // Look for Title: ... line in chunk_text
  const titleLine = item.chunk_text.split("\n").find((line) => line.startsWith("Title:"));
  if (titleLine) {
    return titleLine.replace(/^Title:\s*/, "").trim();
  }

  // Look for Source: ... line
  const sourceLine = item.chunk_text.split("\n").find((line) => line.startsWith("Source:"));
  if (sourceLine) {
    return sourceLine.replace(/^Source:\s*/, "").trim();
  }

  // Fallback to first non-empty line or truncated chunk
  const firstLine = item.chunk_text.split("\n").find((l) => l.trim().length > 0) ?? item.chunk_text;
  return firstLine.slice(0, 60).trim();
}

function getItemSnippet(item: RagResultItem): string {
  const lines = item.chunk_text.split("\n").filter((line) => {
    const l = line.trim();
    return l && !l.startsWith("Title:") && !l.startsWith("Category:") && !l.startsWith("Mood:");
  });

  const bodyText = lines.join(" ").trim();
  return bodyText.slice(0, 140) + (bodyText.length > 140 ? "…" : "");
}

function getItemDate(item: RagResultItem): string | undefined {
  const meta = item.metadata;
  return (
    meta?.created_date ??
    meta?.source_date ??
    meta?.entry_date ??
    meta?.conversation_date ??
    undefined
  );
}

type LiveRagContextProps = {
  formRef?: React.RefObject<HTMLFormElement | null>;
};

export function LiveRagContext({ formRef }: LiveRagContextProps) {
  const [results, setResults] = useState<RagResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RagResultItem | null>(null);

  const lastQueriedTextRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resultsLengthRef = useRef<number>(0);

  // Keep resultsLengthRef in sync with results state
  useEffect(() => {
    resultsLengthRef.current = results.length;
  }, [results]);

  useEffect(() => {
    function readFormDraft(): string {
      // Read from the form ref if available, otherwise fall back to document query
      const form = formRef?.current;

      let titleInput: HTMLInputElement | null = null;
      let bodyInput: HTMLTextAreaElement | null = null;
      let summaryInput: HTMLTextAreaElement | null = null;

      if (form) {
        titleInput = form.querySelector<HTMLInputElement>('input[name="title"]');
        bodyInput = form.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
        summaryInput = form.querySelector<HTMLTextAreaElement>('textarea[name="summary"]');
      } else {
        titleInput = document.querySelector<HTMLInputElement>('form input[name="title"]');
        bodyInput = document.querySelector<HTMLTextAreaElement>('form textarea[name="body"]');
        summaryInput = document.querySelector<HTMLTextAreaElement>('form textarea[name="summary"]');
      }

      const title = titleInput?.value.trim() ?? "";
      const summary = summaryInput?.value.trim() ?? "";
      const body = bodyInput?.value.trim() ?? "";

      return [title, summary, body].filter(Boolean).join(" ");
    }

    function handleFormInputChange() {
      const currentDraft = readFormDraft();

      // Skip query if draft under ~20 characters
      if (currentDraft.length < 20) {
        if (resultsLengthRef.current > 0) setResults([]);
        return;
      }

      // Check diff length vs last query: don't re-query if diff < 10 characters
      const lastQueried = lastQueriedTextRef.current;
      const diffLength = Math.abs(currentDraft.length - lastQueried.length);

      if (lastQueried && diffLength < 10 && currentDraft.includes(lastQueried.slice(0, 20))) {
        return;
      }

      // Clear existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce ~600ms
      debounceTimerRef.current = setTimeout(() => {
        // Abort previous in-flight fetch request if user keeps typing
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        setLoading(true);

        fetch("/api/retrieval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: currentDraft,
            k: 3,
            mode: "live_suggestion",
          }),
          signal: controller.signal,
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((data) => {
            if (controller.signal.aborted) return;
            const items: RagResultItem[] = data.results ?? [];
            setResults(items.slice(0, 3));
            lastQueriedTextRef.current = currentDraft;
          })
          .catch((err) => {
            if (err.name === "AbortError") {
              // Expected cancellation on new typing, ignore
              return;
            }
            console.warn("Live RAG retrieval error:", err);
          })
          .finally(() => {
            if (!controller.signal.aborted) {
              setLoading(false);
            }
          });
      }, 600);
    }

    // Scope event listeners to the form element if available, otherwise fall back to document
    const target = formRef?.current ?? document;
    target.addEventListener("input", handleFormInputChange);
    target.addEventListener("change", handleFormInputChange);

    return () => {
      target.removeEventListener("input", handleFormInputChange);
      target.removeEventListener("change", handleFormInputChange);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [formRef]);

  // Hide panel if no results and not loading
  if (!loading && results.length === 0) {
    return null;
  }

  return (
    <>
      <div className="rounded-[1.75rem] border border-emerald-900/15 bg-emerald-950/5 p-4 shadow-[0_20px_50px_rgba(48,84,53,0.06)] backdrop-blur transition sm:rounded-[2rem] sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            <p className="text-xs uppercase tracking-[0.18em] font-medium text-emerald-900">
              Live RAG Suggestions
            </p>
          </div>
          {loading ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching memories…
            </span>
          ) : (
            <span className="text-xs text-stone-500">{results.length} related match{results.length === 1 ? "" : "es"}</span>
          )}
        </div>

        <p className="mt-1 text-xs leading-5 text-stone-600">
          Relevant notes & source insights connected to what you are typing right now.
        </p>

        {loading && results.length === 0 ? (
          <div className="mt-3 grid gap-2.5">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-emerald-900/10 bg-white/70 p-3">
                <div className="h-3.5 w-24 rounded bg-emerald-200/60" />
                <div className="mt-2 h-4 w-3/4 rounded bg-stone-200/70" />
                <div className="mt-1.5 h-3 w-full rounded bg-stone-200/50" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3.5 grid gap-2.5">
            {results.map((item, idx) => {
              const kind = getDocumentKindInfo(item.document_key);
              const title = getItemTitle(item);
              const snippet = getItemSnippet(item);
              const dateStr = getItemDate(item);
              const relativeTime = formatRelativeTime(dateStr);

              return (
                <div
                  key={`${item.document_key ?? idx}-${idx}`}
                  onClick={() => setSelectedItem(item)}
                  className="group relative cursor-pointer rounded-2xl border border-emerald-950/10 bg-white/85 p-3.5 transition duration-150 hover:border-emerald-700/30 hover:bg-white hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] font-semibold ${kind.badgeStyle}`}
                    >
                      {kind.label}
                    </span>
                    <span className="text-[11px] text-stone-500">{relativeTime}</span>
                  </div>

                  <h4 className="mt-2 font-medium text-sm text-stone-900 line-clamp-1 group-hover:text-emerald-900">
                    {title}
                  </h4>

                  <p className="mt-1 text-xs leading-5 text-stone-600 line-clamp-2">
                    {snippet}
                  </p>

                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-800 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>Read memory</span>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Detail View */}
      {selectedItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-emerald-950/15 bg-white p-6 shadow-2xl transition"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em] font-semibold ${
                    getDocumentKindInfo(selectedItem.document_key).badgeStyle
                  }`}
                >
                  {getDocumentKindInfo(selectedItem.document_key).label}
                </span>
                <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-stone-900">
                  {getItemTitle(selectedItem)}
                </h3>
                <p className="text-xs text-stone-500 mt-1">
                  {formatRelativeTime(getItemDate(selectedItem))}
                  {getItemDate(selectedItem) ? ` (${getItemDate(selectedItem)})` : ""}
                </p>
              </div>

              <button
                onClick={() => setSelectedItem(null)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                aria-label="Close modal"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-2xl border border-stone-100 bg-stone-50/60 p-4 text-sm text-stone-800 leading-6 whitespace-pre-wrap">
              {selectedItem.chunk_text}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              {selectedItem.document_key?.startsWith("thought:") ? (
                <a
                  href={`/dashboard?edit=${selectedItem.source_entity_id}`}
                  className="rounded-full bg-emerald-950 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-white hover:bg-emerald-800"
                >
                  Edit thought
                </a>
              ) : null}
              <button
                onClick={() => setSelectedItem(null)}
                className="rounded-full border border-stone-200 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-stone-700 hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default LiveRagContext;
