"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ── Types mirroring the API response ────────────────────────

type EvidenceItem = {
  id: number;
  module_id: number;
  side: "for" | "against";
  content: string;
  sort_order: number;
  created_at: string;
};

type ExperimentDay = {
  id: number;
  module_id: number;
  entry_date: string;
  what_happened: string;
  thinking_time_notes: string;
  controllability: number;
  created_at: string;
  updated_at: string;
};

type PostponedItem = {
  id: number;
  module_id: number;
  entry_date: string;
  content: string;
  created_at: string;
};

type ModuleData = {
  id: number;
  user_id: number;
  belief_text: string;
  belief_before_pct: number | null;
  belief_after_pct: number | null;
  thinking_time_start: string;
  thinking_time_duration: number;
  thinking_time_place: string;
  prediction_text: string;
  prediction_confidence: number | null;
  reflection_text: string;
  status: "active" | "completed" | "abandoned";
  created_at: string;
  updated_at: string;
  evidence: EvidenceItem[];
  experiment_days: ExperimentDay[];
};

// ── Date helpers ────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function getWeekDates(centerDate: string): string[] {
  const d = new Date(centerDate + "T00:00:00");
  const dayOfWeek = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7)); // shift to Monday
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(toDateStr(dd));
  }
  return dates;
}

function formatShortDay(dateStr: string): { day: string; date: number; isToday: boolean } {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = toDateStr(new Date());
  return {
    day: days[d.getDay()],
    date: d.getDate(),
    isToday: dateStr === today,
  };
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

// ── Card wrapper ────────────────────────────────────────────

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-[family:var(--font-display)] text-2xl leading-none text-emerald-950 sm:text-3xl">
      {children}
    </h2>
  );
}

function SectionDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-sm leading-6 text-stone-600">{children}</p>
  );
}

// ── BeliefTracker ───────────────────────────────────────────

function BeliefTracker({
  module,
  onPatch,
}: {
  module: ModuleData;
  onPatch: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [beliefText, setBeliefText] = useState(module.belief_text);
  const [beforePct, setBeforePct] = useState(module.belief_before_pct ?? 50);
  const [afterPct, setAfterPct] = useState(module.belief_after_pct ?? 50);
  const isCompleted = module.status === "completed";

  const saveBeliefText = useCallback(() => {
    if (beliefText.trim() !== module.belief_text) {
      onPatch({ beliefText: beliefText.trim() });
    }
  }, [beliefText, module.belief_text, onPatch]);

  const saveBeforePct = useCallback(
    (value: number) => {
      setBeforePct(value);
      onPatch({ beliefBeforePct: value });
    },
    [onPatch],
  );

  const saveAfterPct = useCallback(
    (value: number) => {
      setAfterPct(value);
      onPatch({ beliefAfterPct: value });
    },
    [onPatch],
  );

  const diff =
    isCompleted && module.belief_before_pct !== null && module.belief_after_pct !== null
      ? module.belief_before_pct - module.belief_after_pct
      : null;

  return (
    <Card>
      <SectionTitle>Belief Tracker</SectionTitle>
      <SectionDescription>
        Write out the worry belief you want to test, then rate how strongly you
        believe it right now.
      </SectionDescription>

      <div className="mt-5">
        <label
          htmlFor="wp-belief-text"
          className="block text-xs font-medium uppercase tracking-wider text-emerald-800/70"
        >
          Worry / belief statement
        </label>
        <textarea
          id="wp-belief-text"
          value={beliefText}
          onChange={(e) => setBeliefText(e.target.value)}
          onBlur={saveBeliefText}
          rows={3}
          className="mt-2 w-full resize-none rounded-xl border border-emerald-950/10 bg-white/85 px-4 py-3 text-[1rem] leading-7 text-stone-900 outline-none transition focus:border-emerald-700"
          placeholder="e.g. If I don't worry about this, something bad will happen…"
        />
      </div>

      {/* Before slider */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="wp-belief-before"
            className="text-sm font-medium text-stone-700"
          >
            Belief strength (before)
          </label>
          <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-900">
            {beforePct}%
          </span>
        </div>
        <input
          id="wp-belief-before"
          type="range"
          min={0}
          max={100}
          step={1}
          value={beforePct}
          onChange={(e) => saveBeforePct(Number(e.target.value))}
          className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-200 accent-emerald-600 outline-none transition"
        />
        <div className="mt-1 flex justify-between text-[11px] text-stone-400">
          <span>0% — I don&apos;t believe it</span>
          <span>100% — Completely certain</span>
        </div>
      </div>

      {/* After slider — only when completed */}
      {isCompleted && (
        <div className="mt-5 rounded-xl border border-emerald-300/50 bg-emerald-50/50 p-4">
          <div className="flex items-center justify-between">
            <label
              htmlFor="wp-belief-after"
              className="text-sm font-medium text-stone-700"
            >
              Belief strength (after)
            </label>
            <span className="rounded-lg bg-emerald-200 px-2.5 py-1 text-sm font-semibold text-emerald-900">
              {afterPct}%
            </span>
          </div>
          <input
            id="wp-belief-after"
            type="range"
            min={0}
            max={100}
            step={1}
            value={afterPct}
            onChange={(e) => saveAfterPct(Number(e.target.value))}
            className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-200 accent-emerald-600 outline-none transition"
          />
          <div className="mt-1 flex justify-between text-[11px] text-stone-400">
            <span>0% — I don&apos;t believe it</span>
            <span>100% — Completely certain</span>
          </div>
        </div>
      )}

      {/* Takeaway line */}
      {diff !== null && (
        <p className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-700">
          {diff > 0
            ? `Your belief dropped ${diff} percentage point${diff === 1 ? "" : "s"}.`
            : diff < 0
              ? `Your belief increased by ${Math.abs(diff)} percentage point${Math.abs(diff) === 1 ? "" : "s"}.`
              : "Your belief stayed the same."}
        </p>
      )}
    </Card>
  );
}

// ── EvidenceTable ───────────────────────────────────────────

function EvidenceColumn({
  side,
  items,
  onAdd,
  onUpdate,
  onDelete,
}: {
  side: "for" | "against";
  items: EvidenceItem[];
  onAdd: (side: "for" | "against", content: string) => Promise<void>;
  onUpdate: (id: number, content: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!newText.trim() || isAdding) return;
    setIsAdding(true);
    await onAdd(side, newText.trim());
    setNewText("");
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  const startEdit = (item: EvidenceItem) => {
    setEditingId(item.id);
    setEditText(item.content);
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    if (editText.trim()) {
      await onUpdate(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText("");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === "Escape") {
      setEditingId(null);
      setEditText("");
    }
  };

  return (
    <div className="flex-1">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
        {side === "for" ? "Evidence For" : "Evidence Against"}
      </h3>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-emerald-50/60"
          >
            {editingId === item.id ? (
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleEditKeyDown}
                autoFocus
                className="w-full rounded-lg border border-emerald-600 bg-white px-2 py-1 text-sm text-stone-900 outline-none"
              />
            ) : (
              <>
                <span
                  className="flex-1 cursor-pointer text-sm leading-6 text-stone-800"
                  onClick={() => startEdit(item)}
                  title="Click to edit"
                >
                  {item.content}
                </span>
                <button
                  onClick={() => onDelete(item.id)}
                  className="mt-0.5 shrink-0 rounded p-1 text-stone-400 opacity-0 transition hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100"
                  aria-label="Delete evidence"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a point…"
          className="w-full rounded-lg border border-emerald-950/10 bg-white/85 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-emerald-700"
        />
        <button
          onClick={handleAdd}
          disabled={!newText.trim() || isAdding}
          className="shrink-0 rounded-lg bg-emerald-950 px-3 py-2 text-xs font-medium text-emerald-50 transition hover:bg-emerald-800 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function EvidenceTable({
  module,
  onRefresh,
}: {
  module: ModuleData;
  onRefresh: () => Promise<void>;
}) {
  const forItems = module.evidence.filter((e) => e.side === "for");
  const againstItems = module.evidence.filter((e) => e.side === "against");

  const handleAdd = async (side: "for" | "against", content: string) => {
    await fetch("/api/worry-postponement/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moduleId: module.id, side, content }),
    });
    await onRefresh();
  };

  const handleUpdate = async (id: number, content: string) => {
    await fetch("/api/worry-postponement/evidence", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, moduleId: module.id, content }),
    });
    await onRefresh();
  };

  const handleDelete = async (id: number) => {
    await fetch(
      `/api/worry-postponement/evidence?id=${id}&moduleId=${module.id}`,
      { method: "DELETE" },
    );
    await onRefresh();
  };

  return (
    <Card>
      <SectionTitle>Evidence Table</SectionTitle>
      <SectionDescription>
        Gather evidence for and against your worry belief. This helps you weigh
        the evidence objectively.
      </SectionDescription>

      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:gap-8">
        <EvidenceColumn
          side="for"
          items={forItems}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
        <div className="hidden w-px bg-emerald-950/10 sm:block" />
        <EvidenceColumn
          side="against"
          items={againstItems}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </div>
    </Card>
  );
}

// ── ThinkingTimeSettings ────────────────────────────────────

const DURATION_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
];

function ThinkingTimeSettings({
  module,
  onPatch,
}: {
  module: ModuleData;
  onPatch: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [startTime, setStartTime] = useState(module.thinking_time_start);
  const [duration, setDuration] = useState(module.thinking_time_duration);
  const [place, setPlace] = useState(module.thinking_time_place);

  return (
    <Card>
      <SectionTitle>Thinking Time</SectionTitle>
      <SectionDescription>
        Set a fixed daily slot where you&apos;ll allow yourself to think about your
        worry. Outside this window, practise postponing it.
      </SectionDescription>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {/* Start time */}
        <div>
          <label
            htmlFor="wp-tt-start"
            className="block text-xs font-medium uppercase tracking-wider text-emerald-800/70"
          >
            Start time
          </label>
          <input
            id="wp-tt-start"
            type="time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              onPatch({ thinkingTimeStart: e.target.value });
            }}
            className="mt-2 w-full rounded-xl border border-emerald-950/10 bg-white/85 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-700"
          />
        </div>

        {/* Duration */}
        <div>
          <label
            htmlFor="wp-tt-duration"
            className="block text-xs font-medium uppercase tracking-wider text-emerald-800/70"
          >
            Duration
          </label>
          <select
            id="wp-tt-duration"
            value={duration}
            onChange={(e) => {
              const val = Number(e.target.value);
              setDuration(val);
              onPatch({ thinkingTimeDuration: val });
            }}
            className="mt-2 w-full rounded-xl border border-emerald-950/10 bg-white/85 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-700"
          >
            {DURATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Place */}
        <div>
          <label
            htmlFor="wp-tt-place"
            className="block text-xs font-medium uppercase tracking-wider text-emerald-800/70"
          >
            Place
          </label>
          <input
            id="wp-tt-place"
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            onBlur={() => {
              if (place.trim() !== module.thinking_time_place) {
                onPatch({ thinkingTimePlace: place.trim() });
              }
            }}
            placeholder="e.g. Kitchen table, park bench…"
            className="mt-2 w-full rounded-xl border border-emerald-950/10 bg-white/85 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-emerald-700"
          />
        </div>
      </div>
    </Card>
  );
}

// ── ThinkingTimeCountdown ───────────────────────────────────

function ThinkingTimeCountdown({ thinkingTimeStart }: { thinkingTimeStart: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!thinkingTimeStart || !/^\d{2}:\d{2}$/.test(thinkingTimeStart)) {
    return null;
  }

  const [hours, minutes] = thinkingTimeStart.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-50/60 px-4 py-2.5">
        <span className="text-lg">✓</span>
        <span className="text-sm font-medium text-emerald-800">
          Thinking Time has passed for today
        </span>
      </div>
    );
  }

  const diffMinTotal = Math.ceil(diffMs / 60_000);
  const h = Math.floor(diffMinTotal / 60);
  const m = diffMinTotal % 60;

  const timeLabel = thinkingTimeStart
    ? new Date(`2000-01-01T${thinkingTimeStart}`).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-50/40 px-4 py-2.5">
      <span className="text-lg">⏱</span>
      <span className="text-sm font-medium text-amber-900">
        Thinking Time in {h > 0 ? `${h}h ` : ""}{m}m
        {timeLabel ? ` (at ${timeLabel})` : ""}
      </span>
    </div>
  );
}

// ── CalendarStrip ───────────────────────────────────────────

function CalendarStrip({
  selectedDate,
  onSelectDate,
  filledDates,
  worryCounts,
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  filledDates: Set<string>;
  worryCounts: Map<string, number>;
}) {
  const [weekCenter, setWeekCenter] = useState(selectedDate);
  const weekDates = useMemo(() => getWeekDates(weekCenter), [weekCenter]);
  const today = toDateStr(new Date());

  return (
    <div className="flex flex-col gap-3">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekCenter(addDays(weekCenter, -7))}
          className="rounded-lg border border-emerald-950/10 bg-white/70 px-2.5 py-1.5 text-sm text-stone-600 transition hover:bg-white"
          aria-label="Previous week"
        >
          ← Prev
        </button>

        <button
          onClick={() => {
            setWeekCenter(today);
            onSelectDate(today);
          }}
          className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-200"
        >
          Today
        </button>

        <button
          onClick={() => setWeekCenter(addDays(weekCenter, 7))}
          className="rounded-lg border border-emerald-950/10 bg-white/70 px-2.5 py-1.5 text-sm text-stone-600 transition hover:bg-white"
          aria-label="Next week"
        >
          Next →
        </button>
      </div>

      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekDates.map((dateStr) => {
          const info = formatShortDay(dateStr);
          const isFilled = filledDates.has(dateStr);
          const worryCount = worryCounts.get(dateStr) ?? 0;
          const isSelected = dateStr === selectedDate;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-center transition ${
                isSelected
                  ? "bg-emerald-950 text-emerald-50 shadow-lg"
                  : info.isToday
                    ? "border-2 border-emerald-400 bg-emerald-50 text-emerald-900"
                    : isFilled
                      ? "border border-emerald-300 bg-emerald-50/50 text-emerald-800"
                      : "border border-emerald-950/10 bg-white/70 text-stone-600 hover:bg-white"
              }`}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                {info.day}
              </span>
              <span className="text-base font-semibold leading-tight sm:text-lg">{info.date}</span>

              {/* Worry count badge */}
              {worryCount > 0 && (
                <span
                  className={`mt-0.5 rounded-full px-1.5 py-0 text-[10px] font-bold ${
                    isSelected
                      ? "bg-emerald-700 text-emerald-100"
                      : "bg-amber-200 text-amber-800"
                  }`}
                >
                  {worryCount}
                </span>
              )}

              {/* Filled checkmark */}
              {isFilled && !isSelected && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── PostponedItemsList ──────────────────────────────────────

function PostponedItemsList({
  moduleId,
  entryDate,
}: {
  moduleId: number;
  entryDate: string;
}) {
  const [items, setItems] = useState<PostponedItem[]>([]);
  const [newText, setNewText] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/worry-postponement/postponed-item?moduleId=${moduleId}&entryDate=${entryDate}`,
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setItems(data.items ?? []);
        }
      } catch {
        // silently ignore fetch errors
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [moduleId, entryDate]);

  const handleAdd = async () => {
    const content = newText.trim();
    if (!content || isAdding) return;
    setIsAdding(true);

    // Optimistic add with temp id
    const tempId = -Date.now();
    const optimistic: PostponedItem = {
      id: tempId,
      module_id: moduleId,
      entry_date: entryDate,
      content,
      created_at: new Date().toISOString(),
    };
    setItems((prev) => [...prev, optimistic]);
    setNewText("");

    try {
      const res = await fetch("/api/worry-postponement/postponed-item", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moduleId, entryDate, content }),
      });

      if (res.ok) {
        const data = await res.json();
        setItems((prev) =>
          prev.map((item) => (item.id === tempId ? data.item : item)),
        );
      } else {
        // Remove optimistic item on failure
        setItems((prev) => prev.filter((item) => item.id !== tempId));
      }
    } catch {
      setItems((prev) => prev.filter((item) => item.id !== tempId));
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (itemId: number) => {
    // Optimistic remove
    const removed = items.find((i) => i.id === itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));

    try {
      const res = await fetch(
        `/api/worry-postponement/postponed-item?itemId=${itemId}&moduleId=${moduleId}`,
        { method: "DELETE" },
      );

      if (!res.ok && removed) {
        // Restore on failure
        setItems((prev) => [...prev, removed]);
      }
    } catch {
      if (removed) {
        setItems((prev) => [...prev, removed]);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-amber-300/50 bg-amber-50/40 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-800/80">
        Postponed worries
      </h4>

      {items.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {items.map((item) => (
            <span
              key={item.id}
              className="group flex items-start gap-1.5 rounded-xl border border-amber-200 bg-white/80 px-2.5 py-1.5 text-xs text-stone-700 transition hover:border-amber-400 sm:items-center sm:rounded-full sm:px-3"
            >
              <span className="shrink-0 font-semibold text-amber-600">
                {formatTime(item.created_at)}
              </span>
              <span className="text-amber-300">•</span>
              <span className="flex-1">{item.content}</span>
              <button
                onClick={() => handleDelete(item.id)}
                className="ml-0.5 rounded-full p-0.5 text-stone-400 transition hover:bg-rose-100 hover:text-rose-600"
                aria-label="Remove item"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Jot down a worry…"
          className="w-full rounded-lg border border-amber-300/60 bg-white/85 px-3 py-1.5 text-sm text-stone-900 outline-none transition focus:border-amber-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newText.trim() || isAdding}
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── PostponementLog ─────────────────────────────────────────

type DayFormState = {
  entryDate: string;
  whatHappened: string;
  thinkingTimeNotes: string;
  controllability: number;
};

function emptyDayForm(dateStr?: string): DayFormState {
  return {
    entryDate: dateStr || toDateStr(new Date()),
    whatHappened: "",
    thinkingTimeNotes: "",
    controllability: 5,
  };
}

function PostponementLog({
  module,
  onRefresh,
}: {
  module: ModuleData;
  onRefresh: () => Promise<void>;
}) {
  const todayStr = toDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [predictionText, setPredictionText] = useState(module.prediction_text);
  const [confidence, setConfidence] = useState(module.prediction_confidence ?? 5);
  const [dayForm, setDayForm] = useState<DayFormState>(() => {
    const existing = module.experiment_days.find((d) => d.entry_date === todayStr);
    return existing
      ? {
          entryDate: existing.entry_date,
          whatHappened: existing.what_happened,
          thinkingTimeNotes: existing.thinking_time_notes,
          controllability: existing.controllability,
        }
      : emptyDayForm(todayStr);
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Build lookup structures for calendar
  const filledDates = useMemo(
    () => new Set(module.experiment_days.map((d) => d.entry_date)),
    [module.experiment_days],
  );

  // Worry counts per date — we'll count from postponed items loaded per-date
  // For efficiency, we derive this from experiment_days loaded with the module
  const [worryCounts, setWorryCounts] = useState<Map<string, number>>(new Map());

  // Load worry counts for visible week
  useEffect(() => {
    const weekDates = getWeekDates(selectedDate);
    const startDate = weekDates[0];
    const endDate = weekDates[6];

    async function loadCounts() {
      try {
        const res = await fetch(
          `/api/worry-postponement/postponed-item?moduleId=${module.id}&startDate=${startDate}&endDate=${endDate}`,
        );
        if (res.ok) {
          const data = await res.json();
          const map = new Map<string, number>();
          if (data.counts) {
            for (const item of data.counts) {
              map.set(item.entry_date, item.count);
            }
          }
          setWorryCounts(map);
        }
      } catch {
        // ignore
      }
    }

    loadCounts();
  }, [selectedDate, module.id]);

  const selectDate = useCallback(
    (date: string) => {
      setSelectedDate(date);
      setSaveMessage("");
      const existing = module.experiment_days.find((d) => d.entry_date === date);
      if (existing) {
        setDayForm({
          entryDate: existing.entry_date,
          whatHappened: existing.what_happened,
          thinkingTimeNotes: existing.thinking_time_notes,
          controllability: existing.controllability,
        });
      } else {
        setDayForm(emptyDayForm(date));
      }
    },
    [module.experiment_days],
  );

  const handlePatch = useCallback(
    async (fields: Record<string, unknown>) => {
      await fetch("/api/worry-postponement/module", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: module.id, ...fields }),
      });
    },
    [module.id],
  );

  const savePrediction = useCallback(() => {
    if (
      predictionText.trim() !== module.prediction_text ||
      confidence !== module.prediction_confidence
    ) {
      handlePatch({
        predictionText: predictionText.trim(),
        predictionConfidence: confidence,
      });
    }
  }, [predictionText, confidence, module.prediction_text, module.prediction_confidence, handlePatch]);

  const saveDay = async () => {
    if (!dayForm.entryDate) return;
    setIsSaving(true);
    setSaveMessage("");

    try {
      const res = await fetch("/api/worry-postponement/experiment-day", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          moduleId: module.id,
          entryDate: selectedDate,
          whatHappened: dayForm.whatHappened,
          thinkingTimeNotes: dayForm.thinkingTimeNotes,
          controllability: dayForm.controllability,
        }),
      });

      if (res.ok) {
        setSaveMessage("Day saved.");
        await onRefresh();
      } else {
        const data = await res.json();
        setSaveMessage(data.error || "Failed to save.");
      }
    } catch {
      setSaveMessage("Network error.");
    } finally {
      setIsSaving(false);
    }
  };

  // Format selected date for display
  const selectedDateObj = new Date(selectedDate + "T00:00:00");
  const dateLabel = selectedDateObj.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Card>
      <SectionTitle>Postponement Log</SectionTitle>
      <SectionDescription>
        First, write your prediction. Then log what actually happens each day.
      </SectionDescription>

      {/* Thinking Time Countdown */}
      {module.thinking_time_start && (
        <div className="mt-4">
          <ThinkingTimeCountdown thinkingTimeStart={module.thinking_time_start} />
        </div>
      )}

      {/* Prediction */}
      <div className="mt-5 rounded-xl border border-stone-200/80 bg-stone-50/60 p-4">
        <label
          htmlFor="wp-prediction"
          className="block text-xs font-medium uppercase tracking-wider text-emerald-800/70"
        >
          Your prediction
        </label>
        <textarea
          id="wp-prediction"
          value={predictionText}
          onChange={(e) => setPredictionText(e.target.value)}
          onBlur={savePrediction}
          rows={2}
          className="mt-2 w-full resize-none rounded-lg border border-emerald-950/10 bg-white/85 px-3 py-2 text-sm leading-6 text-stone-900 outline-none transition focus:border-emerald-700"
          placeholder="What do you predict will happen if you postpone your worry?"
        />

        <div className="mt-3 flex items-center justify-between">
          <label
            htmlFor="wp-pred-confidence"
            className="text-sm font-medium text-stone-700"
          >
            Confidence in prediction
          </label>
          <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-900">
            {confidence}/10
          </span>
        </div>
        <input
          id="wp-pred-confidence"
          type="range"
          min={0}
          max={10}
          step={1}
          value={confidence}
          onChange={(e) => {
            setConfidence(Number(e.target.value));
          }}
          onMouseUp={savePrediction}
          onTouchEnd={savePrediction}
          className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-200 accent-amber-500 outline-none transition"
        />
      </div>

      {/* Calendar Strip */}
      <div className="mt-5">
        <CalendarStrip
          selectedDate={selectedDate}
          onSelectDate={selectDate}
          filledDates={filledDates}
          worryCounts={worryCounts}
        />
      </div>

      {/* Day form */}
      <div className="mt-5 rounded-xl border border-emerald-950/8 bg-emerald-50/30 p-4">
        <h3 className="text-sm font-semibold text-emerald-900">
          {dateLabel}
        </h3>

        <div className="mt-3">
          <PostponedItemsList moduleId={module.id} entryDate={selectedDate} />
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="wp-day-happened"
              className="block text-xs font-medium uppercase tracking-wider text-emerald-800/70"
            >
              What happened?
            </label>
            <textarea
              id="wp-day-happened"
              value={dayForm.whatHappened}
              onChange={(e) =>
                setDayForm((prev) => ({ ...prev, whatHappened: e.target.value }))
              }
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-emerald-950/10 bg-white/85 px-3 py-2 text-sm leading-6 text-stone-900 outline-none transition focus:border-emerald-700"
              placeholder="What actually happened today?"
            />
          </div>

          <div>
            <label
              htmlFor="wp-day-thinking-time"
              className="block text-xs font-medium uppercase tracking-wider text-emerald-800/70"
            >
              What happened at thinking time?
            </label>
            <textarea
              id="wp-day-thinking-time"
              value={dayForm.thinkingTimeNotes}
              onChange={(e) =>
                setDayForm((prev) => ({
                  ...prev,
                  thinkingTimeNotes: e.target.value,
                }))
              }
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-emerald-950/10 bg-white/85 px-3 py-2 text-sm leading-6 text-stone-900 outline-none transition focus:border-emerald-700"
              placeholder="What came up during your thinking time?"
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label
              htmlFor="wp-day-control"
              className="text-sm font-medium text-stone-700"
            >
              Controllability
            </label>
            <span className="rounded-lg bg-indigo-100 px-2.5 py-1 text-sm font-semibold text-indigo-900">
              {dayForm.controllability}/10
            </span>
          </div>
          <input
            id="wp-day-control"
            type="range"
            min={0}
            max={10}
            step={1}
            value={dayForm.controllability}
            onChange={(e) =>
              setDayForm((prev) => ({
                ...prev,
                controllability: Number(e.target.value),
              }))
            }
            className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-200 accent-indigo-600 outline-none transition"
          />
          <div className="mt-1 flex justify-between text-[11px] text-stone-400">
            <span>0 — No control</span>
            <span>10 — Full control</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveDay}
            disabled={isSaving}
            className="rounded-full bg-emerald-950 px-5 py-2.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : filledDates.has(selectedDate) ? "Update Day" : "Save Day"}
          </button>
          {saveMessage && (
            <span className="text-sm text-stone-600">{saveMessage}</span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── ReflectionForm ──────────────────────────────────────────

function ReflectionForm({
  module,
  onPatch,
  onRefresh,
}: {
  module: ModuleData;
  onPatch: (fields: Record<string, unknown>) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [reflectionText, setReflectionText] = useState(module.reflection_text);
  const [message, setMessage] = useState("");
  const filledCount = module.experiment_days.length;
  const minDaysForCompletion = 7;
  const canComplete = filledCount >= minDaysForCompletion;
  const isCompleted = module.status === "completed";

  const saveReflection = useCallback(() => {
    if (reflectionText.trim() !== module.reflection_text) {
      onPatch({ reflectionText: reflectionText.trim() });
    }
  }, [reflectionText, module.reflection_text, onPatch]);

  const completeModule = async () => {
    setMessage("");
    await onPatch({ status: "completed" });
    await onRefresh();
    setMessage("Module marked complete. You can now set your after-belief score above.");
  };

  const abandonModule = async () => {
    setMessage("");
    await onPatch({ status: "abandoned" });
    await onRefresh();
    setMessage("Module abandoned.");
  };

  // Dynamic progress — proportional bar based on filledCount vs. minimum
  const progressPct = Math.min(100, (filledCount / minDaysForCompletion) * 100);

  return (
    <Card>
      <SectionTitle>Reflection</SectionTitle>
      <SectionDescription>
        Compare your prediction with what actually happened across your logged days.
      </SectionDescription>

      <div className="mt-5">
        <textarea
          id="wp-reflection"
          value={reflectionText}
          onChange={(e) => setReflectionText(e.target.value)}
          onBlur={saveReflection}
          rows={4}
          className="w-full resize-none rounded-xl border border-emerald-950/10 bg-white/85 px-4 py-3 text-[1rem] leading-7 text-stone-900 outline-none transition focus:border-emerald-700"
          placeholder="Looking back, what did you learn? How did reality compare to your prediction?"
        />
      </div>

      {/* Progress indicator */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="shrink-0 text-sm text-stone-500">
          {filledCount} day{filledCount !== 1 ? "s" : ""} logged
          {!canComplete ? ` — ${minDaysForCompletion - filledCount} more to unlock completion` : ""}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {canComplete && !isCompleted && (
          <button
            onClick={completeModule}
            className="rounded-full bg-emerald-950 px-6 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800"
          >
            ✓ Mark module complete
          </button>
        )}

        {!canComplete && !isCompleted && (
          <p className="text-sm text-stone-500">
            Log at least {minDaysForCompletion} days to unlock completion.
          </p>
        )}

        {isCompleted && (
          <p className="rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-medium text-emerald-900">
            ✓ Module complete — set your after-belief score in the Belief Tracker above.
          </p>
        )}

        {!isCompleted && (
          <button
            onClick={abandonModule}
            className="rounded-full border border-stone-300 px-4 py-2.5 text-sm text-stone-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
          >
            Abandon module
          </button>
        )}
      </div>

      {message && (
        <p className="mt-3 text-sm text-stone-600">{message}</p>
      )}
    </Card>
  );
}

// ── WorryPostponementModule (Parent) ────────────────────────

function StartModuleForm({
  onCreate,
}: {
  onCreate: (beliefText: string, beliefBeforePct: number) => Promise<void>;
}) {
  const [beliefText, setBeliefText] = useState("");
  const [pct, setPct] = useState(50);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const handleStart = async () => {
    if (!beliefText.trim()) {
      setError("Write a belief statement to get started.");
      return;
    }
    setIsCreating(true);
    setError("");
    try {
      await onCreate(beliefText.trim(), pct);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create module.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card className="mx-auto max-w-2xl text-center">
      <div className="mx-auto max-w-lg">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald-800/70">
          Getting started
        </p>
        <h2 className="mt-3 font-[family:var(--font-display)] text-3xl leading-tight sm:text-4xl">
          Begin a new module
        </h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Write the worry or belief you want to test through daily practice, then
          rate how strongly you believe it right now.
        </p>
      </div>

      <div className="mx-auto mt-6 max-w-lg text-left">
        <label
          htmlFor="wp-start-belief"
          className="block text-xs font-medium uppercase tracking-wider text-emerald-800/70"
        >
          Worry / belief statement
        </label>
        <textarea
          id="wp-start-belief"
          value={beliefText}
          onChange={(e) => setBeliefText(e.target.value)}
          rows={3}
          className="mt-2 w-full resize-none rounded-xl border border-emerald-950/10 bg-white/85 px-4 py-3 text-[1rem] leading-7 text-stone-900 outline-none transition focus:border-emerald-700"
          placeholder="e.g. If I don't worry about this, something bad will happen…"
        />

        <div className="mt-4 flex items-center justify-between">
          <label
            htmlFor="wp-start-pct"
            className="text-sm font-medium text-stone-700"
          >
            How strongly do you believe this?
          </label>
          <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-900">
            {pct}%
          </span>
        </div>
        <input
          id="wp-start-pct"
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-200 accent-emerald-600 outline-none transition"
        />
        <div className="mt-1 flex justify-between text-[11px] text-stone-400">
          <span>0% — I don&apos;t believe it</span>
          <span>100% — Completely certain</span>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-rose-600">{error}</p>
      )}

      <button
        onClick={handleStart}
        disabled={isCreating}
        className="mx-auto mt-6 block rounded-full bg-emerald-950 px-8 py-3.5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800 disabled:opacity-50"
      >
        {isCreating ? "Starting…" : "Start Module"}
      </button>
    </Card>
  );
}

export function WorryModuleClient() {
  const [module, setModule] = useState<ModuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchModule = useCallback(async () => {
    try {
      const res = await fetch("/api/worry-postponement/module");
      const data = await res.json();
      setModule(data.module ?? null);
    } catch {
      setError("Failed to load module.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const res = await fetch("/api/worry-postponement/module");
        const data = await res.json();
        if (isMounted) {
          setModule(data.module ?? null);
        }
      } catch {
        if (isMounted) {
          setError("Failed to load module.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreate = useCallback(
    async (beliefText: string, beliefBeforePct: number) => {
      const res = await fetch("/api/worry-postponement/module", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ beliefText, beliefBeforePct }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create module.");
      }

      await fetchModule();
    },
    [fetchModule],
  );

  const handlePatch = useCallback(
    async (fields: Record<string, unknown>) => {
      if (!module) return;

      const res = await fetch("/api/worry-postponement/module", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: module.id, ...fields }),
      });

      if (res.ok) {
        const data = await res.json();
        setModule(data.module);
      }
    },
    [module],
  );

  const handleRefresh = useCallback(async () => {
    await fetchModule();
  }, [fetchModule]);

  if (loading) {
    return (
      <Card className="py-12 text-center">
        <p className="text-sm text-stone-500">Loading module…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="py-12 text-center">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          onClick={() => {
            setError("");
            setLoading(true);
            fetchModule();
          }}
          className="mt-3 text-sm text-emerald-700 underline"
        >
          Try again
        </button>
      </Card>
    );
  }

  if (!module || module.status === "completed" || module.status === "abandoned") {
    // Show create form for new module, or if previous is done
    if (module && (module.status === "completed" || module.status === "abandoned")) {
      return (
        <div className="flex flex-col gap-6">
          {/* Summary of completed/abandoned module */}
          <Card>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  module.status === "completed"
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-stone-200 text-stone-600"
                }`}
              >
                {module.status === "completed" ? "Completed" : "Abandoned"}
              </span>
              <span className="text-sm text-stone-500">
                Previous module: &ldquo;{module.belief_text.slice(0, 80)}
                {module.belief_text.length > 80 ? "…" : ""}&rdquo;
              </span>
            </div>
            {module.status === "completed" &&
              module.belief_before_pct !== null &&
              module.belief_after_pct !== null && (
                <p className="mt-2 text-sm text-stone-600">
                  Belief: {module.belief_before_pct}% → {module.belief_after_pct}%
                  {" "}
                  ({module.belief_before_pct - module.belief_after_pct > 0
                    ? `dropped ${module.belief_before_pct - module.belief_after_pct} points`
                    : module.belief_before_pct - module.belief_after_pct < 0
                      ? `increased ${module.belief_after_pct - module.belief_before_pct} points`
                      : "unchanged"})
                </p>
              )}
          </Card>
          <StartModuleForm onCreate={handleCreate} />
        </div>
      );
    }

    return <StartModuleForm onCreate={handleCreate} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <BeliefTracker module={module} onPatch={handlePatch} />
      <EvidenceTable module={module} onRefresh={handleRefresh} />
      <ThinkingTimeSettings module={module} onPatch={handlePatch} />
      <PostponementLog module={module} onRefresh={handleRefresh} />
      <ReflectionForm module={module} onPatch={handlePatch} onRefresh={handleRefresh} />
    </div>
  );
}
