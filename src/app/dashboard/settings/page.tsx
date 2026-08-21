import Link from "next/link";
import { redirect } from "next/navigation";

import { updateUserSettingsAction, logoutAction } from "@/app/actions";
import { Toast } from "@/app/components/toast";
import RangeSlider from "@/app/components/range-slider";
import SyncStatus from "@/app/components/sync-status";
import { getCurrentUser } from "@/lib/auth";
import { getUserSettings, DEFAULT_USER_SETTINGS } from "@/lib/db/settings";
import type { RagDocumentKind } from "@/lib/db/types";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const settings = await getUserSettings(currentUser.id);
  const params = await searchParams;
  const toastMessage =
    typeof params?.toast === "string" ? params.toast : null;

  const ALL_RAG_KINDS: { value: RagDocumentKind; label: string }[] = [
    { value: "thought", label: "Thoughts" },
    { value: "book_idea", label: "Book Ideas" },
    { value: "conversation_summary", label: "Conversation Summaries" },
    { value: "ba_entry", label: "BA Worksheet Entries" },
    { value: "day_note", label: "Day Notes" },
    { value: "daily_rollup", label: "Daily Rollups" },
  ];

  const LLM_MODELS = [
    { value: "gemini-flash-latest", label: "Gemini Flash (Latest)" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef0f8_0%,#dbe0ee_52%,#c6cfe0_100%)] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      {toastMessage ? <Toast message={toastMessage} tone={typeof params?.type === "string" ? params.type as "error" | "success" | "info" : undefined} /> : null}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 sm:gap-8">

        {/* Header */}
        <header className="rounded-[2rem] border border-indigo-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(48,53,84,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-indigo-800/70 sm:text-sm sm:tracking-[0.28em]">
                Settings
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-3xl leading-none sm:text-4xl md:text-5xl">
                System Configuration
              </h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Control RAG retrieval, AI Agent, Smart Capture, and Live Context behaviors.
              </p>
            </div>

            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
              <Link
                href="/dashboard"
                className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                ← Dashboard
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-full border border-red-950/10 px-4 py-3 text-center text-red-950 transition-colors hover:bg-red-50"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </header>

        <form action={updateUserSettingsAction}>

          {/* 1. RAG Retrieval Settings */}
          <section className="mb-6 rounded-[1.75rem] border border-indigo-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,53,84,0.08)] sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-lg">🔍</span>
              <div>
                <h2 className="text-base font-semibold text-indigo-950 sm:text-lg">RAG Retrieval</h2>
                <p className="text-xs text-stone-500">Vector search and knowledge retrieval tuning</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <RangeSlider
                id="rag_default_k"
                name="rag_default_k"
                min={1}
                max={50}
                defaultValue={settings.rag_default_k}
                label="Default Top K Results"
                description="Final context chunks clamped for injection (1–50)"
              />
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="rag_k_thought">
                  Thought Vector Pool
                </label>
                <input
                  id="rag_k_thought"
                  name="rag_k_thought"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={settings.rag_k_thought}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Candidate thoughts to retrieve (1–50)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="rag_k_summary">
                  Summary Vector Pool
                </label>
                <input
                  id="rag_k_summary"
                  name="rag_k_summary"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={settings.rag_k_summary}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Candidate summaries to retrieve (1–50)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="rag_chunk_size">
                  Chunk Size (chars)
                </label>
                <input
                  id="rag_chunk_size"
                  name="rag_chunk_size"
                  type="number"
                  min={500}
                  max={3000}
                  step={100}
                  defaultValue={settings.rag_chunk_size}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Max chars per embedding chunk (500–3000)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="rag_chunk_overlap">
                  Chunk Overlap (chars)
                </label>
                <input
                  id="rag_chunk_overlap"
                  name="rag_chunk_overlap"
                  type="number"
                  min={0}
                  max={500}
                  step={50}
                  defaultValue={settings.rag_chunk_overlap}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Overlap between consecutive chunks (0–500)</p>
              </div>
            </div>

            {/* Enabled document kinds */}
            <div className="mt-5">
              <p className="text-xs font-medium text-stone-700 mb-2">Enabled Document Types</p>
              <div className="flex flex-wrap gap-3">
                {ALL_RAG_KINDS.map((kind) => (
                  <label
                    key={kind.value}
                    className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm cursor-pointer transition hover:bg-indigo-50 hover:border-indigo-300"
                  >
                    <input
                      type="checkbox"
                      name="rag_enabled_kinds"
                      value={kind.value}
                      defaultChecked={settings.rag_enabled_kinds.includes(kind.value)}
                      className="h-4 w-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-stone-700">{kind.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Custom RAG prompt */}
            <div className="mt-5">
              <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="rag_custom_prompt">
                Custom RAG System Prompt (appended to default)
              </label>
              <textarea
                id="rag_custom_prompt"
                name="rag_custom_prompt"
                rows={3}
                defaultValue={settings.rag_custom_prompt}
                placeholder="e.g. Always prioritize recent entries. Format answers as bullet points."
                className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-stone-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </section>

          {/* 2. AI Agent Settings */}
          <section className="mb-6 rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,84,0.08)] sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-100 text-lg">🤖</span>
              <div>
                <h2 className="text-base font-semibold text-cyan-950 sm:text-lg">AI Agent</h2>
                <p className="text-xs text-stone-500">Task agent prompt behavior and model tuning</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="agent_temperature">
                  Temperature
                </label>
                <input
                  id="agent_temperature"
                  name="agent_temperature"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  defaultValue={settings.agent_temperature}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Lower = more deterministic (0.0–1.0)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="agent_max_tokens">
                  Max Output Tokens
                </label>
                <input
                  id="agent_max_tokens"
                  name="agent_max_tokens"
                  type="number"
                  min={256}
                  max={4096}
                  step={128}
                  defaultValue={settings.agent_max_tokens}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Max response length (256–4096)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="agent_default_tag">
                  Default Task Tag
                </label>
                <input
                  id="agent_default_tag"
                  name="agent_default_tag"
                  type="text"
                  defaultValue={settings.agent_default_tag}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Tag applied to agent-created tasks</p>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="agent_custom_prompt">
                Custom Agent System Prompt (prepended to default)
              </label>
              <textarea
                id="agent_custom_prompt"
                name="agent_custom_prompt"
                rows={3}
                defaultValue={settings.agent_custom_prompt}
                placeholder="e.g. Always confirm before deleting tasks. Be concise in summaries."
                className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-stone-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
              />
            </div>
          </section>

          {/* 3. Smart Capture Settings */}
          <section className="mb-6 rounded-[1.75rem] border border-purple-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(88,48,120,0.08)] sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-lg">✨</span>
              <div>
                <h2 className="text-base font-semibold text-purple-950 sm:text-lg">Smart Capture</h2>
                <p className="text-xs text-stone-500">AI-powered journal entry parsing parameters</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="smart_capture_temperature">
                  Temperature
                </label>
                <input
                  id="smart_capture_temperature"
                  name="smart_capture_temperature"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  defaultValue={settings.smart_capture_temperature}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Creativity in field extraction (0.0–1.0)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="smart_capture_max_tokens">
                  Max Output Tokens
                </label>
                <input
                  id="smart_capture_max_tokens"
                  name="smart_capture_max_tokens"
                  type="number"
                  min={512}
                  max={4096}
                  step={128}
                  defaultValue={settings.smart_capture_max_tokens}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Max response length for parsing (512–4096)</p>
              </div>
            </div>
          </section>

          {/* 4. Live Context Panel */}
          <section className="mb-6 rounded-[1.75rem] border border-teal-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,74,0.08)] sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-lg">💡</span>
              <div>
                <h2 className="text-base font-semibold text-teal-950 sm:text-lg">Live Context Panel</h2>
                <p className="text-xs text-stone-500">Real-time RAG suggestions while composing thoughts</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="live_context_enabled"
                  defaultChecked={settings.live_context_enabled}
                  className="h-5 w-5 rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-stone-700">Enable live context suggestions</span>
              </label>
              <p className="mt-1 ml-8 text-[11px] text-stone-400">Fires RAG queries as you type a thought card</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="live_context_debounce_ms">
                  Debounce (ms)
                </label>
                <input
                  id="live_context_debounce_ms"
                  name="live_context_debounce_ms"
                  type="number"
                  min={200}
                  max={2000}
                  step={100}
                  defaultValue={settings.live_context_debounce_ms}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Wait before query (200–2000ms)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="live_context_min_length">
                  Min Draft Length
                </label>
                <input
                  id="live_context_min_length"
                  name="live_context_min_length"
                  type="number"
                  min={10}
                  max={100}
                  defaultValue={settings.live_context_min_length}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Chars before first query (10–100)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="live_context_k">
                  Suggestions Count
                </label>
                <input
                  id="live_context_k"
                  name="live_context_k"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={settings.live_context_k}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                />
                <p className="mt-1 text-[11px] text-stone-400">Live results to show (1–10)</p>
              </div>
            </div>
          </section>

          {/* 5. Model Selection */}
          <section className="mb-6 rounded-[1.75rem] border border-amber-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(84,68,48,0.08)] sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-lg">⚡</span>
              <div>
                <h2 className="text-base font-semibold text-amber-950 sm:text-lg">Model Selection</h2>
                <p className="text-xs text-stone-500">Choose which Gemini model powers all AI features</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1" htmlFor="llm_model">
                  LLM Model
                </label>
                <select
                  id="llm_model"
                  name="llm_model"
                  defaultValue={settings.llm_model}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                >
                  {LLM_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-stone-400">Used for Agent, Smart Capture, and RAG Generate</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Embedding Model
                </label>
                <input
                  type="text"
                  value={process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001"}
                  readOnly
                  className="w-full rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-500 cursor-not-allowed"
                />
                <p className="mt-1 text-[11px] text-stone-400">Configured via environment variable (read-only)</p>
              </div>
            </div>
          </section>

          {/* Sync History & Usage Widget */}
          <div className="mb-6">
            <SyncStatus />
          </div>

          {/* Defaults Reference & Save */}
          <section className="rounded-[1.75rem] border border-stone-900/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,48,48,0.06)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-stone-500">
                  Changes take effect immediately for all AI features. Defaults are restored if a field is cleared.
                </p>
              </div>
              <button
                type="submit"
                className="shrink-0 rounded-full bg-indigo-900 px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
              >
                Save Settings
              </button>
            </div>
          </section>

        </form>
      </div>
    </main>
  );
}
