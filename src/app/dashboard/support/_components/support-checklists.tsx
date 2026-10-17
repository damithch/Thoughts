"use client";

import { useState, useTransition } from "react";

import { updateSupportDayAction } from "@/app/dashboard/support/actions";

const BASICS = [
  { key: "ate", label: "I've eaten", nudge: "Something small to eat can change how the next hour feels." },
  { key: "slept", label: "I slept okay", nudge: "Running on little sleep makes everything heavier. Be gentle with yourself today." },
  { key: "connected", label: "I've talked to someone today", nudge: "A short message to someone you trust counts." },
] as const;

type BasicsKey = (typeof BASICS)[number]["key"];

function Pill({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`rounded-full border px-4 py-2 text-sm transition ${checked ? "border-emerald-800 bg-emerald-800 text-emerald-50" : "border-emerald-950/15 bg-white/70 text-emerald-950 hover:bg-white"}`}
    >
      {checked ? "✓ " : ""}
      {label}
    </button>
  );
}

export function BasicsCheck({ initial }: { initial: Record<BasicsKey, boolean | null> }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(key: BasicsKey) {
    const next = !values[key];
    setValues((current) => ({ ...current, [key]: next }));
    startTransition(async () => {
      const result = await updateSupportDayAction({ [key]: next });
      if (!result.ok) {
        setError(result.error);
        setValues((current) => ({ ...current, [key]: !next }));
      }
    });
  }

  const missing = BASICS.filter((item) => !values[item.key]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {BASICS.map((item) => (
          <Pill key={item.key} checked={Boolean(values[item.key])} label={item.label} onToggle={() => toggle(item.key)} />
        ))}
      </div>
      {missing[0] ? <p className="text-sm leading-6 text-stone-700">{missing[0].nudge}</p> : null}
      {error ? <p className="text-sm text-rose-800">{error}</p> : null}
    </div>
  );
}

export function StepsList({ steps, initialTried }: { steps: string[]; initialTried: string[] }) {
  const [tried, setTried] = useState(initialTried);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(step: string) {
    const next = tried.includes(step) ? tried.filter((item) => item !== step) : [...tried, step];
    const previous = tried;
    setTried(next);
    startTransition(async () => {
      const result = await updateSupportDayAction({ stepsTried: next });
      if (!result.ok) {
        setError(result.error);
        setTried(previous);
      }
    });
  }

  if (steps.length === 0) {
    return <p className="text-sm text-stone-700">Add the steps that help you in your plan below.</p>;
  }

  return (
    <div className="grid gap-2">
      {steps.map((step) => {
        const done = tried.includes(step);

        return (
          <button
            key={step}
            type="button"
            role="checkbox"
            aria-checked={done}
            onClick={() => toggle(step)}
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-6 transition ${done ? "border-emerald-800/30 bg-emerald-50 text-emerald-950" : "border-emerald-950/10 bg-white/70 text-stone-800 hover:bg-white"}`}
          >
            <span aria-hidden="true" className="mt-0.5 text-base">{done ? "✓" : "○"}</span>
            <span>{step}</span>
          </button>
        );
      })}
      <p className="text-xs text-stone-500">Tick the ones you&apos;ve tried. One is enough to start.</p>
      {error ? <p className="text-sm text-rose-800">{error}</p> : null}
    </div>
  );
}
