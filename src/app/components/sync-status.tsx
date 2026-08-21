"use client";

import { useState } from "react";

type SyncResult = {
  synced: boolean;
  count: number;
  embedded: number;
  skipped: number;
  forced: boolean;
  document_kinds: string[];
  processed_documents: number;
  ingested_chunks: number;
};

export default function SyncStatus() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  async function runSync(force: boolean) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const url = force ? "/api/rag/documents?force=1" : "/api/rag/documents";
      const res = await fetch(url, { method: "POST" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(body.error ?? `Sync failed (${res.status})`);
        return;
      }

      const data: SyncResult = await res.json();
      setResult(data);
      setLastSyncAt(new Date().toLocaleString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.08)] sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-lg">
          📊
        </span>
        <div>
          <h2 className="text-base font-semibold text-emerald-950 sm:text-lg">
            RAG Sync & Usage
          </h2>
          <p className="text-xs text-stone-500">
            Sync status, embedding counts, and force re-index
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => runSync(false)}
          disabled={loading}
          className="rounded-full border border-emerald-950/15 bg-emerald-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Syncing…" : "Sync RAG Index"}
        </button>
        <button
          type="button"
          onClick={() => runSync(true)}
          disabled={loading}
          className="rounded-full border border-amber-900/15 bg-amber-800 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Syncing…" : "⚠ Force Re-Embed All"}
        </button>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-stone-600">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
          Running sync — this may take a while for large datasets…
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-900/10 bg-rose-50/80 p-3 text-sm text-rose-900">
          ❌ {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-950/10 bg-emerald-50/60 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-800/70">
              Total documents
            </p>
            <p className="mt-1 font-[family:var(--font-display)] text-2xl leading-none text-stone-900">
              {result.count}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-950/10 bg-emerald-50/60 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-800/70">
              Embedded (changed)
            </p>
            <p className="mt-1 font-[family:var(--font-display)] text-2xl leading-none text-stone-900">
              {result.embedded}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-950/10 bg-emerald-50/60 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-800/70">
              Skipped (unchanged)
            </p>
            <p className="mt-1 font-[family:var(--font-display)] text-2xl leading-none text-stone-900">
              {result.skipped}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-950/10 bg-emerald-50/60 p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-800/70">
              Ingested chunks
            </p>
            <p className="mt-1 font-[family:var(--font-display)] text-2xl leading-none text-stone-900">
              {result.ingested_chunks}
            </p>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
          <span>
            Mode: {result.forced ? "🔴 Force re-embed" : "🟢 Smart (hash-based)"}
          </span>
          <span>•</span>
          <span>Kinds: {result.document_kinds.join(", ")}</span>
          {lastSyncAt ? (
            <>
              <span>•</span>
              <span>Completed: {lastSyncAt}</span>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
