"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { isValidTaskDate } from "@/lib/tasks/validation";

type ActionLog = { tool: string; details: string; status: "success" | "warning" | "info" };
type AgentResponse = { summaryMessage?: string; actionLogs?: ActionLog[]; error?: string };

const presets = [
  { action: "auto_plan", label: "Plan this day", hint: "Bring overdue tasks here and add routines" },
  { action: "roll_forward", label: "Bring overdue here", hint: "Move every overdue one-off task to this day" },
  { action: "apply_routines", label: "Add routines", hint: "Create this day's routine tasks" },
] as const;

// The task agent, available on every Tasks view. Natural-language requests go to the LLM;
// presets are deterministic. The page re-renders after each run.
export function TaskCommandBar({ today }: { today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [isPending, startTransition] = useTransition();

  // The Today view can show any date; the other views act on today.
  const requestedDate = searchParams.get("date");
  const date =
    pathname === "/dashboard/tasks" && requestedDate && isValidTaskDate(requestedDate) ? requestedDate : today;

  function run(body: { action?: string; prompt?: string }) {
    setResult(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/agent/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, date }),
        });
        const data = (await response.json().catch(() => ({}))) as AgentResponse;

        if (!response.ok) {
          setResult({ error: data.error ?? "The agent could not run that request." });
          return;
        }

        setResult(data);
        if (body.prompt) {
          setPrompt("");
        }
        router.refresh();
      } catch {
        setResult({ error: "The agent could not be reached." });
      }
    });
  }

  return (
    <section
      aria-label="Task agent"
      className="rounded-[1.5rem] border border-cyan-950/10 bg-white/75 p-4 shadow-sm backdrop-blur sm:p-5"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (prompt.trim()) {
            run({ prompt: prompt.trim() });
          }
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="task-agent-prompt" className="sr-only">
          Ask the task agent
        </label>
        <input
          id="task-agent-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={`Ask the agent, e.g. "add call the bank next Friday, high priority"`}
          className="min-w-0 flex-1 rounded-full border border-cyan-950/15 bg-white px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-700/40"
        />
        <button
          type="submit"
          disabled={isPending || !prompt.trim()}
          className="rounded-full bg-cyan-950 px-5 py-2.5 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-900 disabled:opacity-50"
        >
          {isPending ? "Working…" : "Run"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-500">For {date === today ? "today" : date}:</span>
        {presets.map((preset) => (
          <button
            key={preset.action}
            type="button"
            title={preset.hint}
            disabled={isPending}
            onClick={() => run({ action: preset.action })}
            className="rounded-full border border-cyan-950/15 bg-white px-3 py-1.5 text-cyan-950 transition hover:bg-cyan-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-cyan-700/40"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {result ? (
        <div role="status" className="mt-3 rounded-2xl border border-stone-900/10 bg-stone-50 p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className={result.error ? "text-rose-800" : "text-stone-800"}>
              {result.error ?? result.summaryMessage ?? "Done."}
            </p>
            <button
              type="button"
              onClick={() => setResult(null)}
              aria-label="Dismiss agent result"
              className="text-xs text-stone-500"
            >
              ✕
            </button>
          </div>
          {result.actionLogs && result.actionLogs.length > 0 ? (
            <ul className="mt-2 grid gap-1 text-xs">
              {result.actionLogs.map((log, index) => (
                <li
                  key={`${log.tool}-${index}`}
                  className={log.status === "warning" ? "text-amber-800" : "text-stone-600"}
                >
                  {log.details}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
