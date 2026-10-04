import Link from "next/link";

import { Toast } from "@/app/components/toast";

export const dynamic = "force-dynamic";

type ForgotPasswordPageProps = {
  searchParams?: Promise<{
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

const forgotMessages: Record<string, string> = {
  requested:
    "If an account exists for that email, you will receive password reset instructions shortly.",
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const toastCode = params?.toast;
  const toastMessage = toastCode ? forgotMessages[toastCode] : undefined;

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-6 py-10 text-stone-900">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type ?? "info"} /> : null}
      <div className="mx-auto max-w-xl rounded-[2.5rem] border border-emerald-950/10 bg-white/70 p-8 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur">
        <p className="text-sm uppercase tracking-[0.28em] text-emerald-800/70">Password reset</p>
        <h1 className="mt-4 font-[family:var(--font-display)] text-5xl leading-none">Forgot password?</h1>
        <p className="mt-5 text-base leading-8 text-stone-700">
          Enter your account email and we&apos;ll send a reset link if the address is registered.
        </p>

        <form action="/api/auth/forgot-password" method="post" className="mt-8 grid gap-5">
          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-emerald-800/70">Email</span>
            <input
              type="email"
              name="email"
              required
              className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
            />
          </label>

          <button
            type="submit"
            className="mt-2 rounded-full bg-emerald-950 px-5 py-3 text-sm font-medium uppercase tracking-[0.16em] text-white shadow-[0_14px_28px_rgba(6,78,59,0.22)] transition hover:bg-emerald-800"
          >
            Send Reset Link
          </button>
        </form>

        <p className="mt-6 text-sm text-stone-600">
          Remembered your password?{" "}
          <Link href="/login" className="font-medium text-emerald-950">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
