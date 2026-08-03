"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type SearchResultItem = {
  id: number | string;
  document_key: string;
  source_entity_id: string;
  chunk_text: string;
  metadata: Record<string, any>;
  distance?: number;
};

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  // Keyboard shortcut listener for Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/retrieval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim(), k: 8 }),
        });

        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error("Global search error:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback(
    (item: SearchResultItem) => {
      setIsOpen(false);
      const docKey = item.document_key || "";
      if (docKey.startsWith("thought:")) {
        router.push("/dashboard");
      } else if (docKey.startsWith("book_idea:")) {
        router.push("/dashboard/insights");
      } else if (docKey.startsWith("conversation_summary:")) {
        router.push("/dashboard/conversations");
      } else if (docKey.startsWith("daily_rollup:") || docKey.startsWith("day_note:")) {
        router.push("/dashboard/today");
      } else {
        router.push("/dashboard");
      }
    },
    [router],
  );

  const handleKeyDownModal = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/60 p-4 pt-20 backdrop-blur-sm transition-opacity"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-purple-900/20 bg-stone-900/95 p-4 shadow-2xl backdrop-blur-md text-stone-100 dark:bg-stone-900/95 dark:text-stone-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDownModal}
      >
        {/* Search input header */}
        <div className="flex items-center gap-3 border-b border-stone-800 pb-3">
          <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            className="w-full bg-transparent text-base text-stone-100 outline-none placeholder:text-stone-500"
            placeholder="Search thoughts, tasks, and insights (Ctrl+K)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <kbd className="hidden rounded bg-stone-800 px-2 py-0.5 text-xs text-stone-400 sm:inline-block">ESC</kbd>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-purple-300">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Searching knowledge base...
          </div>
        )}

        {/* No results */}
        {!loading && query.trim() !== "" && results.length === 0 && (
          <div className="py-8 text-center text-sm text-stone-400">
            No matching thoughts or records found for &quot;{query}&quot;.
          </div>
        )}

        {/* Initial helper text */}
        {!loading && query.trim() === "" && (
          <div className="py-6 text-center text-xs text-stone-500">
            Type to search across your thoughts, ideas, recurring routines, and conversation history.
          </div>
        )}

        {/* Results list */}
        {!loading && results.length > 0 && (
          <ul className="mt-3 max-h-96 overflow-y-auto space-y-1 pr-1">
            {results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const kind = item.document_key.split(":")[0]?.replace("_", " ") || "record";
              const date = item.metadata?.created_date || item.metadata?.source_date || item.metadata?.date || "";

              return (
                <li
                  key={`${item.document_key}-${idx}`}
                  className={`cursor-pointer rounded-xl p-3 transition flex flex-col gap-1 ${
                    isSelected
                      ? "bg-purple-950/70 border border-purple-500/40 text-white"
                      : "bg-stone-800/40 hover:bg-stone-800 text-stone-200"
                  }`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-purple-300 font-semibold">
                      {kind}
                    </span>
                    {date && <span className="text-[11px] text-stone-400">{date}</span>}
                  </div>
                  <p className="line-clamp-2 text-sm text-stone-200">
                    {item.chunk_text}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
