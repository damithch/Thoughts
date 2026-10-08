import Image from "next/image";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const workflows = [
  {
    step: "01",
    title: "Capture.",
    text: "Write thought cards, or paste raw text and let AI fill in the fields for you.",
  },
  {
    step: "02",
    title: "Execute.",
    text: "Plan the day, keep routines, and drop one true sentence as a daily anchor.",
  },
  {
    step: "03",
    title: "Reflect.",
    text: "Review moods, completion trends and behavioural exercises over time.",
  },
  {
    step: "04",
    title: "Connect.",
    text: "Search your whole archive by meaning and ask questions grounded in what you wrote.",
  },
];

// Sample month strip for the "at a glance" preview. Tier 1-4 maps to mood (low to high).
const sampleDays: Array<{
  day: number;
  tier: 0 | 1 | 2 | 3 | 4;
  cards: number;
  isToday?: boolean;
  isFuture?: boolean;
}> = [
  { day: 1, tier: 3, cards: 2 },
  { day: 2, tier: 3, cards: 1 },
  { day: 3, tier: 1, cards: 3 },
  { day: 4, tier: 0, cards: 0 },
  { day: 5, tier: 2, cards: 2 },
  { day: 6, tier: 4, cards: 1 },
  { day: 7, tier: 3, cards: 2 },
  { day: 8, tier: 3, cards: 1, isToday: true },
  { day: 9, tier: 0, cards: 0, isFuture: true },
  { day: 10, tier: 0, cards: 0, isFuture: true },
  { day: 11, tier: 0, cards: 0, isFuture: true },
  { day: 12, tier: 0, cards: 0, isFuture: true },
  { day: 13, tier: 0, cards: 0, isFuture: true },
  { day: 14, tier: 0, cards: 0, isFuture: true },
];

const tierClassNames: Record<number, string> = {
  1: "border-emerald-900/20 bg-emerald-100/75",
  2: "border-emerald-900/20 bg-emerald-200/75",
  3: "border-emerald-900/20 bg-emerald-300/65",
  4: "border-emerald-900/20 bg-emerald-400/60",
};

export default async function Home() {
  const currentUser = await getCurrentUser();
  const primaryButtonClassName =
    "inline-flex min-h-14 w-full items-center justify-center rounded-full border border-transparent bg-emerald-950 px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-emerald-50 shadow-[0_14px_28px_rgba(6,78,59,0.22)] transition-all hover:-translate-y-0.5 hover:bg-emerald-800 sm:w-auto";
  const secondaryButtonClassName =
    "inline-flex min-h-14 w-full items-center justify-center rounded-full border border-white/70 bg-white/70 px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-emerald-950 transition-all hover:-translate-y-0.5 hover:bg-white sm:w-auto";
  const topPillClassName =
    "inline-flex items-center rounded-full border border-emerald-950/10 bg-white/55 px-4 py-2.5 text-xs uppercase tracking-[0.14em] text-emerald-950 transition hover:bg-white";
  const floatingChipClassName =
    "absolute inline-flex items-center gap-2 rounded-full border border-emerald-950/10 bg-white/80 px-4 py-2.5 text-[13px] text-emerald-950 shadow-[0_14px_30px_rgba(48,84,53,0.18)] backdrop-blur";

  return (
    <main className="thought-network-bg min-h-screen overflow-hidden px-4 pb-12 pt-6 text-stone-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-14">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="font-[family:var(--font-display)] text-3xl leading-none text-emerald-950"
          >
            Thoughts
          </Link>
          <nav aria-label="Account" className="flex items-center gap-3">
            {currentUser ? (
              <Link
                href="/dashboard"
                className={`${topPillClassName} border-transparent bg-emerald-950 text-emerald-50 hover:bg-emerald-800`}
              >
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className={topPillClassName}>
                  Login
                </Link>
                <Link
                  href="/register"
                  className={`${topPillClassName} border-transparent bg-emerald-950 text-emerald-50 hover:bg-emerald-800`}
                >
                  Create Account
                </Link>
              </>
            )}
          </nav>
        </header>

        {/* Hero */}
        <section className="flex flex-col items-center gap-10 md:flex-row md:gap-12">
          <div className="min-w-0 flex-1">
            <p className="text-sm uppercase tracking-[0.28em] text-emerald-800/80">
              Personal journal
            </p>
            <h1 className="mt-5 font-[family:var(--font-display)] text-5xl leading-[0.98] text-stone-900 sm:text-6xl lg:text-[5.25rem]">
              A quieter place for your ideas.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-stone-700 sm:text-lg">
              Write what happened, plan what is next, and see the shape of your
              days. Private, single-user, and entirely yours.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {currentUser ? (
                <Link href="/dashboard" className={primaryButtonClassName}>
                  Open Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/register" className={primaryButtonClassName}>
                    Create Account
                  </Link>
                  <Link href="/login" className={secondaryButtonClassName}>
                    Login
                  </Link>
                </>
              )}
            </div>
            <p className="mt-6 text-[13px] leading-5 text-stone-600">
              No feed, no followers. Just you and your own record.
            </p>
          </div>

          {/* Badge with floating chips */}
          <div className="relative h-[320px] w-[320px] shrink-0 md:h-[460px] md:w-[460px]">
            <svg
              className="absolute -inset-1.5 hidden h-[calc(100%+12px)] w-[calc(100%+12px)] md:block"
              viewBox="0 0 472 472"
              aria-hidden="true"
              focusable="false"
            >
              <circle
                cx="236"
                cy="236"
                r="232"
                fill="none"
                stroke="#065f46"
                strokeWidth="1.2"
                strokeDasharray="2 9"
                strokeLinecap="round"
                opacity="0.5"
              />
              <g fill="#065f46" opacity="0.5">
                <circle cx="236" cy="4" r="4" />
                <circle cx="468" cy="236" r="4" />
                <circle cx="68" cy="400" r="4" />
                <circle cx="400" cy="70" r="3" />
              </g>
            </svg>
            <div className="absolute inset-2 overflow-hidden rounded-full shadow-[0_30px_80px_rgba(6,78,59,0.28)] md:inset-2.5">
              {/* The source art is a wide illustration; scale it so the round badge fills the circle. */}
              <Image
                src="/logo.png"
                alt="The Thoughts badge: a head in profile with an open book and a star"
                fill
                priority
                sizes="(min-width: 768px) 440px, 304px"
                className="scale-[1.16] object-cover"
              />
            </div>
            <span className={`${floatingChipClassName} -left-6 top-[70px]`}>
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              Mood 7/10
            </span>
            <span className={`${floatingChipClassName} -right-5 top-[150px]`}>
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              4-day streak
            </span>
            <span className={`${floatingChipClassName} bottom-9 left-5`}>
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              One true sentence
            </span>
          </div>
        </section>

        {/* Four workflows */}
        <section>
          <p className="mb-4 text-xs uppercase tracking-[0.18em] text-emerald-800/70">
            What it does
          </p>
          <div className="grid overflow-hidden rounded-[2rem] bg-emerald-950 text-emerald-50 shadow-[0_26px_80px_rgba(25,55,30,0.22)] sm:rounded-[2.5rem] md:grid-cols-4">
            {workflows.map((item) => (
              <div
                key={item.step}
                className="border-t border-emerald-50/15 p-7 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">
                  {item.step}
                </p>
                <h2 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none">
                  {item.title}
                </h2>
                <p className="mt-4 text-sm leading-6 text-emerald-100/85">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Product peek */}
        <section className="rounded-[2rem] border border-emerald-950/10 bg-white/45 p-6 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur-md sm:rounded-[2.5rem] sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                Your month at a glance
              </p>
              <h2 className="mt-3 font-[family:var(--font-display)] text-4xl leading-[1.02] text-stone-900 sm:text-[2.75rem]">
                See the habit, not just the entries.
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-stone-700">
                Days shade by mood, dots count your cards, and missed days stay
                visible without scolding you.
              </p>
              <div className="mt-6 grid grid-cols-7 gap-2" aria-hidden="true">
                {sampleDays.map((item) => (
                  <div
                    key={item.day}
                    className={`flex aspect-square flex-col justify-between rounded-[14px] border p-2 text-xs font-semibold text-emerald-950 ${
                      item.isFuture
                        ? "border-stone-900/5 bg-white/20 text-stone-500"
                        : item.tier === 0
                          ? "border-dashed border-stone-900/20 bg-white/35 text-stone-600"
                          : tierClassNames[item.tier]
                    } ${item.isToday ? "ring-2 ring-emerald-800" : ""}`}
                  >
                    <span>{item.day}</span>
                    <span className="flex gap-[3px]">
                      {Array.from({ length: item.cards }).map((_, dotIndex) => (
                        <i
                          key={dotIndex}
                          className="h-1.5 w-1.5 rounded-full bg-emerald-950"
                        />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid min-w-0 gap-4 lg:w-[340px] lg:shrink-0">
              <article className="rounded-[1.75rem] border border-emerald-950/10 bg-white/50 p-6">
                <div className="flex justify-between text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  <span>Work</span>
                  <span>Mood 7/10</span>
                </div>
                <h3 className="mt-3 font-[family:var(--font-display)] text-[1.65rem] leading-[1.15] text-stone-900">
                  Shipped the first dashboard pass
                </h3>
                <p className="mt-3 text-sm leading-[1.4rem] text-stone-700">
                  Calendar and stats working end to end. Steady rather than
                  rushed.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {["work", "focus"].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-emerald-950/10 bg-white/60 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.12em] text-emerald-950"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
              <article className="rounded-[1.75rem] border border-emerald-950/10 bg-white/50 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
                  Daily anchor
                </p>
                <p className="mt-2.5 font-[family:var(--font-display)] text-[1.375rem] leading-7 text-stone-900">
                  What stayed true about you today?
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="py-4 text-center">
          <h2 className="font-[family:var(--font-display)] text-4xl leading-none text-stone-900 sm:text-5xl">
            Start with one true sentence.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-7 text-stone-700">
            It takes a minute, and it is yours.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            {currentUser ? (
              <Link href="/dashboard" className={primaryButtonClassName}>
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link href="/register" className={primaryButtonClassName}>
                  Create Account
                </Link>
                <Link href="/login" className={secondaryButtonClassName}>
                  Login
                </Link>
              </>
            )}
          </div>
        </section>

        <footer className="flex flex-wrap justify-between gap-3 text-xs uppercase tracking-[0.14em] text-stone-600">
          <span>Thoughts</span>
          <span>A private journal and daily operating system</span>
        </footer>
      </div>
    </main>
  );
}
