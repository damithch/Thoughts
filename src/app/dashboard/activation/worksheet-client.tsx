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
        <span className="font-[family:var(--font-display)] text-[1.8rem] font-semibold leading-none text-stone-950">
          Depression
        </span>
        <span className="font-[family:var(--font-display)] text-[1.8rem] font-semibold leading-none text-stone-950">
          Pleasure
        </span>
        <span className="font-[family:var(--font-display)] text-[1.8rem] font-semibold leading-none text-stone-950">
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
    <section className="grid gap-4 md:grid-cols-[1.06fr_0.94fr] md:items-start md:gap-6">
      <div className="min-h-30 self-start border-[3px] border-stone-900 bg-white p-2.5 sm:min-h-34">
        <p className="text-[1.05rem] font-medium text-stone-950">Activity &amp; Date:</p>
        <div className="mt-2 grid gap-2">
          <input
            type="date"
            value={entry.entryDate}
            onChange={(event) => onChange("entryDate", event.target.value)}
            className="w-full border-0 bg-transparent px-0 py-0 text-[0.98rem] text-stone-900 outline-none"
          />
          <textarea
            value={entry.activity}
            onChange={(event) => onChange("activity", event.target.value)}
            className="min-h-20 w-full resize-none border-0 bg-transparent px-0 py-0 text-[1rem] leading-7 text-stone-900 outline-none sm:min-h-24"
          />
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-3 text-center md:hidden">
          <span className="font-[family:var(--font-display)] text-[1.25rem] font-semibold leading-none text-stone-950">
            Depression
          </span>
          <span className="font-[family:var(--font-display)] text-[1.25rem] font-semibold leading-none text-stone-950">
            Pleasure
          </span>
          <span className="font-[family:var(--font-display)] text-[1.25rem] font-semibold leading-none text-stone-950">
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
            <span className="text-[1.2rem] text-stone-950">{label}</span>
            <div className="grid grid-cols-3 gap-3 md:contents">
              {[first, second, third].map((fieldName) => (
                <div key={fieldName} className="h-8 border-b-[3px] border-stone-900">
                  <input
                    type="number"
                    min={0}
                    max={8}
                    value={entry[fieldName as keyof ActivationEntry] as string}
                    onChange={(event) =>
                      onChange(fieldName as keyof ActivationEntry, event.target.value)
                    }
                    className="h-full w-full border-0 bg-transparent text-center text-[1.1rem] text-stone-950 outline-none"
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
              className="w-full rounded-full border border-stone-900 bg-white px-4 py-2 text-sm uppercase tracking-[0.14em] text-stone-950 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
            >
              Delete Row
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={entry.isSaving}
              className="w-full rounded-full border border-stone-900 bg-white px-4 py-2 text-sm uppercase tracking-[0.14em] text-stone-950 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 md:min-w-32 md:w-auto"
            >
              {entry.isSaving ? "Saving" : "Save Entry"}
            </button>
          </div>
        </div>

        {entry.message ? (
          <p className="text-sm leading-6 text-stone-700">{entry.message}</p>
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

        setEntries([
          ...loadedEntries,
          ...Array.from({ length: blankRowsNeeded }, () => emptyEntry(defaultDate)),
        ]);
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
    setEntries((currentEntries) => [...currentEntries, emptyEntry(defaultDate)]);
  }

  async function deleteEntry(index: number) {
    const targetEntry = entries[index];

    if (!targetEntry.id) {
      setEntries((currentEntries) => {
        const nextEntries = currentEntries.filter((_, entryIndex) => entryIndex !== index);

        while (nextEntries.length < 4) {
          nextEntries.push(emptyEntry(defaultDate));
        }

        return nextEntries;
      });
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

      setEntries((currentEntries) => {
        const nextEntries = currentEntries.filter((_, entryIndex) => entryIndex !== index);

        while (nextEntries.length < 4) {
          nextEntries.push(emptyEntry(defaultDate));
        }

        return nextEntries;
      });
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

  return (
    <>
      {pageMessage ? (
        <div className="mb-6 border border-rose-900/15 bg-rose-50/80 px-4 py-3 text-sm text-rose-950">
          {pageMessage}
        </div>
      ) : null}

      <RatingColumnsHeader />

      <div className="mt-2 grid gap-10">
        {entries.map((entry, index) => (
          <WorksheetRow
            key={entry.id ?? `new-${index}`}
            entry={entry}
            onChange={(field, value) => updateEntry(index, field, value)}
            onSave={() => void saveEntry(index)}
            onDelete={() => void deleteEntry(index)}
          />
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={addRow}
          className="rounded-full border border-stone-900 bg-white px-5 py-2 text-sm uppercase tracking-[0.16em] text-stone-950 transition hover:bg-stone-100"
        >
          Add Row
        </button>
      </div>
    </>
  );
}
