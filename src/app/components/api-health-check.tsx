"use client";

import React, { useState, useCallback } from "react";

type HealthStatus = {
  status: "ok" | "error";
  model: string;
  embeddingModel: string;
  apiKeyConfigured: boolean;
  errorType?: string;
  message: string;
  response?: string;
  latencyMs: number;
};

export default function ApiHealthCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HealthStatus | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setResult(null);

    try {
      const response = await fetch("/api/health");
      const data: HealthStatus = await response.json();
      setResult(data);
      setLastChecked(new Date());
    } catch (e: any) {
      setResult({
        status: "error",
        model: "unknown",
        embeddingModel: "unknown",
        apiKeyConfigured: false,
        message: `Connection failed: ${e?.message ?? e}`,
        latencyMs: 0,
      });
      setLastChecked(new Date());
    } finally {
      setChecking(false);
    }
  }, []);

  return (
    <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.08)] sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-lg">
          🔌
        </span>
        <div>
          <h2 className="text-base font-semibold text-emerald-950 sm:text-lg">
            API Connection
          </h2>
          <p className="text-xs text-stone-500">
            Verify that your Gemini API key works and the model is reachable
          </p>
        </div>
      </div>

      {/* Test button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={runCheck}
          disabled={checking}
          className="shrink-0 rounded-full bg-emerald-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {checking ? (
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Testing…
            </span>
          ) : (
            "Test Connection"
          )}
        </button>

        {lastChecked ? (
          <p className="text-xs text-stone-400">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
        ) : (
          <p className="text-xs text-stone-400">
            Click to test your API configuration
          </p>
        )}
      </div>

      {/* Results */}
      {result ? (
        <div className="mt-4 space-y-3">
          {/* Status badge */}
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                result.status === "ok"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  result.status === "ok" ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {result.status === "ok" ? "Connected" : "Error"}
            </span>
            {result.latencyMs > 0 ? (
              <span className="text-xs text-stone-500">
                {result.latencyMs.toLocaleString()}ms latency
              </span>
            ) : null}
          </div>

          {/* Details grid */}
          <div className="grid gap-2 rounded-xl border border-stone-200 bg-stone-50/70 p-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-xs font-medium text-stone-500">LLM Model</span>
              <p className="font-mono text-stone-800">{result.model}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-stone-500">Embedding Model</span>
              <p className="font-mono text-stone-800">{result.embeddingModel}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-stone-500">API Key</span>
              <p className={result.apiKeyConfigured ? "text-emerald-700" : "text-red-700"}>
                {result.apiKeyConfigured ? "✓ Configured" : "✗ Missing"}
              </p>
            </div>
            <div>
              <span className="text-xs font-medium text-stone-500">Status</span>
              <p className="text-stone-800">{result.message}</p>
            </div>
          </div>

          {/* Error details */}
          {result.status === "error" && result.errorType ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-medium text-red-800">
                Error type: <span className="font-mono">{result.errorType}</span>
              </p>
              <p className="mt-0.5 text-xs text-red-700">{result.message}</p>
            </div>
          ) : null}

          {/* Success response */}
          {result.status === "ok" && result.response ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-xs font-medium text-emerald-800">
                Model response: <span className="font-mono">{result.response}</span>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
