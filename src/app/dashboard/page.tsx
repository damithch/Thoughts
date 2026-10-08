import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createThoughtAction,
  createAnchorNoteAction,
  hideThoughtAction,
  deleteThoughtAction,
  logoutAction,
  unhideThoughtAction,
  updateThoughtAction,
} from "@/app/actions";
import { Toast } from "@/app/components/toast";
import { getCurrentUser } from "@/lib/auth";
import {
  getAnchorNoteByDate,
  getAnchorStreak,
  getRecentAnchorNotes,
  getConversationSummariesByUser,
  getBookIdeasByUser,
  getThoughtActivityByUserMonth,
  getThoughtByIdForUser,
  getThoughtsByUser,
} from "@/lib/db";
import {
  getCurrentColomboDate,
  getCurrentColomboMonth,
  toColomboDate,
} from "@/lib/time";
import RagSearch from "@/app/components/rag-search";
import { ThoughtFormSection } from "@/app/components/thought-form-section";
import { AnchorNoteCard } from "@/app/components/anchor-note-card";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{
    edit?: string;
    month?: string;
    tag?: string;
    vis?: "active" | "hidden" | "all";
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

const dashboardToastMessages: Record<string, string> = {
  created: "Thought card created.",
  deleted: "Thought card deleted.",
  delete_failed: "That card could not be deleted.",
  invalid_entry: "Add a title, category, mood level, and summary before saving.",
  registered: "Account created. Your dashboard is ready.",
  save_failed: "The card could not be saved.",
  hidden: "Thought card hidden.",
  hide_failed: "That card could not be hidden.",
  unhidden: "Thought card restored.",
  unhide_failed: "That card could not be restored.",
  update_failed: "That card could not be updated.",
  updated: "Thought card updated.",
  welcome_back: "Signed in successfully.",
  anchor_saved: "Daily anchor dropped and locked for today.",
  anchor_failed: "Failed to save daily anchor.",
  anchor_empty: "Anchor sentence cannot be empty.",
};

function formatMonthLabel(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);

  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftMonth(month: string, delta: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

type CalendarCell = ReturnType<typeof buildCalendarDays>[number];
type CalendarDayCell = Extract<CalendarCell, { kind: "day" }>;

function moodTierClassName(mood: number | null) {
  if (mood === null || mood < 5.5) return "bg-emerald-100/70";
  if (mood < 6.5) return "bg-emerald-200/70";
  if (mood < 7.5) return "bg-emerald-300/60";
  return "bg-emerald-400/55";
}

function buildCalendarDays(month: string, activityByDate: Map<string, { total: number; averageMood: number }>) {
  const [year, monthIndex] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthIndex - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const startOffset = firstDay.getUTCDay();
  const cells: Array<
    | { kind: "empty"; key: string }
    | {
        kind: "day";
        key: string;
        date: string;
        dayNumber: number;
        total: number;
        averageMood: number | null;
        isLogged: boolean;
        isToday: boolean;
      }
  > = [];
  const today = getCurrentColomboDate();

  for (let index = 0; index < startOffset; index += 1) {
    cells.push({ kind: "empty", key: `empty-${index}` });
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = `${month}-${String(dayNumber).padStart(2, "0")}`;
    const activity = activityByDate.get(date);

    cells.push({
      kind: "day",
      key: date,
      date,
      dayNumber,
      total: activity?.total ?? 0,
      averageMood: activity?.averageMood ?? null,
      isLogged: Boolean(activity),
      isToday: today === date,
    });
  }

  return cells;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const visibility =
    params?.vis === "hidden" || params?.vis === "all" ? params.vis : "active";
  const toastMessage = params?.toast
    ? dashboardToastMessages[params.toast]
    : undefined;
  const activeTag = params?.tag?.trim().toLowerCase() ?? "";
  const requestedMonth = params?.month ?? getCurrentColomboMonth();
  const activeMonth = /^\d{4}-\d{2}$/.test(requestedMonth)
    ? requestedMonth
    : getCurrentColomboMonth();
  const today = getCurrentColomboDate();
  const editThoughtId = params?.edit ? Number(params.edit) : null;
  const validEditThoughtId =
    editThoughtId && Number.isInteger(editThoughtId) && editThoughtId > 0
      ? editThoughtId
      : null;

  let databaseAvailable = true;
  let thoughts: Awaited<ReturnType<typeof getThoughtsByUser>> = [];
  let monthlyActivity: Awaited<ReturnType<typeof getThoughtActivityByUserMonth>> = [];
  let bookIdeas: Awaited<ReturnType<typeof getBookIdeasByUser>> = [];
  let conversationSummaries: Awaited<ReturnType<typeof getConversationSummariesByUser>> = [];
  let todayAnchorNote: Awaited<ReturnType<typeof getAnchorNoteByDate>> = null;
  let anchorStreak: Awaited<ReturnType<typeof getAnchorStreak>> = {
    currentStreak: 0,
    longestStreak: 0,
    totalEntries: 0,
    hasToday: false,
  };
  let recentAnchorNotes: Awaited<ReturnType<typeof getRecentAnchorNotes>> = [];

  try {
    [
      thoughts,
      monthlyActivity,
      bookIdeas,
      conversationSummaries,
      todayAnchorNote,
      anchorStreak,
      recentAnchorNotes,
    ] = await Promise.all([
      getThoughtsByUser(currentUser.id, 24, visibility),
      getThoughtActivityByUserMonth(currentUser.id, activeMonth),
      getBookIdeasByUser(currentUser.id),
      getConversationSummariesByUser(currentUser.id, 8),
      getAnchorNoteByDate(currentUser.id, today),
      getAnchorStreak(currentUser.id, today),
      getRecentAnchorNotes(currentUser.id, 30),
    ]);
  } catch (error) {
    console.error("Failed to load dashboard data.", error);
    databaseAvailable = false;
  }

  const editingThought = validEditThoughtId
    ? await getThoughtByIdForUser(validEditThoughtId, currentUser.id)
    : null;
  type DashboardThought = Awaited<ReturnType<typeof getThoughtsByUser>>[number];
  const filteredThoughts = activeTag
    ? thoughts.filter((thought: DashboardThought) => thought.tags.includes(activeTag))
    : thoughts;
  const latestThought = filteredThoughts[0] ?? null;
  const averageMood = filteredThoughts.length
    ? (filteredThoughts.reduce((total, thought) => total + thought.mood, 0) / filteredThoughts.length).toFixed(1)
    : "0.0";
  const visibleTags = Array.from(
    new Set(filteredThoughts.flatMap((thought: DashboardThought) => thought.tags)),
  ).slice(0, 12);

  const activityByDate = new Map(
    monthlyActivity.map((day) => [
      day.date,
      {
        total: day.total,
        averageMood: day.average_mood,
      },
    ]),
  );
  const calendarDays = buildCalendarDays(activeMonth, activityByDate);
  const loggedDaysCount = monthlyActivity.length;
  const daysInActiveMonth = new Date(
    Date.UTC(
      Number(activeMonth.slice(0, 4)),
      Number(activeMonth.slice(5, 7)),
      0,
    ),
  ).getUTCDate();
  const missedDaysCount = Math.max(daysInActiveMonth - loggedDaysCount, 0);
  const elapsedCalendarDays = calendarDays.filter(
    (cell): cell is CalendarDayCell => cell.kind === "day" && cell.date <= today,
  );
  let calendarStreak = 0;
  for (let index = elapsedCalendarDays.length - 1; index >= 0; index -= 1) {
    const day = elapsedCalendarDays[index];

    if (day.isLogged) {
      calendarStreak += 1;
    } else if (!day.isToday) {
      break;
    }
  }
  const latestActivity = latestThought
    ? toColomboDate(latestThought.created_at)
    : "No entries";
  const visibilitySuffix = visibility === "active" ? "" : `&vis=${visibility}`;
  const archiveHeading =
    visibility === "hidden"
      ? "Hidden archive"
      : visibility === "all"
        ? "All cards"
        : "Archive";

  return (
    <main className="thought-network-bg min-h-screen overflow-hidden px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
        <header className="rounded-[2rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur-md sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-800/70 sm:text-sm sm:tracking-[0.28em]">
                Dashboard
              </p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl md:text-6xl">
                {currentUser.name}
              </h1>
              <p className="mt-3 break-all text-sm leading-6 text-stone-700 sm:mt-4 sm:leading-7">
                {currentUser.email}
              </p>
            </div>

            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
              <Link
                href="/dashboard/agent"
                className="rounded-full border border-cyan-950/20 bg-cyan-950 px-4 py-3 text-center text-cyan-50 font-semibold transition-colors hover:bg-cyan-900 shadow-md"
              >
                🤖 AI Task Agent
              </Link>
              <Link
                href="/dashboard/today"
                className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                Today View
              </Link>
              <Link
                href="/dashboard/tasks"
                className="rounded-full border border-blue-950/10 px-4 py-3 text-center text-blue-950 transition-colors hover:bg-blue-50"
              >
                Task Management
              </Link>
              <Link
                href="/dashboard/completion"
                className="rounded-full border border-purple-950/10 px-4 py-3 text-center text-purple-950 transition-colors hover:bg-purple-50"
              >
                Completion Stats
              </Link>
              <Link
                href="/dashboard/insights"
                className="rounded-full border border-amber-950/10 px-4 py-3 text-center text-amber-950 transition-colors hover:bg-amber-50"
              >
                Insight Library
              </Link>
              <Link
                href="/dashboard/activation"
                className="rounded-full border border-stone-900/10 px-4 py-3 text-center text-stone-900 transition-colors hover:bg-stone-50"
              >
                BA Worksheet
              </Link>
              <Link
                href="/dashboard/worry-postponement"
                className="rounded-full border border-teal-950/10 px-4 py-3 text-center text-teal-950 transition-colors hover:bg-teal-50"
              >
                Worry Postponement
              </Link>
              <Link
                href="/dashboard/conversations"
                className="rounded-full border border-cyan-950/10 px-4 py-3 text-center text-cyan-950 transition-colors hover:bg-cyan-50"
              >
                Claude Log
              </Link>
              <Link
                href="/dashboard/settings"
                className="rounded-full border border-indigo-950/10 px-4 py-3 text-center text-indigo-950 transition-colors hover:bg-indigo-50"
              >
                ⚙️ Settings
              </Link>
              <Link
                href="/"
                className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white"
              >
                Public Home
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-full bg-emerald-950 px-4 py-3 text-emerald-50 transition-colors hover:bg-emerald-800"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </header>

        {!databaseAvailable ? (
          <div className="rounded-2xl border border-amber-700/15 bg-amber-100/80 px-4 py-3 text-sm text-amber-950">
            Neon is unreachable right now, so your dashboard cannot load saved
            cards until the database connection comes back.
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Total cards
            </p>
            <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
              {filteredThoughts.length}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Latest activity
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              {latestActivity}
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              Average mood
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              {averageMood}/10
            </p>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-4 shadow-[0_20px_50px_rgba(48,84,53,0.10)] sm:rounded-[2rem] sm:p-5">
          <RagSearch />
        </section>

        <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-4 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                Tag filter
              </p>
              <p className="mt-2 text-sm leading-7 text-stone-700">
                Use tags to isolate patterns like work, family, health, or specific projects.
              </p>
            </div>
            {activeTag ? (
              <Link
                href={visibility === "active" ? "/dashboard" : `/dashboard?vis=${visibility}`}
                className="inline-flex rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
              >
                Clear filter
              </Link>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {visibleTags.length === 0 ? (
              <p className="text-sm text-stone-600">No tags yet.</p>
            ) : (
              visibleTags.map((tag) => (
                <Link
                  key={tag}
                  href={`/dashboard?tag=${encodeURIComponent(tag)}${visibilitySuffix}`}
                  className={`inline-flex rounded-full px-3 py-2 text-xs uppercase tracking-[0.14em] transition sm:px-4 sm:tracking-[0.16em] ${
                    activeTag === tag
                      ? "bg-emerald-950 text-emerald-50"
                      : "border border-emerald-950/10 bg-white/70 text-emerald-950 hover:bg-white"
                  }`}
                >
                  {tag}
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-4 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                Calendar view
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                {formatMonthLabel(activeMonth)}
              </h2>
              <p className="mt-3 text-sm leading-7 text-stone-700">
                Logged days are highlighted so you can see where you kept the journaling habit and where you missed it.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/dashboard?month=${shiftMonth(activeMonth, -1)}${activeTag ? `&tag=${encodeURIComponent(activeTag)}` : ""}${visibilitySuffix}`}
                className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-center text-xs uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
              >
                Previous
              </Link>
              <Link
                href={`/dashboard?month=${shiftMonth(activeMonth, 1)}${activeTag ? `&tag=${encodeURIComponent(activeTag)}` : ""}${visibilitySuffix}`}
                className="rounded-full border border-emerald-950/10 bg-white/70 px-4 py-2 text-center text-xs uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
              >
                Next
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
            <div>
              <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[11px] uppercase tracking-[0.16em] text-stone-500">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                  <span key={dayName}>{dayName}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((cell) =>
                  cell.kind === "empty" ? (
                    <div
                      key={cell.key}
                      className="aspect-square rounded-2xl border border-transparent"
                    />
                  ) : (
                    <a
                      key={cell.key}
                      href={`/dashboard/day?date=${cell.date}`}
                      aria-label={cell.isLogged ? `${cell.date}: ${cell.total} cards, mood ${cell.averageMood?.toFixed(1) ?? "0.0"}` : cell.date}
                      className={`flex aspect-square flex-col justify-between rounded-2xl border p-2 text-left transition sm:p-2.5 ${
                        cell.isLogged
                          ? `border-emerald-900/20 text-emerald-950 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(48,84,53,0.18)] ${moodTierClassName(cell.averageMood)}`
                          : cell.date < today
                            ? "border-dashed border-stone-900/20 bg-white/35 text-stone-600 hover:bg-white/70"
                            : "border-stone-900/5 bg-white/20 text-stone-500 hover:bg-white/50"
                      } ${cell.isToday ? "ring-2 ring-emerald-800" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <span
                          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold ${
                            cell.isToday ? "bg-emerald-950 text-emerald-50" : ""
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        <span className="flex h-6 items-center gap-[3px]" aria-hidden="true">
                          {Array.from({ length: Math.min(cell.total, 5) }).map((_, dotIndex) => (
                            <span key={dotIndex} className="h-1.5 w-1.5 rounded-full bg-emerald-950" />
                          ))}
                        </span>
                      </div>
                      <div className="text-[11px] font-medium leading-4">
                        {cell.isLogged
                          ? `Mood ${cell.averageMood?.toFixed(1) ?? "0.0"}`
                          : cell.date < today
                            ? "Missed"
                            : ""}
                      </div>
                    </a>
                  ),
                )}
              </div>
              <div
                className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-600"
                aria-label="Calendar legend"
              >
                <span className="inline-flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-[5px] border border-emerald-900/20 bg-emerald-100/70" />Low mood</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-[5px] border border-emerald-900/20 bg-emerald-200/70" /></span>
                <span className="inline-flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-[5px] border border-emerald-900/20 bg-emerald-300/60" /></span>
                <span className="inline-flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-[5px] border border-emerald-900/20 bg-emerald-400/55" />High mood</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-[5px] border border-dashed border-stone-900/30 bg-white/35" />Missed</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-full bg-emerald-950" />Today</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-950" /><span className="h-1.5 w-1.5 rounded-full bg-emerald-950" />Cards logged</span>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[1.5rem] border border-emerald-950/10 bg-white/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                  This month
                </p>
                <p className="mt-3 font-[family:var(--font-display)] text-3xl leading-none text-stone-900">
                  {loggedDaysCount} logged
                </p>
                <p className="mt-3 text-sm leading-7 text-stone-700">
                  {missedDaysCount} missed days in {formatMonthLabel(activeMonth)}.
                </p>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-950/10"
                  role="img"
                  aria-label={`${loggedDaysCount} of ${daysInActiveMonth} days logged`}
                >
                  <div
                    className="h-full rounded-full bg-emerald-800"
                    style={{ width: `${Math.min((loggedDaysCount / daysInActiveMonth) * 100, 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-stone-500">
                  {loggedDaysCount} of {daysInActiveMonth} days
                  {calendarStreak > 0 ? `, ${calendarStreak}-day streak` : ""}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-emerald-950/10 bg-white/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                  How to use it
                </p>
                <p className="mt-3 text-sm leading-7 text-stone-700">
                  Click a logged day to download that day&apos;s JSON report instantly. Empty days help you spot breaks in the habit.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="grid gap-6">
            <AnchorNoteCard
              todayNote={todayAnchorNote}
              streak={anchorStreak}
              recentNotes={recentAnchorNotes}
              createAction={createAnchorNoteAction}
              databaseAvailable={databaseAvailable}
            />

            <ThoughtFormSection
              editingThought={editingThought}
              bookIdeas={bookIdeas.map((idea) => ({
                id: idea.id,
                book_title: idea.book_title,
                idea_text: idea.idea_text,
              }))}
              databaseAvailable={databaseAvailable}
              createAction={createThoughtAction}
              updateAction={updateThoughtAction}
            />
          </div>

          <div className="grid gap-6">
            <form
              action="/api/reports/daily"
              method="get"
              className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8"
            >
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                  Reports
                </p>
                <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                  Review a specific day
                </h2>
              </div>
              <div className="flex flex-col gap-5">
                <div className="space-y-3">
                  <p className="text-sm leading-7 text-stone-700">
                    JSON is best for AI processing. It preserves structure
                    clearly, so an AI can analyze dates, categories, frequency,
                    mood, repeated themes, and patterns more reliably than from
                    plain text or CSV.
                  </p>
                </div>

                <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                  <div className="grid flex-1 gap-2 text-sm text-stone-700">
                    <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                      Download daily report
                    </span>
                    <input
                      type="date"
                      name="date"
                      defaultValue={today}
                      required
                      className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                    />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button
                      type="submit"
                      name="format"
                      value="csv"
                      disabled={!databaseAvailable}
                      className="rounded-full border border-emerald-950/10 bg-white/70 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-400"
                    >
                      Download CSV
                    </button>
                    <button
                      type="submit"
                      name="format"
                      value="json"
                      disabled={!databaseAvailable}
                      className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      Download JSON
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <form
              action="/api/reports/monthly"
              method="get"
              className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8"
            >
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                  Monthly export
                </p>
                <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                  Download the full month
                </h2>
              </div>
              <div className="flex flex-col gap-5">
                <p className="text-sm leading-7 text-stone-700">
                  Export every individual thought, task, check-in, and day note for a month in one
                  JSON file, with each item keeping its own timestamp.
                </p>

                <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                  <div className="grid flex-1 gap-2 text-sm text-stone-700">
                    <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                      Download monthly report
                    </span>
                    <input
                      type="month"
                      name="month"
                      defaultValue={activeMonth}
                      required
                      className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!databaseAvailable}
                    className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    Download Month JSON
                  </button>
                </div>
              </div>
            </form>

            <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                Summary
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                Your writing space
              </h2>
              <p className="mt-4 text-sm leading-7 text-stone-700">
                Use this dashboard to track category, mood, and tags together,
                then export daily entries when you want to review patterns or
                run AI analysis.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-900/70">
                Claude conversation log
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                Separate from thought cards
              </h2>
              <p className="mt-4 text-sm leading-7 text-stone-700">
                Claude summaries are stored in their own log and reviewed on a dedicated page so
                they do not read like normal journal entries.
              </p>

              <div className="mt-5 grid gap-4">
                <div className="rounded-[1.5rem] border border-cyan-950/10 bg-cyan-50/70 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-900/70">
                    Saved logs
                  </p>
                  <p className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                    {conversationSummaries.length}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-stone-700">
                    {conversationSummaries[0]
                      ? `Latest entry: ${conversationSummaries[0].title}`
                      : "No conversation summaries saved yet."}
                  </p>
                </div>

                <Link
                  href="/dashboard/conversations"
                  className="inline-flex justify-center rounded-full border border-cyan-950/10 bg-white/80 px-5 py-3 text-sm uppercase tracking-[0.16em] text-cyan-950 transition hover:bg-white"
                >
                  Open Claude Conversation Log
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-stone-500">
                {activeTag ? `${archiveHeading}: ${activeTag}` : archiveHeading}
              </p>
              <h2 className="mt-2 font-[family:var(--font-display)] text-4xl leading-none md:text-5xl">
                {filteredThoughts.length === 1 ? "1 card" : `${filteredThoughts.length} cards`}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/dashboard?vis=active${activeTag ? `&tag=${encodeURIComponent(activeTag)}` : ""}`}
                className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${
                  visibility === "active"
                    ? "bg-emerald-950 text-emerald-50"
                    : "border border-emerald-950/10 bg-white/70 text-emerald-950 hover:bg-white"
                }`}
              >
                Active
              </Link>
              <Link
                href={`/dashboard?vis=hidden${activeTag ? `&tag=${encodeURIComponent(activeTag)}` : ""}`}
                className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${
                  visibility === "hidden"
                    ? "bg-emerald-950 text-emerald-50"
                    : "border border-emerald-950/10 bg-white/70 text-emerald-950 hover:bg-white"
                }`}
              >
                Hidden
              </Link>
              <Link
                href={`/dashboard?vis=all${activeTag ? `&tag=${encodeURIComponent(activeTag)}` : ""}`}
                className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${
                  visibility === "all"
                    ? "bg-emerald-950 text-emerald-50"
                    : "border border-emerald-950/10 bg-white/70 text-emerald-950 hover:bg-white"
                }`}
              >
                All
              </Link>
            </div>
          </div>

          {filteredThoughts.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/60 p-8 text-center text-stone-600 sm:p-10">
              <p className="font-[family:var(--font-display)] text-2xl text-stone-900 sm:text-3xl">
                {activeTag ? "No cards match this tag." : "No cards yet."}
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredThoughts.map((thought: DashboardThought) => (
                <article
                  key={thought.id}
                  className="flex aspect-square flex-col rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.08)] sm:p-6"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                    <span className="truncate">{thought.category}</span>
                    <span className="whitespace-nowrap">Mood {thought.mood}/10</span>
                  </div>
                  <h3 className="mt-3 font-[family:var(--font-display)] text-2xl leading-tight text-stone-900 sm:text-[1.65rem]">
                    {thought.title}
                  </h3>
                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-stone-700">
                    {thought.summary}
                  </p>
                  {thought.body || thought.linked_idea_text || thought.insight_reflection ? (
                    <details className="mt-3 rounded-2xl border border-emerald-950/10 bg-white/50 p-3">
                      <summary className="cursor-pointer text-[11px] uppercase tracking-[0.14em] text-emerald-900/75">
                        Open full note
                      </summary>
                      {thought.body ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                          {thought.body}
                        </p>
                      ) : null}
                      {thought.linked_idea_text ? (
                        <p className="mt-3 text-xs uppercase tracking-[0.14em] text-amber-900/75">
                          {thought.linked_book_title ? `${thought.linked_book_title} - ` : ""}
                          {thought.linked_idea_text}
                        </p>
                      ) : null}
                      {thought.insight_reflection ? (
                        <p className="mt-3 text-sm leading-6 text-stone-700">
                          {thought.insight_reflection}
                        </p>
                      ) : null}
                    </details>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                    {thought.tags.map((tag) => (
                      <Link
                        key={`${thought.id}-${tag}`}
                        href={`/dashboard?tag=${encodeURIComponent(tag)}`}
                        className="rounded-full border border-emerald-950/10 bg-white/60 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.12em] text-emerald-950 transition hover:bg-white"
                      >
                        {tag}
                      </Link>
                    ))}
                    {thought.concept_tags.map((tag) => (
                      <span
                        key={`${thought.id}-concept-${tag}`}
                        className="rounded-full border border-amber-900/10 bg-amber-50/70 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.12em] text-amber-900"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                    {toColomboDate(thought.created_at)}
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    <Link
                      href={`/dashboard?edit=${thought.id}`}
                      className="inline-flex flex-1 justify-center rounded-full border border-emerald-950/10 bg-white/60 px-2 py-1.5 text-[11px] uppercase tracking-[0.08em] text-emerald-950 transition hover:bg-white"
                    >
                      Edit
                    </Link>
                    {thought.is_hidden ? (
                      <form action={unhideThoughtAction} className="flex-1">
                        <input type="hidden" name="thoughtId" value={thought.id} />
                        <button
                          type="submit"
                          disabled={!databaseAvailable}
                          className="inline-flex w-full justify-center rounded-full border border-cyan-950/10 bg-cyan-50/90 px-2 py-1.5 text-[11px] uppercase tracking-[0.08em] text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Restore
                        </button>
                      </form>
                    ) : (
                      <form action={hideThoughtAction} className="flex-1">
                        <input type="hidden" name="thoughtId" value={thought.id} />
                        <button
                          type="submit"
                          disabled={!databaseAvailable}
                          className="inline-flex w-full justify-center rounded-full border border-amber-900/10 bg-amber-50/90 px-2 py-1.5 text-[11px] uppercase tracking-[0.08em] text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Hide
                        </button>
                      </form>
                    )}
                    <form action={deleteThoughtAction} className="flex-1">
                      <input type="hidden" name="thoughtId" value={thought.id} />
                      <button
                        type="submit"
                        disabled={!databaseAvailable}
                        className="inline-flex w-full justify-center rounded-full border border-rose-900/10 bg-rose-50/90 px-2 py-1.5 text-[11px] uppercase tracking-[0.08em] text-rose-900 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
