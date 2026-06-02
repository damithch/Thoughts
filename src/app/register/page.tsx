import Link from "next/link";

import { registerAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

type RegisterPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

const registerMessages: Record<string, string> = {
  db: "The database is unavailable right now. Try again in a moment.",
  exists: "An account with that email already exists.",
  failed: "The account could not be created.",
  invalid: "Enter a name, a valid email, and a password with at least 8 characters.",
};

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f7efe3_0%,#efe2d0_35%,#e3d0bb_100%)] px-6 py-10 text-stone-900">
        <div className="mx-auto max-w-xl rounded-[2rem] border border-stone-900/10 bg-white/80 p-8 shadow-[0_20px_60px_rgba(86,58,34,0.12)]">
          <p className="text-sm uppercase tracking-[0.28em] text-stone-500">
            Account ready
          </p>
          <h1 className="mt-4 font-[family:var(--font-display)] text-5xl leading-none">
            You&apos;re already registered.
          </h1>
          <p className="mt-5 text-base leading-8 text-stone-700">
            Return to the homepage and start writing.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-full bg-stone-900 px-5 py-3 text-sm uppercase tracking-[0.16em] text-stone-50 transition hover:bg-stone-700"
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const errorMessage = params?.error
    ? registerMessages[params.error]
    : undefined;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f7efe3_0%,#efe2d0_35%,#e3d0bb_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-stone-900/10 bg-white/80 p-8 shadow-[0_20px_60px_rgba(86,58,34,0.12)]">
        <p className="text-sm uppercase tracking-[0.28em] text-stone-500">
          Register
        </p>
        <h1 className="mt-4 font-[family:var(--font-display)] text-5xl leading-none">
          Create your account.
        </h1>
        <p className="mt-5 text-base leading-8 text-stone-700">
          Register once, then sign in to save your thoughts.
        </p>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-700/10 bg-rose-100/80 px-4 py-3 text-sm text-rose-950">
            {errorMessage}
          </div>
        ) : null}

        <form action={registerAction} className="mt-8 grid gap-5">
          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-stone-500">
              Name
            </span>
            <input
              type="text"
              name="name"
              required
              className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-500"
            />
          </label>

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-stone-500">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-500"
            />
          </label>

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-stone-500">
              Password
            </span>
            <input
              type="password"
              name="password"
              minLength={8}
              required
              className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-500"
            />
          </label>

          <button
            type="submit"
            className="mt-2 rounded-full bg-stone-900 px-5 py-3 text-sm uppercase tracking-[0.16em] text-stone-50 transition hover:bg-stone-700"
          >
            Create Account
          </button>
        </form>

        <p className="mt-6 text-sm text-stone-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-stone-900">
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}
