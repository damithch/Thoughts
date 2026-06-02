const thoughts = [
  {
    title: "Small Rituals",
    category: "Morning note",
    excerpt:
      "A cup of tea, ten quiet minutes, and a single sentence can set the tone for an entire day.",
  },
  {
    title: "City Fragments",
    category: "Observation",
    excerpt:
      "Every street has its own rhythm. Some rush, some linger, and some feel like a memory you walked into.",
  },
  {
    title: "Unfinished Ideas",
    category: "Draft",
    excerpt:
      "Not every thought needs a conclusion. Some are more useful when they stay open and keep pulling you back.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#f7efe3_0%,#efe2d0_35%,#e3d0bb_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/65 p-8 shadow-[0_20px_60px_rgba(86,58,34,0.12)] backdrop-blur md:p-12">
          <p className="text-sm uppercase tracking-[0.28em] text-stone-500">
            Personal journal
          </p>
          <div className="mt-6 grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <h1 className="font-[family:var(--font-display)] text-5xl leading-none md:text-7xl">
                Thoughts worth keeping should feel easy to revisit.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-stone-700 md:text-lg">
                Start collecting your ideas, memories, and short reflections as
                visual cards. This homepage is ready to evolve into your journal.
              </p>
            </div>
            <div className="rounded-[1.75rem] bg-stone-900 p-6 text-stone-100">
              <p className="text-sm uppercase tracking-[0.24em] text-stone-400">
                Today&apos;s note
              </p>
              <p className="mt-4 font-[family:var(--font-display)] text-3xl leading-tight">
                Some thoughts arrive complete. Most become meaningful after you
                return to them.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {thoughts.map((thought, index) => (
            <article
              key={thought.title}
              className="group rounded-[1.75rem] border border-stone-900/10 bg-white/80 p-6 shadow-[0_18px_40px_rgba(86,58,34,0.08)] transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-stone-500">
                <span>{thought.category}</span>
                <span>0{index + 1}</span>
              </div>
              <h2 className="mt-6 font-[family:var(--font-display)] text-4xl leading-none text-stone-900">
                {thought.title}
              </h2>
              <p className="mt-4 text-base leading-7 text-stone-700">
                {thought.excerpt}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
