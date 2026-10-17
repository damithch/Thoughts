import Link from "next/link";

import { dismissSupportAction } from "@/app/dashboard/support/actions";
import type { RoughPatchStatus } from "@/lib/rough-patch";
import { supportHeadline } from "@/lib/support-copy";

// Shown at the top of the Journal and Tasks pages during a rough patch.
export function SupportCard({ status, back }: { status: RoughPatchStatus; back: string }) {
  if (!status.active) {
    return null;
  }

  const { title, body } = supportHeadline(status);

  return (
    <section
      aria-label="Support"
      className="rounded-[1.75rem] border border-amber-900/10 bg-[#FFF7EC]/90 p-5 shadow-[0_20px_60px_rgba(120,80,30,0.10)] sm:p-6"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-amber-900/70">Go gently</p>
      <h2 className="mt-2 font-[family:var(--font-display)] text-2xl text-stone-900 sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-700">{body}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/dashboard/support"
          className="rounded-full bg-emerald-950 px-4 py-2.5 text-emerald-50 transition hover:bg-emerald-800"
        >
          Open my support plan
        </Link>
        <Link
          href="/dashboard/support#breathe"
          className="rounded-full border border-emerald-950/15 bg-white/70 px-4 py-2.5 text-emerald-950 transition hover:bg-white"
        >
          Breathe for 2 minutes
        </Link>
        <form action={dismissSupportAction}>
          <input type="hidden" name="back" value={back} />
          <button
            type="submit"
            className="rounded-full px-4 py-2.5 text-stone-600 underline-offset-4 transition hover:text-stone-900 hover:underline"
          >
            I&apos;m okay for now
          </button>
        </form>
      </div>
    </section>
  );
}
