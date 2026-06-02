import Link from "next/link";

import { loginAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

const loginMessages: Record<string, string> = {
  credentials: "Email or password is incorrect.",
  db: "The database is unavailable right now. Try again in a moment.",
  invalid: "Enter both email and password.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    return (
      <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-6 py-10 text-stone-900">
        <div className="mx-auto max-w-xl rounded-[2.5rem] border border-emerald-950/10 bg-white/70 p-8 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur">
          <p className="text-sm uppercase tracking-[0.28em] text-emerald-800/70">
            Already signed in
          </p>
          <h1 className="mt-4 font-[family:var(--font-display)] text-5xl leading-none">
            Welcome back, {currentUser.name}.
          </h1>
          <p className="mt-5 text-base leading-8 text-stone-700">
            Your session is active. Go back to the journal to add thoughts.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800"
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const errorMessage = params?.error ? loginMessages[params.error] : undefined;

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto max-w-xl rounded-[2.5rem] border border-emerald-950/10 bg-white/70 p-8 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur">
        <p className="text-sm uppercase tracking-[0.28em] text-emerald-800/70">
          Login
        </p>
        <h1 className="mt-4 font-[family:var(--font-display)] text-5xl leading-none">
          Enter your journal.
        </h1>
        <p className="mt-5 text-base leading-8 text-stone-700">
          Sign in to create and manage thought cards.
        </p>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-700/10 bg-rose-100/80 px-4 py-3 text-sm text-rose-950">
            {errorMessage}
          </div>
        ) : null}

        <form action={loginAction} className="mt-8 grid gap-5">
          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-emerald-800/70">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
            />
          </label>

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-emerald-800/70">
              Password
            </span>
            <input
              type="password"
              name="password"
              minLength={8}
              required
              className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
            />
          </label>

          <button
            type="submit"
            className="mt-2 rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800"
          >
            Login
          </button>
        </form>

        <p className="mt-6 text-sm text-stone-600">
          New here?{" "}
          <Link href="/register" className="font-medium text-emerald-950">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
