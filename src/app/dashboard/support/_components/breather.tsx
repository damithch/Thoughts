"use client";

import { useEffect, useRef, useState } from "react";

import { logBreathingAction } from "@/app/dashboard/support/actions";
import {
  BREATHING_MINUTES,
  BREATHING_PATTERNS,
  cyclesFor,
  RESTING_SCALE,
  type BreathingPattern,
} from "@/lib/breathing";

type Run = { pattern: BreathingPattern; cycles: number; startedAt: number };

// A circle that grows as you breathe in and shrinks as you breathe out. A minute or more ticks
// off today's breathing task.
export function Breather() {
  const [patternId, setPatternId] = useState<BreathingPattern["id"]>("calm");
  const [minutes, setMinutes] = useState(2);
  const [run, setRun] = useState<Run | null>(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [phaseEndsAt, setPhaseEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<string | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pattern = BREATHING_PATTERNS.find((item) => item.id === patternId) ?? BREATHING_PATTERNS[0];
  const phase = run ? run.pattern.phases[phaseIndex] : null;

  // Tick for the countdown text.
  useEffect(() => {
    if (!run) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [run]);

  // Move to the next phase when this one ends; finish after the last cycle.
  useEffect(() => {
    if (!run || !phase) return;

    phaseTimer.current = setTimeout(() => {
      const nextIndex = (phaseIndex + 1) % run.pattern.phases.length;
      const nextCycle = nextIndex === 0 ? cycle + 1 : cycle;

      if (nextCycle >= run.cycles) {
        finish(run, true);
        return;
      }

      setPhaseIndex(nextIndex);
      setCycle(nextCycle);
      setPhaseEndsAt(Date.now() + run.pattern.phases[nextIndex].seconds * 1000);
    }, Math.max(0, phaseEndsAt - Date.now()));

    return () => {
      if (phaseTimer.current) clearTimeout(phaseTimer.current);
    };
  }, [run, phase, phaseIndex, cycle, phaseEndsAt]);

  function start() {
    const startedAt = Date.now();
    setResult(null);
    setPhaseIndex(0);
    setCycle(0);
    setPhaseEndsAt(startedAt + pattern.phases[0].seconds * 1000);
    setNow(startedAt);
    setRun({ pattern, cycles: cyclesFor(pattern, minutes), startedAt });
  }

  async function finish(current: Run, completed: boolean) {
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    const seconds = Math.round((Date.now() - current.startedAt) / 1000);
    setRun(null);

    if (seconds < 20) {
      setResult("Stopped. Come back whenever you need it.");
      return;
    }

    const minutesDone = Math.max(1, Math.round(seconds / 60));
    const logged = await logBreathingAction(seconds);
    const lead = completed ? `Well done: about ${minutesDone} minute${minutesDone === 1 ? "" : "s"} of slow breathing.` : `${seconds} seconds of slow breathing.`;

    setResult(
      logged.ok && logged.completedTask ? `${lead} Marked “${logged.completedTask}” as done.` : lead,
    );
  }

  const secondsLeft = phase ? Math.max(1, Math.ceil((phaseEndsAt - now) / 1000)) : 0;
  const totalSeconds = run ? run.cycles * run.pattern.phases.reduce((total, item) => total + item.seconds, 0) : 0;
  const elapsed = run ? Math.min(totalSeconds, (now - run.startedAt) / 1000) : 0;
  const scale = phase ? phase.scale : RESTING_SCALE;

  return (
    <div className="grid gap-5">
      <div className="relative mx-auto flex h-64 w-64 items-center justify-center" aria-live="polite">
        <div
          className="absolute inset-0 rounded-full bg-emerald-200/60"
          style={{
            transform: `scale(${scale})`,
            transition: phase ? `transform ${phase.seconds}s ease-in-out` : "transform 0.6s ease-out",
          }}
        />
        <div
          className="absolute inset-6 rounded-full bg-emerald-700/80"
          style={{
            transform: `scale(${scale})`,
            transition: phase ? `transform ${phase.seconds}s ease-in-out` : "transform 0.6s ease-out",
          }}
        />
        <div className="relative text-center text-emerald-50">
          <p className="font-[family:var(--font-display)] text-2xl">{phase ? phase.label : "Ready"}</p>
          <p className="mt-1 text-sm opacity-80">{phase ? secondsLeft : `${minutes} min`}</p>
        </div>
      </div>

      {run ? (
        <div className="grid gap-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-emerald-950/10">
            <div className="h-full bg-emerald-600 transition-all" style={{ width: `${(elapsed / totalSeconds) * 100}%` }} />
          </div>
          <button
            type="button"
            onClick={() => finish(run, false)}
            className="rounded-full border border-emerald-950/15 px-5 py-3 text-sm text-emerald-950 transition hover:bg-white"
          >
            Stop
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Pattern">
            {BREATHING_PATTERNS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === patternId}
                onClick={() => setPatternId(item.id)}
                className={`rounded-full border px-4 py-2 text-sm transition ${item.id === patternId ? "border-emerald-950 bg-emerald-950 text-emerald-50" : "border-emerald-950/15 text-emerald-950 hover:bg-white"}`}
              >
                {item.name} · <span className="opacity-75">{item.description}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-center gap-2" role="radiogroup" aria-label="Length">
            {BREATHING_MINUTES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={value === minutes}
                onClick={() => setMinutes(value)}
                className={`rounded-full border px-4 py-2 text-sm transition ${value === minutes ? "border-emerald-950 bg-emerald-950 text-emerald-50" : "border-emerald-950/15 text-emerald-950 hover:bg-white"}`}
              >
                {value} min
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={start}
            className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800"
          >
            Start
          </button>
          {result ? <p className="text-center text-sm text-emerald-900">{result}</p> : null}
        </div>
      )}
    </div>
  );
}
