"use client";

import { useRef, useState, useTransition } from "react";

import { quickCreateTaskAction } from "@/app/dashboard/tasks/task-actions";

type TaskInlineAddProps = {
  // null adds to the Inbox.
  date: string | null;
  // Start collapsed behind a "+ Add task" button (used for each day in Upcoming).
  collapsible?: boolean;
  label?: string;
};

export function TaskInlineAdd({ date, collapsible = false, label = "Add task" }: TaskInlineAddProps) {
  const [open, setOpen] = useState(!collapsible);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full px-2 py-1 text-xs text-emerald-900 transition hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-700/40"
      >
        + {label}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await quickCreateTaskAction({
            title: String(formData.get("title") ?? ""),
            priority: String(formData.get("priority") ?? "medium"),
            date,
          });

          if (result.ok) {
            formRef.current?.reset();
            formRef.current?.querySelector<HTMLInputElement>("input[name=title]")?.focus();
          } else {
            setError(result.error);
          }
        });
      }}
      className="grid gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="title"
          required
          maxLength={200}
          autoFocus={collapsible}
          placeholder={date ? "New task…" : "Capture a task without a date…"}
          aria-label={label}
          className="min-w-0 flex-1 rounded-full border border-stone-900/10 bg-white px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40"
        />
        <select
          name="priority"
          defaultValue="medium"
          aria-label="Priority"
          className="rounded-full border border-stone-900/10 bg-white px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-emerald-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-50 transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full px-2 py-2 text-xs text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-rose-800">
          {error}
        </p>
      ) : null}
    </form>
  );
}
