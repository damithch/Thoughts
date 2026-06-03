import Link from "next/link";

import { registerAction } from "@/app/actions";
import { Toast } from "@/app/components/toast";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RegisterPageProps = {
  searchParams?: Promise<{
    error?: string;
    toast?: string;
    type?: "success" | "error" | "info";
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
      <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-6 py-10 text-stone-900">
        <div className="mx-auto max-w-xl rounded-[2.5rem] border border-emerald-950/10 bg-white/70 p-8 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur">
          <p className="text-sm uppercase tracking-[0.28em] text-emerald-800/70">
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
            className="mt-8 inline-flex rounded-full bg-emerald-950 px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-white shadow-[0_14px_28px_rgba(6,78,59,0.22)] transition hover:bg-emerald-800"
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const toastCode = params?.toast ?? params?.error;
  const toastMessage = toastCode ? registerMessages[toastCode] : undefined;

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-6 py-10 text-stone-900">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type ?? "error"} /> : null}
      <div className="mx-auto max-w-xl rounded-[2.5rem] border border-emerald-950/10 bg-white/70 p-8 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur">
        <p className="text-sm uppercase tracking-[0.28em] text-emerald-800/70">
          Register
        </p>
        <h1 className="mt-4 font-[family:var(--font-display)] text-5xl leading-none">
          Create your account.
        </h1>
        <p className="mt-5 text-base leading-8 text-stone-700">
          Register once, then sign in to save your thoughts.
        </p>

        <form action={registerAction} className="mt-8 grid gap-5">
          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-emerald-800/70">
              Name
            </span>
            <input
              type="text"
              name="name"
              required
              className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
            />
          </label>

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
            className="mt-2 rounded-full bg-emerald-950 px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-white shadow-[0_14px_28px_rgba(6,78,59,0.22)] transition hover:bg-emerald-800"
          >
            Create Account
          </button>
        </form>

        <p className="mt-6 text-sm text-stone-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-emerald-950">
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}
