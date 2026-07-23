"use client";
import React, { useState } from "react";

export function RagSearch() {
  const [query, setQuery] = useState("");
  const [retrieved, setRetrieved] = useState<any[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runRetrieval() {
    setError(null);
    setAnswer(null);
    setRetrieved([]);
    if (!query.trim()) return setError("Please enter a query.");

    setLoading(true);
    try {
      const r = await fetch("/api/retrieval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, k: 6 }),
      });

      if (!r.ok) throw new Error(`Retrieval failed: ${r.status}`);
      const j = await r.json();
      setRetrieved(j.results ?? []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function runGenerate() {
    setError(null);
    setAnswer(null);
    if (!query.trim()) return setError("Please enter a query.");

    setLoading(true);
    try {
      const r = await fetch("/api/rag/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, k: 6 }),
      });

      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Generate failed: ${r.status} ${txt}`);
      }

      const j = await r.json();
      setAnswer(j.answer ?? JSON.stringify(j));
      setRetrieved(j.provenance ?? j.provenance ?? []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-4 shadow-[0_20px_50px_rgba(48,84,53,0.10)]">
      <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Search your journal</p>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-lg border px-3 py-2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. What have I written about feeling anxious?"
        />
        <button className="rounded-lg bg-emerald-900 px-3 py-2 text-white" onClick={runRetrieval} disabled={loading}>Retrieve</button>
        <button className="rounded-lg bg-emerald-600 px-3 py-2 text-white" onClick={runGenerate} disabled={loading}>Generate</button>
      </div>

      {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="mt-3 text-sm text-stone-600">Loading…</div> : null}

      {answer ? (
        <div className="mt-4 rounded-lg border bg-white/80 p-3">
          <h3 className="text-sm font-semibold">Generated answer</h3>
          <p className="mt-2 text-sm whitespace-pre-wrap">{answer}</p>
        </div>
      ) : null}

      {retrieved && retrieved.length > 0 ? (
        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-semibold">Retrieved excerpts</h4>
          {retrieved.map((r, i) => (
            <div key={`${r.document_key ?? i}-${i}`} className="rounded-md border p-3">
              <div className="text-xs text-stone-600">Source: {r.document_key ?? r.source_entity_id} — distance: {Number(r.distance ?? 0).toFixed(3)}</div>
              <div className="mt-1 text-sm text-stone-800">{r.chunk_text}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default RagSearch;
