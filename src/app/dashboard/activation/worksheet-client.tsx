"use client";

import { useEffect, useState } from "react";

type EntryStatus = "pending" | "completed";

type ActivationEntry = {
  id: number | null;
  activity: string;
  entryDate: string;
  beforeDepression: string;
  beforePleasure: string;
  beforeAchievement: string;
  afterDepression: string;
  afterPleasure: string;
  afterAchievement: string;
  status: EntryStatus;
  isSaving: boolean;
  message: string;
};

function RatingColumnsHeader() {
  return (
    <div className="hidden md:grid md:grid-cols-[1.06fr_0.94fr] md:gap-6">
      <div />
      <div className="grid grid-cols-[80px_1fr_1fr_1fr] items-end gap-x-4 text-center">
        <span />
        <span className="font-[family:var(--font-display)] text-[1.8rem] font-semibold leading-none text-emerald-950">
          Depression
        </span>
        <span className="font-[family:var(--font-display)] text-[1.8rem] font-semibold leading-none text-emerald-950">
          Pleasure
        </span>
        <span className="font-[family:var(--font-display)] text-[1.8rem] font-semibold leading-none text-emerald-950">
          Achievement
        </span>
      </div>
    </div>
  );
}

const emptyEntry = (defaultDate: string): ActivationEntry => ({
  id: null,
  activity: "",
  entryDate: defaultDate,
  beforeDepression: "",
  beforePleasure: "",
  beforeAchievement: "",
  afterDepression: "",
  afterPleasure: "",
  afterAchievement: "",
  status: "pending",
  isSaving: false,
  message: "",
});

function withMinimumRows(entries: ActivationEntry[], defaultDate: string) {
  const nextEntries = [...entries];

  while (nextEntries.length < 4) {
    nextEntries.push(emptyEntry(defaultDate));
  }

  return nextEntries;
}

function normalizeScore(value: string) {
  if (!value.trim()) {
    return null;
  }

  const score = Number(value);

  if (!Number.isInteger(score) || score < 0 || score > 8) {
    return null;
  }

  return score;
}

function validateEntry(entry: ActivationEntry) {
  if (!entry.activity.trim()) {
    return "Add an activity before saving.";
  }

  if (!entry.entryDate.trim()) {
    return "Choose a date before saving.";
  }

  const beforeScores = [
    normalizeScore(entry.beforeDepression),
    normalizeScore(entry.beforePleasure),
    normalizeScore(entry.beforeAchievement),
  ];
  const afterScores = [
    normalizeScore(entry.afterDepression),
    normalizeScore(entry.afterPleasure),
    normalizeScore(entry.afterAchievement),
  ];

  const beforeCount = beforeScores.filter((score) => score !== null).length;
  const afterCount = afterScores.filter((score) => score !== null).length;

  if (beforeCount !== 3) {
    return "Fill all three Before ratings from 0 to 8 before saving.";
  }

  if (afterCount > 0 && afterCount !== 3) {
    return "If you start the After section, fill all three After ratings.";
  }

  return null;
}

function toClientEntry(
  entry: {
    id: number;
    activity: string;
    entry_date: string;
    before_depression: number | null;
    before_pleasure: number | null;
    before_achievement: number | null;
    after_depression: number | null;
    after_pleasure: number | null;
    after_achievement: number | null;
    status: EntryStatus;
  },
): ActivationEntry {
  return {
    id: entry.id,
    activity: entry.activity,
    entryDate: entry.entry_date,
    beforeDepression:
      entry.before_depression === null ? "" : String(entry.before_depression),
    beforePleasure:
      entry.before_pleasure === null ? "" : String(entry.before_pleasure),
    beforeAchievement:
      entry.before_achievement === null ? "" : String(entry.before_achievement),
    afterDepression:
      entry.after_depression === null ? "" : String(entry.after_depression),
    afterPleasure:
      entry.after_pleasure === null ? "" : String(entry.after_pleasure),
    afterAchievement:
      entry.after_achievement === null ? "" : String(entry.after_achievement),
    status: entry.status,
    isSaving: false,
    message: "",
  };
}

function WorksheetRow({
  entry,
  onChange,
  onSave,
  onDelete,
}: {
  entry: ActivationEntry;
  onChange: (field: keyof ActivationEntry, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const statusClassName =
    entry.status === "completed"
      ? "text-emerald-900"
      : entry.id
        ? "text-amber-900"
        : "text-stone-500";

  return (
    <section className="grid gap-4 rounded-[1.75rem] border border-emerald-950/10 bg-white/78 p-4 shadow-[0_18px_40px_rgba(48,84,53,0.08)] md:grid-cols-[1.06fr_0.94fr] md:items-start md:gap-6 md:p-5">
      <div className="min-h-30 self-start rounded-[1.25rem] border border-emerald-950/10 bg-emerald-50/45 p-3 sm:min-h-34">
        <p className="text-[1.05rem] font-medium text-emerald-950">Activity &amp; Date</p>
        <div className="mt-2 grid gap-2">
          <input
            type="date"
            value={entry.entryDate}
            onChange={(event) => onChange("entryDate", event.target.value)}
            className="w-full rounded-xl border border-emerald-950/10 bg-white/85 px-3 py-2 text-[0.98rem] text-stone-900 outline-none transition focus:border-emerald-700"
          />
          <textarea
            value={entry.activity}
            onChange={(event) => onChange("activity", event.target.value)}
            className="min-h-20 w-full resize-none rounded-xl border border-emerald-950/10 bg-white/85 px-3 py-3 text-[1rem] leading-7 text-stone-900 outline-none transition focus:border-emerald-700 sm:min-h-24"
          />
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-3 text-center md:hidden">
          <span className="font-[family:var(--font-display)] text-[1.25rem] font-semibold leading-none text-emerald-950">
            Depression
          </span>
          <span className="font-[family:var(--font-display)] text-[1.25rem] font-semibold leading-none text-emerald-950">
            Pleasure
          </span>
          <span className="font-[family:var(--font-display)] text-[1.25rem] font-semibold leading-none text-emerald-950">
            Achievement
          </span>
        </div>
        {[
          ["Before:", "beforeDepression", "beforePleasure", "beforeAchievement"],
          ["After:", "afterDepression", "afterPleasure", "afterAchievement"],
        ].map(([label, first, second, third]) => (
          <div
            key={label}
            className="grid gap-2 md:grid-cols-[80px_1fr_1fr_1fr] md:items-center md:gap-x-4"
          >
            <span className="text-[1.1rem] uppercase tracking-[0.14em] text-emerald-900">{label}</span>
            <div className="grid grid-cols-3 gap-3 md:contents">
              {[first, second, third].map((fieldName) => (
                <div key={fieldName} className="h-12 rounded-xl border border-emerald-950/10 bg-emerald-50/45">
                  <input
                    type="number"
                    min={0}
                    max={8}
                    value={entry[fieldName as keyof ActivationEntry] as string}
                    onChange={(event) =>
                      onChange(fieldName as keyof ActivationEntry, event.target.value)
                    }
                    className="h-full w-full border-0 bg-transparent text-center text-[1.05rem] text-stone-950 outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-center md:gap-3">
          <p className={`text-sm uppercase tracking-[0.14em] ${statusClassName}`}>
            {entry.id ? entry.status : "unsaved"}
          </p>
          <div className="grid gap-2 md:col-span-2 md:grid-flow-col md:justify-end md:gap-3">
            <button
              type="button"
              onClick={onDelete}
              disabled={entry.isSaving}
              className="w-full rounded-full border border-stone-900/10 bg-stone-100 px-4 py-2 text-sm uppercase tracking-[0.14em] text-stone-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
            >
              Delete Row
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={entry.isSaving}
              className="w-full rounded-full bg-emerald-950 px-4 py-2 text-sm uppercase tracking-[0.14em] text-emerald-50 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:opacity-80 md:min-w-32 md:w-auto"
            >
              {entry.isSaving ? "Saving" : "Save Entry"}
            </button>
          </div>
        </div>

        {entry.message ? (
          <p className="rounded-2xl border border-emerald-950/10 bg-white/70 px-4 py-3 text-sm leading-6 text-stone-700">
            {entry.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function ActivationWorksheetClient({ defaultDate }: { defaultDate: string }) {
  const [entries, setEntries] = useState<ActivationEntry[]>(() =>
    Array.from({ length: 4 }, () => emptyEntry(defaultDate)),
  );
  const [pageMessage, setPageMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadEntries() {
      try {
        const response = await fetch("/api/activation", { cache: "no-store" });
        const payload = (await response.json()) as {
          entries?: Array<{
            id: number;
            activity: string;
            entry_date: string;
            before_depression: number | null;
            before_pleasure: number | null;
            before_achievement: number | null;
            after_depression: number | null;
            after_pleasure: number | null;
            after_achievement: number | null;
            status: EntryStatus;
          }>;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load entries.");
        }

        if (!active) {
          return;
        }

        const loadedEntries = (payload.entries ?? []).map(toClientEntry);
        const blankRowsNeeded = Math.max(4 - loadedEntries.length, 0);

        setEntries(
          withMinimumRows(
            [
              ...loadedEntries,
              ...Array.from({ length: blankRowsNeeded }, () => emptyEntry(defaultDate)),
            ],
            defaultDate,
          ),
        );
        setPageMessage("");
      } catch (error) {
        if (!active) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Unable to load entries.";
        setPageMessage(message);
      }
    }

    void loadEntries();

    return () => {
      active = false;
    };
  }, [defaultDate]);

  function updateEntry(index: number, field: keyof ActivationEntry, value: string) {
    setEntries((currentEntries) =>
      currentEntries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value, message: "" } : entry,
      ),
    );
    setPageMessage("");
  }

  async function saveEntry(index: number) {
    const targetEntry = entries[index];
    const validationMessage = validateEntry(targetEntry);

    if (validationMessage) {
      setEntries((currentEntries) =>
        currentEntries.map((entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, isSaving: false, message: validationMessage }
            : entry,
        ),
      );
      return;
    }

    setEntries((currentEntries) =>
      currentEntries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, isSaving: true, message: "" } : entry,
      ),
    );

    try {
      const response = await fetch("/api/activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: targetEntry.id,
          activity: targetEntry.activity,
          entryDate: targetEntry.entryDate,
          beforeDepression: targetEntry.beforeDepression,
          beforePleasure: targetEntry.beforePleasure,
          beforeAchievement: targetEntry.beforeAchievement,
          afterDepression: targetEntry.afterDepression,
          afterPleasure: targetEntry.afterPleasure,
          afterAchievement: targetEntry.afterAchievement,
        }),
      });
      const payload = (await response.json()) as {
        entry?: {
          id: number;
          activity: string;
          entry_date: string;
          before_depression: number | null;
          before_pleasure: number | null;
          before_achievement: number | null;
          after_depression: number | null;
          after_pleasure: number | null;
          after_achievement: number | null;
          status: EntryStatus;
        };
        error?: string;
      };

      if (!response.ok || !payload.entry) {
        throw new Error(payload.error ?? "Unable to save entry.");
      }

      const nextEntry = {
        ...toClientEntry(payload.entry),
        message:
          payload.entry.status === "completed"
            ? "Saved as completed."
            : "Saved as pending. Come back later to fill the after section.",
      };

      setEntries((currentEntries) =>
        currentEntries.map((entry, entryIndex) =>
          entryIndex === index ? { ...nextEntry, isSaving: false } : entry,
        ),
      );
      setPageMessage("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save entry.";

      setEntries((currentEntries) =>
        currentEntries.map((entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, isSaving: false, message }
            : entry,
        ),
      );
    }
  }

  function addRow() {
    setPageMessage("");
    setEntries((currentEntries) => [...currentEntries, emptyEntry(defaultDate)]);
  }

  async function deleteEntry(index: number) {
    const targetEntry = entries[index];

    if (!targetEntry.id) {
      setEntries((currentEntries) =>
        withMinimumRows(
          currentEntries.filter((_, entryIndex) => entryIndex !== index),
          defaultDate,
        ),
      );
      setPageMessage("");
      return;
    }

    setEntries((currentEntries) =>
      currentEntries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, isSaving: true, message: "" } : entry,
      ),
    );

    try {
      const response = await fetch(`/api/activation?id=${targetEntry.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { deleted?: boolean; error?: string };

      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error ?? "Unable to delete entry.");
      }

      setEntries((currentEntries) =>
        withMinimumRows(
          currentEntries.filter((_, entryIndex) => entryIndex !== index),
          defaultDate,
        ),
      );
      setPageMessage("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete entry.";

      setEntries((currentEntries) =>
        currentEntries.map((entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, isSaving: false, message }
            : entry,
        ),
      );
    }
  }

  const indexedEntries = entries.map((entry, index) => ({ entry, index }));
  const historyEntries = indexedEntries.filter(({ entry }) => entry.id !== null);
  const draftEntries = indexedEntries.filter(({ entry }) => entry.id === null);

  return (
    <>
      {pageMessage ? (
        <div className="mb-6 rounded-2xl border border-rose-900/15 bg-rose-50/80 px-4 py-3 text-sm text-rose-950">
          {pageMessage}
        </div>
      ) : null}

      <section className="mt-10 rounded-[1.75rem] border border-cyan-950/10 bg-cyan-50/50 p-5 shadow-[0_20px_50px_rgba(20,84,98,0.08)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-900/70">
              History
            </p>
            <h3 className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-stone-900">
              Saved activities
            </h3>
          </div>
          <p className="text-sm leading-7 text-stone-700">
            Completed and pending worksheet rows you already saved.
          </p>
        </div>

        <div className="mt-6">
          {historyEntries.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-cyan-950/15 bg-white/70 p-6 text-sm leading-7 text-stone-600">
              <p className="font-[family:var(--font-display)] text-2xl leading-none text-stone-900">
                No saved history yet.
              </p>
              <p className="mt-3">
                Save a row in the entry section below and it will move here automatically.
              </p>
            </div>
          ) : (
            <>
              <RatingColumnsHeader />
              <div className="mt-2 grid gap-6">
                {historyEntries.map(({ entry, index }) => (
                  <WorksheetRow
                    key={entry.id ?? `history-${index}`}
                    entry={entry}
                    onChange={(field, value) => updateEntry(index, field, value)}
                    onSave={() => void saveEntry(index)}
                    onDelete={() => void deleteEntry(index)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[1.75rem] border border-emerald-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Entry
            </p>
            <h3 className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-stone-900">
              Add new worksheet rows
            </h3>
          </div>
          <p className="text-sm leading-7 text-stone-700">
            Draft new activities here, then save them into the history section above.
          </p>
        </div>

        <div className="mt-6">
          <RatingColumnsHeader />

          <div className="mt-2 grid gap-6">
            {draftEntries.map(({ entry, index }) => (
              <WorksheetRow
                key={entry.id ?? `new-${index}`}
                entry={entry}
                onChange={(field, value) => updateEntry(index, field, value)}
                onSave={() => void saveEntry(index)}
                onDelete={() => void deleteEntry(index)}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={addRow}
          className="rounded-full border border-emerald-950/10 bg-white/85 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
        >
          Add Row
        </button>
      </div>
    </>
  );
}
