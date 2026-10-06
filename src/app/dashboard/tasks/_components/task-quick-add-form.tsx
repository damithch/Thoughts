"use client";

import { useActionState } from "react";

import { createTaskAction, type CreateTaskFormState } from "@/app/actions";
import { shiftColomboDate } from "@/lib/time";

const inputClassName =
  "rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-700/30";
const labelTextClassName = "uppercase tracking-[0.18em] text-emerald-800/70";

type TaskQuickAddFormProps = {
  defaultDate: string;
  today: string;
};

export function TaskQuickAddForm({ defaultDate, today }: TaskQuickAddFormProps) {
  const initialState: CreateTaskFormState = {
    error: null,
    values: { title: "", priority: "medium", tags: "", note: "", date: defaultDate },
  };
  const [state, formAction, pending] = useActionState(createTaskAction, initialState);
  const tomorrow = shiftColomboDate(today, 1);

  return (
    <form
      action={formAction}
      // Remount after a failed submit so the inputs pick up the values returned by the action.
      key={state.error ? JSON.stringify(state.values) : defaultDate}
      className="rounded-[1.75rem] border border-emerald-950/10 bg-white/75 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8"
    >
      <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Quick add</p>
      <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
        Add a task
      </h2>

      {state.error ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl border border-rose-700/15 bg-rose-50 px-4 py-3 text-sm text-rose-950"
        >
          {state.error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-5">
        <label className="grid gap-2 text-sm text-stone-700">
          <span className={labelTextClassName}>Task</span>
          <input
            type="text"
            name="title"
            required
            maxLength={200}
            defaultValue={state.values.title}
            placeholder="Finish API outline"
            className={inputClassName}
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2 text-sm text-stone-700">
            <label className="grid gap-2">
              <span className={labelTextClassName}>Date</span>
              <input
                type="date"
                name="date"
                required
                defaultValue={state.values.date}
                className={inputClassName}
              />
            </label>
            <span className="flex gap-2 text-xs text-stone-600">
              <DateShortcut label="Today" date={today} />
              <DateShortcut label="Tomorrow" date={tomorrow} />
            </span>
          </div>

          <label className="grid content-start gap-2 text-sm text-stone-700">
            <span className={labelTextClassName}>Priority</span>
            <select name="priority" defaultValue={state.values.priority} className={inputClassName}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>

        <label className="grid gap-2 text-sm text-stone-700">
          <span className={labelTextClassName}>Tags</span>
          <input
            type="text"
            name="tags"
            defaultValue={state.values.tags}
            placeholder="work, admin, health"
            className={inputClassName}
          />
        </label>

        <label className="grid gap-2 text-sm text-stone-700">
          <span className={labelTextClassName}>Note</span>
          <textarea
            name="note"
            rows={4}
            maxLength={2000}
            defaultValue={state.values.note}
            placeholder="Optional context, blocker, or success condition."
            className={`resize-none ${inputClassName}`}
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add task"}
        </button>
      </div>
    </form>
  );
}

function DateShortcut({ label, date }: { label: string; date: string }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        const input = event.currentTarget.form?.elements.namedItem("date");
        if (input instanceof HTMLInputElement) {
          input.value = date;
        }
      }}
      className="rounded-full border border-emerald-950/10 bg-white/70 px-3 py-1 transition hover:bg-white focus-visible:ring-2 focus-visible:ring-emerald-700/30"
    >
      {label}
    </button>
  );
}
