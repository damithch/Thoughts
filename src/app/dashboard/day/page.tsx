import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import {
  getConversationSummariesByUserAndDate,
  getDailyCheckInsByUserAndDate,
  getDayRecordByUserAndDate,
  getTasksByUserAndDate,
  getThoughtsByUserAndDate,
} from "@/lib/db";
import {
  formatColomboDateLabel,
  getCurrentColomboDate,
  shiftColomboDate,
  toColomboDateTime,
} from "@/lib/time";

export const dynamic = "force-dynamic";

type DayPageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getPriorityClassName(priority: string) {
  if (priority === "high") return "bg-rose-100 text-rose-900 border-rose-900/10";
  if (priority === "medium") return "bg-amber-100 text-amber-900 border-amber-900/10";
  return "bg-stone-100 text-stone-700 border-stone-900/10";
}

function getStatusBadge(status: string) {
  if (status === "done") return { label: "Done", className: "bg-emerald-100 text-emerald-900 border-emerald-900/10" };
  if (status === "in_progress") return { label: "In progress", className: "bg-amber-100 text-amber-900 border-amber-900/10" };
  if (status === "skipped") return { label: "Skipped", className: "bg-stone-200 text-stone-700 border-stone-900/10" };
  return { label: "To do", className: "bg-white text-stone-700 border-stone-900/10" };
}

function getMoodEmoji(mood: number) {
  if (mood >= 8) return "😊";
  if (mood >= 6) return "🙂";
  if (mood >= 4) return "😐";
  if (mood >= 2) return "😔";
  return "😞";
}

export default async function DayPage({ searchParams }: DayPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const today = getCurrentColomboDate();
  const date = params?.date && isValidDate(params.date) ? params.date : today;
  const prevDate = shiftColomboDate(date, -1);
  const nextDate = shiftColomboDate(date, 1);
  const dateLabel = formatColomboDateLabel(date);
  const isToday = date === today;
  const month = date.slice(0, 7);

  const [thoughts, tasks, dayRecord, checkIns, conversations] = await Promise.all([
    getThoughtsByUserAndDate(currentUser.id, date),
    getTasksByUserAndDate(currentUser.id, date),
    getDayRecordByUserAndDate(currentUser.id, date),
    getDailyCheckInsByUserAndDate(currentUser.id, date),
    getConversationSummariesByUserAndDate(currentUser.id, date),
  ]);

  const totalItems = thoughts.length + tasks.length + checkIns.length + conversations.length;
  const thoughtMoods = thoughts.map((t) => t.mood);
  const checkInMoods = checkIns.map((c) => c.mood);
  const allMoods = [
    ...thoughtMoods,
    ...checkInMoods,
    ...(dayRecord?.end_of_day_mood ? [dayRecord.end_of_day_mood] : []),
  ];
  const averageMood =
    allMoods.length > 0
      ? Number((allMoods.reduce((sum, m) => sum + m, 0) / allMoods.length).toFixed(1))
      : null;
  const tasksDone = tasks.filter((t) => t.status === "done").length;
  const tasksTotal = tasks.length;

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 sm:gap-8">

        {/* Header + Navigation */}
        <header className="rounded-[2rem] border border-emerald-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-800/70 sm:text-sm sm:tracking-[0.28em]">
                Day View
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-3xl leading-none sm:text-4xl md:text-5xl">
                {dateLabel}
              </h1>
              {isToday ? (
                <span className="mt-2 inline-block rounded-full bg-emerald-900 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-emerald-50">
                  Today
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
              <Link
                href={`/dashboard/day?date=${prevDate}`}
                className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                ← Previous Day
              </Link>
              <Link
                href={`/dashboard/day?date=${nextDate}`}
                className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                Next Day →
              </Link>
              <Link
                href={`/dashboard?month=${month}`}
                className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                ← Calendar
              </Link>
              <Link
                href={`/api/reports/daily?date=${date}&format=json`}
                className="rounded-full border border-stone-900/10 bg-stone-50 px-4 py-3 text-center text-stone-700 transition-colors hover:bg-stone-100"
              >
                ⬇ Download JSON
              </Link>
            </div>
          </div>
        </header>

        {/* Summary Stats */}
        <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Total entries</p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {totalItems}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Average mood</p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {averageMood !== null ? `${averageMood}/10` : "—"}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Tasks completed</p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {tasksTotal > 0 ? `${tasksDone}/${tasksTotal}` : "—"}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Conversations</p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {conversations.length}
            </p>
          </div>
        </section>

        {/* Day Note / Intention */}
        {dayRecord ? (
          <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Day note</p>
            {dayRecord.intention ? (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Intention</p>
                <p className="mt-1 text-sm leading-7 text-stone-800">{dayRecord.intention}</p>
              </div>
            ) : null}
            {dayRecord.note ? (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Reflection</p>
                <p className="mt-1 text-sm leading-7 text-stone-800">{dayRecord.note}</p>
              </div>
            ) : null}
            {dayRecord.end_of_day_mood !== null ? (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500">End-of-day mood</p>
                <p className="mt-1 text-sm leading-7 text-stone-800">
                  {getMoodEmoji(dayRecord.end_of_day_mood)} {dayRecord.end_of_day_mood}/10
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Thoughts */}
        <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Thoughts</p>
              <p className="mt-1 text-sm text-stone-600">{thoughts.length} entries</p>
            </div>
          </div>
          {thoughts.length === 0 ? (
            <p className="text-sm text-stone-500">No thoughts recorded on this day.</p>
          ) : (
            <div className="grid gap-4">
              {thoughts.map((thought) => (
                <div
                  key={thought.id}
                  className="rounded-[1.5rem] border border-emerald-950/10 bg-white/78 p-4 shadow-[0_14px_32px_rgba(48,84,53,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-[family:var(--font-display)] text-xl leading-tight text-stone-900">
                        {thought.title}
                      </h3>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                        {thought.category}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-950/10 bg-emerald-50/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-emerald-950">
                      {getMoodEmoji(thought.mood)} {thought.mood}/10
                    </span>
                  </div>
                  {thought.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {thought.tags.map((tag) => (
                        <span
                          key={`${thought.id}-${tag}`}
                          className="rounded-full border border-emerald-950/10 bg-emerald-50/70 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-950"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-3 text-sm leading-7 text-stone-700">{thought.summary}</p>
                  {thought.body ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-emerald-800/70 hover:text-emerald-900">
                        Full note
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                        {thought.body}
                      </p>
                    </details>
                  ) : null}
                  {thought.concept_tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {thought.concept_tags.map((ct) => (
                        <span
                          key={`${thought.id}-ct-${ct}`}
                          className="rounded-full border border-indigo-900/10 bg-indigo-50/70 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-indigo-900"
                        >
                          {ct}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {thought.insight_reflection ? (
                    <div className="mt-3 rounded-xl border border-amber-900/10 bg-amber-50/60 p-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-amber-800">Insight reflection</p>
                      <p className="mt-1 text-sm leading-6 text-amber-900">{thought.insight_reflection}</p>
                      {thought.linked_book_title ? (
                        <p className="mt-1 text-[11px] text-amber-700">
                          From: {thought.linked_book_title}
                          {thought.linked_idea_text ? ` — ${thought.linked_idea_text}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tasks */}
        <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Tasks</p>
            <p className="mt-1 text-sm text-stone-600">
              {tasksTotal > 0
                ? `${tasksDone} of ${tasksTotal} completed (${tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0}%)`
                : "No tasks scheduled"}
            </p>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-stone-500">No tasks for this day.</p>
          ) : (
            <div className="grid gap-3">
              {tasks.map((task) => {
                const status = getStatusBadge(task.status);
                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-4 rounded-[1.25rem] border p-4 ${status.className}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={`font-semibold text-sm ${task.status === "done" ? "line-through opacity-60" : ""}`}>
                          {task.title}
                        </h3>
                      </div>
                      {task.note ? (
                        <p className="mt-1 text-xs leading-5 text-stone-600">{task.note}</p>
                      ) : null}
                      {task.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.tags.map((tag) => (
                            <span
                              key={`${task.id}-${tag}`}
                              className="rounded-full border border-stone-900/8 bg-white/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-stone-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${getPriorityClassName(task.priority)}`}>
                        {task.priority}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Check-ins */}
        <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">Check-ins</p>
            <p className="mt-1 text-sm text-stone-600">{checkIns.length} entries</p>
          </div>
          {checkIns.length === 0 ? (
            <p className="text-sm text-stone-500">No check-ins on this day.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {checkIns.map((checkIn) => (
                <div
                  key={checkIn.id}
                  className="rounded-[1.25rem] border border-emerald-950/10 bg-white/78 p-4 shadow-[0_10px_24px_rgba(48,84,53,0.05)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-stone-500">
                      {toColomboDateTime(checkIn.created_at)}
                    </span>
                    <span className="rounded-full border border-emerald-950/10 bg-emerald-50/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-emerald-950">
                      {getMoodEmoji(checkIn.mood)} {checkIn.mood}/10
                    </span>
                  </div>
                  <div className="mt-3 flex gap-3">
                    <div className="rounded-lg border border-stone-900/8 bg-stone-50 px-3 py-1.5 text-[11px]">
                      <span className="text-stone-500">Energy:</span>{" "}
                      <span className="font-medium text-stone-800 capitalize">{checkIn.energy}</span>
                    </div>
                    <div className="rounded-lg border border-stone-900/8 bg-stone-50 px-3 py-1.5 text-[11px]">
                      <span className="text-stone-500">Focus:</span>{" "}
                      <span className="font-medium text-stone-800 capitalize">{checkIn.focus.replace("_", " ")}</span>
                    </div>
                  </div>
                  {checkIn.note ? (
                    <p className="mt-3 text-sm leading-6 text-stone-700">{checkIn.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Claude Conversation Logs */}
        <section className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_20px_50px_rgba(48,84,84,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-800/70">Claude Conversation Logs</p>
            <p className="mt-1 text-sm text-stone-600">{conversations.length} conversations</p>
          </div>
          {conversations.length === 0 ? (
            <p className="text-sm text-stone-500">No conversation logs on this day.</p>
          ) : (
            <div className="grid gap-4">
              {conversations.map((convo) => (
                <div
                  key={convo.id}
                  className="rounded-[1.5rem] border border-cyan-950/10 bg-white/78 p-4 shadow-[0_14px_32px_rgba(48,84,84,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-[family:var(--font-display)] text-lg leading-tight text-stone-900">
                      {convo.title}
                    </h3>
                    {convo.mood_context !== null ? (
                      <span className="shrink-0 rounded-full border border-cyan-950/10 bg-cyan-50/70 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-cyan-950">
                        {getMoodEmoji(convo.mood_context)} {convo.mood_context}/10
                      </span>
                    ) : null}
                  </div>
                  {convo.key_topics.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {convo.key_topics.map((topic) => (
                        <span
                          key={`${convo.id}-${topic}`}
                          className="rounded-full border border-cyan-950/10 bg-cyan-50/70 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-950"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Insights</p>
                    <p className="mt-1 text-sm leading-7 text-stone-700">{convo.insights}</p>
                  </div>
                  {convo.action_items.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Action items</p>
                      <ul className="mt-1 list-inside list-disc text-sm leading-7 text-stone-700">
                        {convo.action_items.map((item, i) => (
                          <li key={`${convo.id}-ai-${i}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Empty state */}
        {totalItems === 0 && !dayRecord ? (
          <section className="rounded-[1.75rem] border border-stone-900/8 bg-white/60 p-6 text-center shadow-[0_20px_50px_rgba(48,84,53,0.06)] backdrop-blur sm:rounded-[2rem] sm:p-8">
            <p className="font-[family:var(--font-display)] text-2xl text-stone-400">
              Nothing recorded
            </p>
            <p className="mt-2 text-sm text-stone-500">
              No thoughts, tasks, check-ins, or conversations were logged on {dateLabel}.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
