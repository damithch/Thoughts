import Link from "next/link";

import { Toast } from "@/app/components/toast";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    token?: string;
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

const resetMessages: Record<string, string> = {
  invalid_link: "The password reset link is invalid.",
  invalid_password: "Use a password with at least 8 characters and ensure both entries match.",
  invalid_or_expired: "This password reset link is invalid, expired, or already used.",
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = params?.token?.trim() ?? "";
  const toastCode = params?.toast;
  const toastMessage = toastCode ? resetMessages[toastCode] : undefined;

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-6 py-10 text-stone-900">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type ?? "error"} /> : null}
      <div className="mx-auto max-w-xl rounded-[2.5rem] border border-emerald-950/10 bg-white/70 p-8 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur">
        <p className="text-sm uppercase tracking-[0.28em] text-emerald-800/70">Password reset</p>
        <h1 className="mt-4 font-[family:var(--font-display)] text-5xl leading-none">Set a new password.</h1>
        <p className="mt-5 text-base leading-8 text-stone-700">
          Choose a new password with at least 8 characters.
        </p>

        {token ? (
          <form action="/api/auth/reset-password" method="post" className="mt-8 grid gap-5">
            <input type="hidden" name="token" value={token} />

            <label className="grid gap-2 text-sm text-stone-700">
              <span className="uppercase tracking-[0.18em] text-emerald-800/70">New password</span>
              <input
                type="password"
                name="password"
                minLength={8}
                required
                className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
              />
            </label>

            <label className="grid gap-2 text-sm text-stone-700">
              <span className="uppercase tracking-[0.18em] text-emerald-800/70">Confirm password</span>
              <input
                type="password"
                name="confirmPassword"
                minLength={8}
                required
                className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
              />
            </label>

            <button
              type="submit"
              className="mt-2 rounded-full bg-emerald-950 px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-white shadow-[0_14px_28px_rgba(6,78,59,0.22)] transition hover:bg-emerald-800"
            >
              Update Password
            </button>
          </form>
        ) : (
          <p className="mt-8 rounded-2xl border border-amber-600/20 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            This reset link is incomplete. Request a new password reset email.
          </p>
        )}

        <p className="mt-6 text-sm text-stone-600">
          Need a new link?{" "}
          <Link href="/forgot-password" className="font-medium text-emerald-950">
            Request password reset
          </Link>
        </p>
      </div>
    </main>
  );
}
