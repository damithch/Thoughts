"use client";

import React, { useState } from "react";

export function BackupRestore() {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  function handleExport() {
    window.location.href = "/api/backup";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage(null);

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ text: data.message || "Import completed!", type: "success" });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setMessage({ text: data.error || "Import failed.", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err?.message || "Failed to read backup file.", type: "error" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white/80 p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900/80">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-700 dark:text-stone-300">
        Data Portability & Backup
      </h3>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        Export a full JSON backup of your thoughts, tasks, and routines or restore data from a previous backup file.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-purple-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export JSON Backup
        </button>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-stone-300 bg-stone-100 px-4 py-2 text-xs font-medium text-stone-800 transition hover:bg-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {importing ? "Importing..." : "Restore JSON Backup"}
          <input type="file" accept=".json" onChange={handleFileChange} className="hidden" disabled={importing} />
        </label>
      </div>

      {message && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
