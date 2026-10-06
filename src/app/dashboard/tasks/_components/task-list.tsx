"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import {
  deleteTaskWithUndoAction,
  setTaskStatusAction,
  undoDeleteTaskAction,
  updateTaskFieldsAction,
} from "@/app/dashboard/tasks/task-actions";
import type { TaskItem, TaskPriority, TaskStatus } from "@/lib/db";

const priorityStyles: Record<TaskPriority, string> = {
  high: "border-rose-900/15 bg-rose-50 text-rose-900",
  medium: "border-amber-900/15 bg-amber-50 text-amber-900",
  low: "border-sky-900/15 bg-sky-50 text-sky-900",
};

const controlClassName =
  "rounded-full border border-stone-900/10 bg-white px-2.5 py-1.5 text-xs text-stone-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40";

type TaskListProps = {
  tasks: TaskItem[];
  emptyText?: string;
  // Shown on each row's date control when the list spans several days (Inbox, overdue).
  showDate?: boolean;
};

export function TaskList({ tasks, emptyText = "No tasks here.", showDate = false }: TaskListProps) {
  const [undo, setUndo] = useState<TaskItem | null>(null);

  return (
    <>
      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-900/15 px-4 py-3 text-sm text-stone-600">
          {emptyText}
        </p>
      ) : (
        <ul className="grid gap-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} showDate={showDate} onDeleted={setUndo} />
          ))}
        </ul>
      )}
      {undo ? <UndoDeleteToast task={undo} onDone={() => setUndo(null)} /> : null}
    </>
  );
}

function TaskRow({
  task,
  showDate,
  onDeleted,
}: {
  task: TaskItem;
  showDate: boolean;
  onDeleted: (task: TaskItem) => void;
}) {
  const [optimisticTask, setOptimisticTask] = useOptimistic(
    task,
    (current, patch: Partial<TaskItem>) => ({ ...current, ...patch }),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const isClosed = optimisticTask.status === "done" || optimisticTask.status === "skipped";

  function run(patch: Partial<TaskItem>, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      setOptimisticTask(patch);
      const result = await action();

      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  function changeStatus(status: TaskStatus) {
    run({ status }, () => setTaskStatusAction(task.id, status));
  }

  function saveTitle(value: string) {
    setEditing(false);
    const title = value.trim();

    if (title && title !== task.title) {
      run({ title }, () => updateTaskFieldsAction(task.id, { title }));
    }
  }

  function moveTo(date: string | null) {
    run({ scheduled_date: date }, () => updateTaskFieldsAction(task.id, { date }));
  }

  function remove() {
    setError(null);
    setHidden(true);
    startTransition(async () => {
      const result = await deleteTaskWithUndoAction(task.id);

      if (result.ok) {
        onDeleted(result.deleted);
      } else {
        setHidden(false);
        setError(result.error);
      }
    });
  }

  if (hidden) {
    return null;
  }

  return (
    <li
      aria-busy={isPending}
      className={`rounded-2xl border border-stone-900/10 bg-white/85 px-3 py-2.5 shadow-sm transition ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          type="checkbox"
          checked={optimisticTask.status === "done"}
          onChange={(event) => changeStatus(event.target.checked ? "done" : "todo")}
          aria-label={`Mark "${optimisticTask.title}" ${optimisticTask.status === "done" ? "not done" : "done"}`}
          className="h-5 w-5 shrink-0 accent-emerald-700"
        />

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              defaultValue={optimisticTask.title}
              maxLength={200}
              aria-label="Task title"
              onBlur={(event) => saveTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  setEditing(false);
                }
              }}
              className="w-full rounded-lg border border-emerald-700/40 bg-white px-2 py-1 text-sm outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Click to rename"
              className={`max-w-full truncate text-left text-sm ${
                isClosed ? "text-stone-500 line-through" : "text-stone-900"
              } rounded focus-visible:ring-2 focus-visible:ring-emerald-700/40`}
            >
              {optimisticTask.title}
            </button>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
            {optimisticTask.recurring_task_id !== null ? (
              <span className="rounded-full border border-emerald-900/15 bg-emerald-50 px-2 py-0.5 text-emerald-900">
                Routine
              </span>
            ) : null}
            {optimisticTask.status === "in_progress" ? (
              <span className="rounded-full border border-indigo-900/15 bg-indigo-50 px-2 py-0.5 text-indigo-900">
                In progress
              </span>
            ) : null}
            {optimisticTask.status === "skipped" ? (
              <span className="rounded-full border border-stone-900/15 bg-stone-100 px-2 py-0.5">Skipped</span>
            ) : null}
            {optimisticTask.tags.map((tag) => (
              <span key={tag} className="text-stone-500">
                #{tag}
              </span>
            ))}
            {optimisticTask.note ? <span className="truncate text-stone-500">{optimisticTask.note}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={optimisticTask.priority}
            onChange={(event) => {
              const priority = event.target.value as TaskPriority;
              run({ priority }, () => updateTaskFieldsAction(task.id, { priority }));
            }}
            aria-label="Priority"
            className={`${controlClassName} ${priorityStyles[optimisticTask.priority]}`}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={optimisticTask.status}
            onChange={(event) => changeStatus(event.target.value as TaskStatus)}
            aria-label="Status"
            className={controlClassName}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
            <option value="skipped">Skipped</option>
          </select>

          <label className="flex items-center gap-1 text-xs text-stone-600">
            <span className={showDate || !optimisticTask.scheduled_date ? "" : "sr-only"}>
              {optimisticTask.scheduled_date ? "Date" : "Schedule"}
            </span>
            <input
              type="date"
              value={optimisticTask.scheduled_date ?? ""}
              onChange={(event) => {
                if (event.target.value) {
                  moveTo(event.target.value);
                }
              }}
              aria-label={`Move "${optimisticTask.title}" to date`}
              className={controlClassName}
            />
          </label>

          {optimisticTask.scheduled_date ? (
            <button
              type="button"
              onClick={() => moveTo(null)}
              title="Move to Inbox (no date)"
              className={controlClassName}
            >
              → Inbox
            </button>
          ) : null}

          <button
            type="button"
            onClick={remove}
            aria-label={`Delete "${optimisticTask.title}"`}
            className="rounded-full border border-rose-900/15 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900 transition hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-700/40"
          >
            Delete
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-800">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function UndoDeleteToast({ task, onDone }: { task: TaskItem; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), 8000);
    return () => window.clearTimeout(timer);
  }, [task]);

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-stone-900/10 bg-stone-900 px-4 py-3 text-sm text-stone-50 shadow-xl"
    >
      <span className="min-w-0 flex-1 truncate">
        {error ?? `Deleted "${task.title}".`}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await undoDeleteTaskAction(task);

            if (result.ok) {
              onDone();
            } else {
              setError(result.error);
            }
          });
        }}
        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-900 disabled:opacity-60"
      >
        {isPending ? "Restoring…" : "Undo"}
      </button>
      <button type="button" onClick={onDone} aria-label="Dismiss" className="text-xs text-stone-300">
        ✕
      </button>
    </div>
  );
}
