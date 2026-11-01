"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  addAttentionIdeaAction,
  createAttentionSessionAction,
  deleteAttentionIdeaAction,
  deleteAttentionSessionAction,
  reflectOnAttentionSessionAction,
  saveAttentionStepsAction,
  setAttentionReminderAction,
  updateAttentionSessionAction,
} from "@/app/dashboard/attention/actions";
import { ANCHOR_PROMPTS, ATTENTION_COPY, MEDITATION_STEP_COPY } from "@/lib/attention/copy";
import {
  ATTENTION_ANCHORS,
  describeFocusChange,
  type AttentionAnchor,
  type AttentionStats,
} from "@/lib/attention/rules";
import type { AttentionSession, AttentionTaskIdea } from "@/lib/db/types";
import { formatColomboDateLabel } from "@/lib/time";

type Session = Omit<AttentionSession, "started_at" | "created_at" | "updated_at"> & {
  started_at: string;
  created_at: string;
  updated_at: string;
};

type Steps = { observe: number; belly: number; body: number };

type Props = {
  today: string;
  sessions: Session[];
  week: AttentionStats;
  month: AttentionStats;
  ideas: AttentionTaskIdea[];
  steps: Steps;
  reminderTime: string | null;
  morningTime: string;
};

type Tab = "log" | "history" | "progress" | "settings";

const card =
  "rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:p-6";
const eyebrow = "text-xs uppercase tracking-[0.18em] text-emerald-800/70";
const primaryButton =
  "rounded-full bg-emerald-950 px-5 py-3 text-sm text-emerald-50 transition-colors hover:bg-emerald-800 disabled:opacity-60";
const secondaryButton =
  "rounded-full border border-emerald-950/15 px-5 py-3 text-sm text-emerald-950 transition-colors hover:bg-white disabled:opacity-60";
const input =
  "w-full rounded-2xl border border-emerald-950/10 bg-emerald-50/50 px-4 py-3 text-sm text-stone-900 outline-none focus:border-emerald-700";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" });
}

function formatStepLength(seconds: number) {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function typeLabel(type: Session["session_type"]) {
  return type === "meditation" ? "Meditation" : "Mundane task";
}

export function AttentionClient(props: Props) {
  const [tab, setTab] = useState<Tab>("log");

  return (
    <section className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-1 rounded-full border border-emerald-950/10 bg-white/60 p-1 text-sm" role="tablist">
        {(["log", "history", "progress", "settings"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-full px-2 py-2.5 capitalize transition-colors ${
              tab === value ? "bg-emerald-950 text-emerald-50" : "text-emerald-950 hover:bg-white"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {tab === "log" ? <LogPanel {...props} /> : null}
      {tab === "history" ? <HistoryPanel sessions={props.sessions} /> : null}
      {tab === "progress" ? <ProgressPanel week={props.week} month={props.month} today={props.today} /> : null}
      {tab === "settings" ? <SettingsPanel {...props} /> : null}
    </section>
  );
}

// --- Shared fields ---

function FocusRange({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  const self = value ?? 50;

  return (
    <div className="flex flex-col gap-2">
      <p className={eyebrow}>{label}</p>
      <div className="flex justify-between text-xs text-stone-600">
        <span>Me / my thoughts</span>
        <span>The task</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={self}
        aria-label={`${label} (percent of attention on yourself and your thoughts)`}
        aria-valuetext={value === null ? "Not rated yet" : `${self}% on me, ${100 - self}% on the task`}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={() => value === null && onChange(self)}
        className={`w-full accent-emerald-800 ${value === null ? "opacity-40" : ""}`}
      />
      <div className="flex items-center justify-between text-sm">
        {value === null ? (
          <span className="text-stone-500">Drag to rate</span>
        ) : (
          <span>
            <strong>{self}%</strong> {ATTENTION_COPY.selfLabel} · <strong>{100 - self}%</strong> {ATTENTION_COPY.taskLabel}
          </span>
        )}
        {value !== null ? (
          <button type="button" onClick={() => onChange(null)} className="text-emerald-700 underline-offset-2 hover:underline">
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AnchorChips({ value, onChange }: { value: AttentionAnchor[]; onChange: (value: AttentionAnchor[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={eyebrow}>{ATTENTION_COPY.anchorsTitle}</legend>
      <p className="text-sm text-stone-600">{ATTENTION_COPY.anchorsHint}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ATTENTION_ANCHORS.map((anchor) => {
          const selected = value.includes(anchor);

          return (
            <label
              key={anchor}
              className={`cursor-pointer rounded-2xl border px-4 py-3 transition-colors ${
                selected ? "border-emerald-950 bg-emerald-950 text-emerald-50" : "border-emerald-950/10 bg-white hover:bg-emerald-50"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={selected}
                onChange={() => onChange(selected ? value.filter((item) => item !== anchor) : [...value, anchor])}
              />
              <span className="block font-medium">
                {selected ? "✓ " : ""}
                {ANCHOR_PROMPTS[anchor].label}
              </span>
              <span className={`block text-xs ${selected ? "text-emerald-200" : "text-stone-500"}`}>{ANCHOR_PROMPTS[anchor].prompt}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function MinutesInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex flex-col gap-2">
      <span className={eyebrow}>Minutes</span>
      <input
        type="number"
        min={1}
        max={120}
        value={value}
        onChange={(event) => onChange(Math.min(120, Math.max(1, Math.round(Number(event.target.value) || 1))))}
        className={`${input} max-w-[10rem]`}
      />
    </label>
  );
}

// A soft bell made with the Web Audio API (no sound file needed). Browsers only allow sound that
// started from a tap, so one shared context is created (or resumed) when "Begin" is pressed and
// reused for the chimes between steps.
let chimeContext: AudioContext | null = null;

function unlockChime() {
  try {
    if (!chimeContext) {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      chimeContext = new AudioCtx();
    }
    if (chimeContext.state === "suspended") chimeContext.resume().catch(() => {});
  } catch {
    chimeContext = null;
  }
}

function playChime() {
  const context = chimeContext;
  if (!context) return;
  try {
    for (const [frequency, gain] of [
      [528, 0.18],
      [792, 0.08],
    ] as const) {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(gain, context.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 2);
      oscillator.connect(volume).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 2);
    }
  } catch {
    // No audio available: the on-screen step change still shows.
  }
}

// --- Log ---

function LogPanel({ ideas, steps }: Props) {
  const [kind, setKind] = useState<Session["session_type"]>("mundane_task");
  const [taskName, setTaskName] = useState("");
  const [before, setBefore] = useState<number | null>(null);
  const [after, setAfter] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(5);
  const [anchors, setAnchors] = useState<AttentionAnchor[]>([]);
  const [comments, setComments] = useState("");
  const [completeTask, setCompleteTask] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ session: Session; completedTask: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setSaved(null);
    setTaskName("");
    setBefore(null);
    setAfter(null);
    setMinutes(5);
    setAnchors([]);
    setComments("");
    setError(null);
  }

  function save(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const result = await createAttentionSessionAction({ ...body, completeTask });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved({ session: JSON.parse(JSON.stringify(result.session)), completedTask: result.completedTask });
    });
  }

  if (saved) {
    const change = describeFocusChange(saved.session.task_focus_before, saved.session.task_focus_after);

    return (
      <div className={`${card} flex flex-col gap-4`}>
        <p className={eyebrow}>Saved</p>
        <h2 className="font-[family:var(--font-display)] text-3xl">{saved.session.task_name}</h2>
        <p className="text-stone-700">{ATTENTION_COPY.saved}</p>
        <p className="text-sm text-stone-600">
          {saved.session.duration_minutes} min{change ? ` · ${change}` : ""}
          {saved.completedTask ? ` · ticked off “${saved.completedTask}”` : ""}
        </p>
        <ReflectionForm session={saved.session} />
        <div>
          <button type="button" className={primaryButton} onClick={reset}>
            Log another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2" role="radiogroup" aria-label="Kind of practice">
        {(["mundane_task", "meditation"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => setKind(value)}
            className={`rounded-full border px-5 py-2.5 text-sm ${
              kind === value ? "border-emerald-950 bg-emerald-950 text-emerald-50" : "border-emerald-950/15 bg-white text-emerald-950"
            }`}
          >
            {typeLabel(value)}
          </button>
        ))}
      </div>

      {kind === "mundane_task" ? (
        <form
          className={`${card} flex flex-col gap-6`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!taskName.trim()) {
              setError("Pick or type the everyday task you practised with.");
              return;
            }
            save({
              sessionType: "mundane_task",
              taskName,
              durationMinutes: minutes,
              selfFocusBefore: before,
              selfFocusAfter: after,
              anchorsUsed: anchors,
              comments,
            });
          }}
        >
          <p className="text-sm leading-7 text-stone-700">{ATTENTION_COPY.mundaneIntro}</p>
          <div className="flex flex-col gap-2">
            <p className={eyebrow}>Everyday task</p>
            {ideas.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {ideas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() => setTaskName(idea.name)}
                    aria-pressed={taskName === idea.name}
                    className={`rounded-full border px-4 py-2 text-sm ${
                      taskName === idea.name ? "border-emerald-950 bg-emerald-950 text-emerald-50" : "border-emerald-950/10 bg-white"
                    }`}
                  >
                    {idea.name}
                  </button>
                ))}
              </div>
            ) : null}
            <input
              value={ideas.some((idea) => idea.name === taskName) ? "" : taskName}
              onChange={(event) => setTaskName(event.target.value)}
              placeholder={ideas.length > 0 ? "Or type a new one" : "e.g. Walking, brushing teeth, washing dishes"}
              maxLength={120}
              className={input}
            />
          </div>
          <FocusRange label={ATTENTION_COPY.beforeQuestion} value={before} onChange={setBefore} />
          <MinutesInput value={minutes} onChange={setMinutes} />
          <AnchorChips value={anchors} onChange={setAnchors} />
          <FocusRange label={ATTENTION_COPY.afterQuestion} value={after} onChange={setAfter} />
          <label className="flex flex-col gap-2">
            <span className={eyebrow}>{ATTENTION_COPY.commentsLabel}</span>
            <textarea
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder={ATTENTION_COPY.commentsPlaceholder}
              rows={4}
              maxLength={4000}
              className={input}
            />
          </label>
          <SaveRow completeTask={completeTask} setCompleteTask={setCompleteTask} pending={pending} error={error} label="Save session" />
        </form>
      ) : (
        <MeditationPanel
          steps={steps}
          pending={pending}
          error={error}
          completeTask={completeTask}
          setCompleteTask={setCompleteTask}
          onSave={(durationMinutes, extra) => save({ sessionType: "meditation", durationMinutes, ...extra })}
        />
      )}
    </div>
  );
}

function SaveRow({
  completeTask,
  setCompleteTask,
  pending,
  error,
  label,
}: {
  completeTask: boolean;
  setCompleteTask: (value: boolean) => void;
  pending: boolean;
  error: string | null;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-3 text-sm text-stone-700">
        <input type="checkbox" checked={completeTask} onChange={(event) => setCompleteTask(event.target.checked)} className="mt-1 accent-emerald-800" />
        <span>
          Tick off today&apos;s attention task
          <span className="block text-xs text-stone-500">Marks an open “Attention training” task done (meditation also counts for a breathing habit).</span>
        </span>
      </label>
      {error ? <p className="text-sm text-rose-800">{error}</p> : null}
      <div>
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : label}
        </button>
      </div>
    </div>
  );
}

type Run = { startedAt: number; stepIndex: number; stepEndsAt: number };

function MeditationPanel({
  steps,
  pending,
  error,
  completeTask,
  setCompleteTask,
  onSave,
}: {
  steps: Steps;
  pending: boolean;
  error: string | null;
  completeTask: boolean;
  setCompleteTask: (value: boolean) => void;
  onSave: (minutes: number, extra: Record<string, unknown>) => void;
}) {
  const plan = MEDITATION_STEP_COPY.map((step) => ({ ...step, seconds: steps[step.key] }));
  const total = plan.reduce((sum, step) => sum + step.seconds, 0);
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(0);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(5);
  const [comments, setComments] = useState("");
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const runRef = useRef<Run | null>(null);

  useEffect(() => {
    if (!run) return;
    const interval = setInterval(() => {
      const current = runRef.current;
      const time = Date.now();
      setNow(time);
      if (!current || time < current.stepEndsAt) return;

      playChime();
      const next = current.stepIndex + 1;
      if (next >= plan.length) {
        runRef.current = null;
        setRun(null);
        const seconds = Math.round((time - current.startedAt) / 1000);
        setMinutes(Math.min(120, Math.max(1, Math.round(seconds / 60))));
        setStoppedAt(seconds);
        return;
      }
      const updated = { ...current, stepIndex: next, stepEndsAt: time + plan[next].seconds * 1000 };
      runRef.current = updated;
      setRun(updated);
    }, 250);
    return () => clearInterval(interval);
    // The interval reads the live run from runRef; it only restarts when a run starts or ends.
  }, [run === null]); // eslint-disable-line react-hooks/exhaustive-deps

  function begin() {
    const time = Date.now();
    const current = { startedAt: time, stepIndex: 0, stepEndsAt: time + plan[0].seconds * 1000 };
    runRef.current = current;
    setRun(current);
    setNow(time);
    setStoppedAt(null);
    unlockChime();
    playChime();
  }

  function stop() {
    const current = runRef.current;
    if (!current) return;
    runRef.current = null;
    setRun(null);
    const seconds = Math.round((Date.now() - current.startedAt) / 1000);
    setMinutes(Math.min(120, Math.max(1, Math.round(seconds / 60))));
    setStoppedAt(seconds);
  }

  if (run) {
    const step = plan[run.stepIndex];
    const left = Math.max(0, Math.ceil((run.stepEndsAt - now) / 1000));
    const elapsed = Math.min(total, (now - run.startedAt) / 1000);

    return (
      <div className={`${card} flex flex-col items-center gap-5 text-center`} aria-live="polite">
        <p className={eyebrow}>
          Step {run.stepIndex + 1} of {plan.length}
        </p>
        <h2 className="font-[family:var(--font-display)] text-3xl">{step.title}</h2>
        <p className="text-5xl font-semibold text-emerald-800">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </p>
        <p className="max-w-md text-stone-600">{step.prompt}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-950/10">
          <div className="h-full bg-emerald-700" style={{ width: `${(elapsed / Math.max(total, 1)) * 100}%` }} />
        </div>
        <p className="text-sm text-stone-600">When you notice your mind has wandered, gently come back. That moment of noticing is the practice.</p>
        <button type="button" className={secondaryButton} onClick={stop}>
          Stop
        </button>
      </div>
    );
  }

  return (
    <form
      className={`${card} flex flex-col gap-5`}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(minutes, { comments, moodBefore, moodAfter });
      }}
    >
      <p className="text-sm leading-7 text-stone-700">{ATTENTION_COPY.meditationIntro}</p>
      <ol className="flex flex-col gap-3">
        {plan.map((step, index) => (
          <li key={step.key} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-900">
              {index + 1}
            </span>
            <span>
              <span className="block font-medium">
                {step.title} · {formatStepLength(step.seconds)}
              </span>
              <span className="block text-sm text-stone-600">{step.prompt}</span>
            </span>
          </li>
        ))}
      </ol>
      {stoppedAt !== null ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950" aria-live="polite">
          {stoppedAt >= total - 1 ? ATTENTION_COPY.meditationDone : ATTENTION_COPY.meditationEarly} The minutes below are
          filled in; add anything you noticed and save.
        </p>
      ) : null}
      <div>
        <button type="button" className={secondaryButton} onClick={begin}>
          {stoppedAt !== null ? "Start again" : `Begin guided meditation · ${formatStepLength(total)}`}
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <MinutesInput value={minutes} onChange={setMinutes} />
        <MoodSelect label="Mood before" value={moodBefore} onChange={setMoodBefore} />
        <MoodSelect label="Mood after" value={moodAfter} onChange={setMoodAfter} />
      </div>
      <label className="flex flex-col gap-2">
        <span className={eyebrow}>{ATTENTION_COPY.commentsLabel}</span>
        <textarea
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          placeholder="Where did your mind go? Could you come back to the breath?"
          rows={3}
          maxLength={4000}
          className={input}
        />
      </label>
      <SaveRow completeTask={completeTask} setCompleteTask={setCompleteTask} pending={pending} error={error} label="Save meditation" />
    </form>
  );
}

function MoodSelect({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label className="flex flex-col gap-2">
      <span className={eyebrow}>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} className={input}>
        <option value="">—</option>
        {Array.from({ length: 10 }, (_, index) => index + 1).map((mood) => (
          <option key={mood} value={mood}>
            {mood}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReflectionForm({ session }: { session: Session }) {
  const [mood, setMood] = useState<number | null>(session.mood_after ?? session.mood_before);
  const [text, setText] = useState(session.comments ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-950/10 bg-emerald-50/40 p-4">
      <p className={eyebrow}>Add reflection to journal</p>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <MoodSelect label="Mood" value={mood} onChange={setMood} />
        <label className="flex flex-col gap-2">
          <span className={eyebrow}>Reflection</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={4000} className={input} />
        </label>
      </div>
      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
      <div>
        <button
          type="button"
          disabled={pending}
          className={secondaryButton}
          onClick={() =>
            startTransition(async () => {
              const result = await reflectOnAttentionSessionAction(session.id, { mood, text });
              setMessage(result.ok ? `Saved to your journal, tagged #${ATTENTION_COPY.reflectionTag}.` : result.error);
            })
          }
        >
          {pending ? "Saving…" : "Save to journal"}
        </button>
      </div>
    </div>
  );
}

// --- History ---

function HistoryPanel({ sessions }: { sessions: Session[] }) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (sessions.length === 0) {
    return <p className={`${card} text-stone-700`}>{ATTENTION_COPY.emptyHistory}</p>;
  }

  const groups: { date: string; sessions: Session[] }[] = [];
  for (const session of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.date === session.entry_date) last.sessions.push(session);
    else groups.push({ date: session.entry_date, sessions: [session] });
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.date} className="flex flex-col gap-2">
          <p className={eyebrow}>{formatColomboDateLabel(group.date)}</p>
          {group.sessions.map((session) => {
            const change = describeFocusChange(session.task_focus_before, session.task_focus_after);
            const open = openId === session.id;

            return (
              <div key={session.id} className="rounded-2xl border border-emerald-950/10 bg-white/80">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : session.id)}
                  aria-expanded={open}
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left"
                >
                  <span className="flex justify-between text-xs text-stone-500">
                    <span>
                      {formatTime(session.started_at)} · {typeLabel(session.session_type)}
                    </span>
                    <span>{session.duration_minutes} min</span>
                  </span>
                  <span className="text-base">{session.task_name}</span>
                  {change ? <span className="text-sm text-emerald-900">{change}</span> : null}
                  {session.comments && !open ? <span className="line-clamp-1 text-sm text-stone-500">{session.comments}</span> : null}
                </button>
                {open ? <SessionEditor session={session} onClose={() => setOpenId(null)} /> : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SessionEditor({ session, onClose }: { session: Session; onClose: () => void }) {
  const isMundane = session.session_type === "mundane_task";
  const [taskName, setTaskName] = useState(session.task_name);
  const [minutes, setMinutes] = useState(session.duration_minutes);
  const [before, setBefore] = useState(session.self_focus_before);
  const [after, setAfter] = useState(session.self_focus_after);
  const [anchors, setAnchors] = useState<AttentionAnchor[]>(session.anchors_used ?? []);
  const [moodBefore, setMoodBefore] = useState(session.mood_before);
  const [moodAfter, setMoodAfter] = useState(session.mood_after);
  const [comments, setComments] = useState(session.comments ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateAttentionSessionAction(session.id, {
        taskName,
        durationMinutes: minutes,
        moodBefore,
        moodAfter,
        comments,
        ...(isMundane ? { selfFocusBefore: before, selfFocusAfter: after, anchorsUsed: anchors } : {}),
      });
      setMessage(result.ok ? "Changes saved." : result.error);
    });
  }

  function remove() {
    if (!window.confirm(`Delete this session?\n\n${session.task_name}`)) return;
    startTransition(async () => {
      const result = await deleteAttentionSessionAction(session.id);
      if (result.ok) onClose();
      else setMessage(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-5 border-t border-emerald-950/10 px-4 py-4">
      {isMundane ? (
        <label className="flex flex-col gap-2">
          <span className={eyebrow}>Everyday task</span>
          <input value={taskName} onChange={(event) => setTaskName(event.target.value)} maxLength={120} className={input} />
        </label>
      ) : null}
      <MinutesInput value={minutes} onChange={setMinutes} />
      {isMundane ? (
        <>
          <FocusRange label={ATTENTION_COPY.beforeQuestion} value={before} onChange={setBefore} />
          <AnchorChips value={anchors} onChange={setAnchors} />
          <FocusRange label={ATTENTION_COPY.afterQuestion} value={after} onChange={setAfter} />
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <MoodSelect label="Mood before" value={moodBefore} onChange={setMoodBefore} />
          <MoodSelect label="Mood after" value={moodAfter} onChange={setMoodAfter} />
        </div>
      )}
      <label className="flex flex-col gap-2">
        <span className={eyebrow}>{ATTENTION_COPY.commentsLabel}</span>
        <textarea value={comments} onChange={(event) => setComments(event.target.value)} rows={3} maxLength={4000} className={input} />
      </label>
      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending} onClick={save} className={primaryButton}>
          Save changes
        </button>
        <button type="button" disabled={pending} onClick={remove} className="rounded-full border border-rose-900/20 px-5 py-3 text-sm text-rose-900 hover:bg-rose-50">
          Delete
        </button>
      </div>
      <ReflectionForm session={session} />
    </div>
  );
}

// --- Progress ---

function ProgressPanel({ week, month, today }: { week: AttentionStats; month: AttentionStats; today: string }) {
  const change = month.avgTaskFocusChange;

  return (
    <div className="flex flex-col gap-5">
      <div className={card}>
        <p className={eyebrow}>Last 7 days</p>
        <div className="mt-4 grid grid-cols-7 gap-2 text-center">
          {week.days.map((day) => {
            const [year, monthNumber, dayNumber] = day.date.split("-").map(Number);
            const letter = new Date(Date.UTC(year, monthNumber - 1, dayNumber)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

            return (
              <div
                key={day.date}
                className="flex flex-col items-center gap-2"
                aria-label={`${day.date}: ${day.mundane} task sessions, ${day.meditation} meditations`}
              >
                <span className={`text-xs ${day.date === today ? "font-bold text-emerald-950" : "text-stone-500"}`}>{letter}</span>
                <span className={`h-3.5 w-3.5 rounded-full border-2 ${day.mundane ? "border-emerald-700 bg-emerald-700" : "border-emerald-950/15"}`} />
                <span className={`h-3.5 w-3.5 rounded-full border-2 ${day.meditation ? "border-cyan-700 bg-cyan-700" : "border-emerald-950/15"}`} />
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-5 text-xs text-stone-600">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-700" /> Task focusing
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-cyan-700" /> Meditation
          </span>
        </div>
        <p className="mt-3 text-sm text-stone-600">{ATTENTION_COPY.targetHint}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Streak" value={String(week.streak)} hint={week.streak === 1 ? "day" : "days in a row"} />
        <Tile label="Minutes" value={String(week.totalMinutes)} hint="last 7 days" />
        <Tile label="Both kinds" value={`${week.daysWithBoth}/7`} hint="days with task + meditation" />
        <Tile label="Task focus" value={change === null ? "—" : `${change > 0 ? "+" : ""}${change}`} hint="avg change, 30 days" />
      </div>

      <div className={card}>
        <p className={eyebrow}>Last 30 days</p>
        <h2 className="mt-2 font-[family:var(--font-display)] text-2xl">Attention on the task</h2>
        <TrendChart trend={month.trend} />
      </div>

      <ReportDownload today={today} />
    </div>
  );
}

function shiftDay(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// A PDF of attention training and worry postponement for a date range, to share with a therapist.
function ReportDownload({ today }: { today: string }) {
  const [from, setFrom] = useState(shiftDay(today, -6));
  const [to, setTo] = useState(today);
  const [attention, setAttention] = useState(true);
  const [worry, setWorry] = useState(true);
  const sections = [attention ? "attention" : null, worry ? "worry" : null].filter(Boolean).join(",");
  const spanDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const problem =
    !from || !to
      ? "Pick both dates."
      : from > to
        ? "The start date must be on or before the end date."
        : spanDays > 92
          ? "A report can cover at most 92 days."
          : !sections
            ? "Pick at least one section."
            : null;
  const href = `/api/reports/therapy?from=${from}&to=${to}&sections=${sections}`;

  return (
    <div className={`${card} flex flex-col gap-4`}>
      <div>
        <p className={eyebrow}>Share with your therapist</p>
        <h2 className="mt-2 font-[family:var(--font-display)] text-2xl">Homework report (PDF)</h2>
        <p className="mt-2 text-sm text-stone-600">
          Attention training and worry postponement for the days you pick: totals, a focus chart, every session and your notes.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {[7, 14, 30].map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => {
              setFrom(shiftDay(today, -(days - 1)));
              setTo(today);
            }}
            className="rounded-full border border-emerald-950/15 px-4 py-2 text-emerald-950 hover:bg-white"
          >
            Last {days} days
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={eyebrow}>From</span>
          <input type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-2">
          <span className={eyebrow}>To</span>
          <input type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} className={input} />
        </label>
      </div>
      <div className="flex flex-wrap gap-5 text-sm text-stone-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={attention} onChange={(event) => setAttention(event.target.checked)} className="accent-emerald-800" />
          Attention training
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={worry} onChange={(event) => setWorry(event.target.checked)} className="accent-emerald-800" />
          Worry postponement
        </label>
      </div>
      {problem ? <p className="text-sm text-rose-800">{problem}</p> : null}
      <div className="flex flex-wrap gap-3">
        {problem ? (
          <span className={`${primaryButton} cursor-not-allowed opacity-60`}>Download PDF</span>
        ) : (
          <a href={href} className={primaryButton}>
            Download PDF
          </a>
        )}
        {problem ? null : (
          <a href={`${href}&format=json`} className={secondaryButton}>
            Download as JSON
          </a>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-emerald-950/10 bg-white/70 p-4">
      <p className={eyebrow}>{label}</p>
      <p className="mt-2 font-[family:var(--font-display)] text-3xl">{value}</p>
      <p className="text-xs text-stone-500">{hint}</p>
    </div>
  );
}

function TrendChart({ trend }: { trend: AttentionStats["trend"] }) {
  if (trend.length === 0) {
    return <p className="mt-3 text-sm text-stone-600">{ATTENTION_COPY.emptyTrend}</p>;
  }

  const width = 600;
  const height = 200;
  const pad = { left: 40, right: 12, top: 12, bottom: 16 };
  const x = (index: number) =>
    pad.left + (trend.length === 1 ? (width - pad.left - pad.right) / 2 : (index / (trend.length - 1)) * (width - pad.left - pad.right));
  const y = (value: number) => pad.top + (1 - value / 100) * (height - pad.top - pad.bottom);
  const line = (key: "before" | "after") => trend.map((point, index) => `${x(index)},${y(point[key])}`).join(" ");

  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Task focus before and after each session">
        {[0, 50, 100].map((value) => (
          <g key={value}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="rgba(2,44,34,0.10)" />
            <text x={pad.left - 8} y={y(value) + 4} fontSize={11} textAnchor="end" fill="#a8a29e">
              {value}%
            </text>
          </g>
        ))}
        <polyline points={line("before")} fill="none" stroke="#a8a29e" strokeWidth={2} strokeDasharray="5 5" />
        <polyline points={line("after")} fill="none" stroke="#047857" strokeWidth={2.5} />
        {trend.map((point, index) => (
          <g key={index}>
            <circle cx={x(index)} cy={y(point.before)} r={3.5} fill="#a8a29e">
              <title>{`${point.date} · ${point.taskName}: ${point.before}% before`}</title>
            </circle>
            <circle cx={x(index)} cy={y(point.after)} r={4} fill="#047857">
              <title>{`${point.date} · ${point.taskName}: ${point.after}% after`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex gap-5 text-xs text-stone-600">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-stone-400" /> Before
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-emerald-700" /> After (% on the task)
        </span>
      </figcaption>
    </figure>
  );
}

// --- Settings ---

function SettingsPanel({ ideas, steps, reminderTime, morningTime }: Props) {
  const [time, setTime] = useState(reminderTime ?? morningTime ?? "07:00");
  const [stepValues, setStepValues] = useState(steps);
  const [newIdea, setNewIdea] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? done : result.error ?? "That couldn't be saved. Try again.");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={`${card} flex flex-col gap-4`}>
        <p className={eyebrow}>Daily reminder</p>
        <p className="text-sm text-stone-700">
          A good time is right after waking, alongside your morning breathing. This adds a daily “Attention training” task, and the phone app
          reminds you at this time.
        </p>
        <p className="text-sm text-stone-600">Currently: {reminderTime ? reminderTime : "no reminder"}</p>
        <div className="flex flex-wrap items-end gap-3">
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={`${input} max-w-[10rem]`} aria-label="Reminder time" />
          <button type="button" disabled={pending} className={primaryButton} onClick={() => run(() => setAttentionReminderAction(time), "Reminder saved.")}>
            Save reminder
          </button>
          {reminderTime ? (
            <button
              type="button"
              disabled={pending}
              className={secondaryButton}
              onClick={() => run(() => setAttentionReminderAction(null), "Reminder turned off. The daily task stays.")}
            >
              Turn off
            </button>
          ) : null}
        </div>
      </div>

      <div className={`${card} flex flex-col gap-4`}>
        <p className={eyebrow}>Meditation steps (seconds)</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {MEDITATION_STEP_COPY.map((step) => (
            <label key={step.key} className="flex flex-col gap-2 text-sm">
              <span>{step.title}</span>
              <input
                type="number"
                min={15}
                max={600}
                step={15}
                value={stepValues[step.key]}
                onChange={(event) => setStepValues({ ...stepValues, [step.key]: Math.round(Number(event.target.value) || 0) })}
                className={input}
              />
            </label>
          ))}
        </div>
        <p className="text-sm text-stone-600">The worksheet suggests building up to ten minutes, twice a day. Start where it feels manageable.</p>
        <div>
          <button type="button" disabled={pending} className={primaryButton} onClick={() => run(() => saveAttentionStepsAction(stepValues), "Meditation steps saved.")}>
            Save steps
          </button>
        </div>
      </div>

      <div className={`${card} flex flex-col gap-4`}>
        <p className={eyebrow}>Your everyday tasks</p>
        {ideas.length === 0 ? <p className="text-sm text-stone-600">No saved tasks yet. They&apos;re also added when you log a session.</p> : null}
        <ul className="flex flex-col divide-y divide-emerald-950/10">
          {ideas.map((idea) => (
            <li key={idea.id} className="flex items-center justify-between py-2">
              <span>{idea.name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteAttentionIdeaAction(idea.id), "Removed. Past sessions keep their name.")}
                className="text-sm text-stone-500 hover:text-rose-800"
                aria-label={`Remove ${idea.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newIdea.trim()) return;
            run(async () => {
              const result = await addAttentionIdeaAction(newIdea);
              if (result.ok) setNewIdea("");
              return result;
            }, "Added.");
          }}
        >
          <input value={newIdea} onChange={(event) => setNewIdea(event.target.value)} placeholder="e.g. Making tea" maxLength={120} className={input} />
          <button type="submit" disabled={pending || !newIdea.trim()} className={primaryButton}>
            Add
          </button>
        </form>
      </div>

      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
    </div>
  );
}
