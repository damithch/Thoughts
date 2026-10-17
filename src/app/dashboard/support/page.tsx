import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions";
import { Toast } from "@/app/components/toast";
import { Breather } from "@/app/dashboard/support/_components/breather";
import { BasicsCheck, StepsList } from "@/app/dashboard/support/_components/support-checklists";
import { dismissSupportAction, saveSupportPlanAction } from "@/app/dashboard/support/actions";
import { getCurrentUser } from "@/lib/auth";
import { SUPPORT_LIMITS } from "@/lib/db";
import { getSupportOverview } from "@/lib/support";
import { smsHref, supportHeadline, telHref, urgentLine } from "@/lib/support-copy";

export const dynamic = "force-dynamic";

type SupportPageProps = {
  searchParams?: Promise<{ toast?: string; type?: "success" | "error" | "info" }>;
};

const card =
  "rounded-[1.75rem] border border-emerald-950/10 bg-white/60 p-5 shadow-[0_20px_60px_rgba(48,84,53,0.08)] backdrop-blur sm:p-6";
const eyebrow = "text-xs uppercase tracking-[0.2em] text-emerald-800/70";
const heading = "mt-2 font-[family:var(--font-display)] text-2xl text-stone-900";
const input =
  "w-full rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 text-sm outline-none transition focus:border-emerald-700";

export default async function SupportPage({ searchParams }: SupportPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const toastMessage = params?.toast === "plan_saved" ? "Your plan is saved." : params?.toast;
  const { status, today, plan } = await getSupportOverview(currentUser.id);
  const { title, body } = supportHeadline(status);
  const contactSlots = Array.from({ length: SUPPORT_LIMITS.contacts }, (_, index) => plan.contacts[index] ?? { name: "", phone: "" });

  return (
    <main className="thought-network-bg min-h-screen overflow-hidden px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      {toastMessage ? <Toast message={toastMessage} tone={params?.type} /> : null}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-[2rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur-md sm:rounded-[2.5rem] sm:p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className={eyebrow}>Support</p>
              <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none sm:text-5xl">{title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-700">{body}</p>
              {status.active ? (
                <form action={dismissSupportAction} className="mt-4">
                  <input type="hidden" name="back" value="/dashboard" />
                  <button type="submit" className="text-sm text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline">
                    I&apos;m okay for now
                  </button>
                </form>
              ) : null}
            </div>
            <nav aria-label="Other sections" className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap">
              <Link href="/dashboard" className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white">
                Journal
              </Link>
              <Link href="/dashboard/tasks" className="rounded-full border border-emerald-950/10 px-4 py-3 text-center text-emerald-950 transition-colors hover:bg-white">
                Tasks
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="w-full rounded-full bg-emerald-950 px-4 py-3 text-emerald-50 transition-colors hover:bg-emerald-800">
                  Logout
                </button>
              </form>
            </nav>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="grid content-start gap-6">
            <section className={card}>
              <p className={eyebrow}>First</p>
              <h2 className={heading}>The basics</h2>
              <p className="mt-2 text-sm leading-6 text-stone-700">Hunger, tiredness and being alone make hard moments harder.</p>
              <div className="mt-4">
                <BasicsCheck initial={{ ate: today.ate, slept: today.slept, connected: today.connected }} />
              </div>
            </section>

            <section id="breathe" className={card}>
              <p className={eyebrow}>Breathe</p>
              <h2 className={heading}>Slow it down</h2>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                Follow the circle. A minute or more ticks off today&apos;s breathing habit.
                {today.breathingSeconds > 0 ? ` ${Math.round(today.breathingSeconds / 60)} min so far today.` : ""}
              </p>
              <div className="mt-5">
                <Breather />
              </div>
            </section>

            <section className={card}>
              <p className={eyebrow}>What helps you</p>
              <h2 className={heading}>Your steps</h2>
              <div className="mt-4">
                <StepsList steps={plan.copingSteps} initialTried={today.stepsTried} />
              </div>
            </section>
          </div>

          <div className="grid content-start gap-6">
            <section className={card}>
              <p className={eyebrow}>Reach out</p>
              <h2 className={heading}>You don&apos;t have to hold this alone</h2>
              <div className="mt-4 grid gap-3">
                {plan.contacts.length === 0 ? (
                  <p className="text-sm leading-6 text-stone-700">
                    Add your counsellor or someone you trust in <a href="#plan" className="text-emerald-800 underline">your plan</a>{" "}so they&apos;re one tap away.
                  </p>
                ) : null}
                {plan.contacts.map((contact) => (
                  <div key={`${contact.name}-${contact.phone}`} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-950/10 bg-white/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-stone-900">{contact.name}</p>
                      <p className="text-xs text-stone-600">{contact.phone}</p>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <a href={telHref(contact.phone)} className="rounded-full bg-emerald-950 px-3 py-2 text-emerald-50 hover:bg-emerald-800">Call</a>
                      <a href={smsHref(contact.phone)} className="rounded-full border border-emerald-950/15 px-3 py-2 text-emerald-950 hover:bg-white">Text</a>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-900/15 bg-[#FFF7EC] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-stone-900">{plan.helpline.name}</p>
                    <p className="text-xs text-stone-600">{plan.helpline.phone} · free, 24 hours</p>
                  </div>
                  <a href={telHref(plan.helpline.phone)} className="rounded-full bg-emerald-950 px-3 py-2 text-sm text-emerald-50 hover:bg-emerald-800">Call</a>
                </div>
                <p className="text-xs leading-5 text-stone-600">{urgentLine(plan.helpline.phone)}</p>
              </div>
            </section>

            <section id="plan" className={card}>
              <p className={eyebrow}>Set it up on a good day</p>
              <h2 className={heading}>Your plan</h2>
              <form action={saveSupportPlanAction} className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm text-stone-700">
                  <span className={eyebrow}>Steps that help (one per line)</span>
                  <textarea name="copingSteps" rows={6} defaultValue={plan.copingSteps.join("\n")} className={input} />
                  <span className="text-xs text-stone-500">Up to {SUPPORT_LIMITS.steps} short steps.</span>
                </label>

                <div className="grid gap-2">
                  <span className={eyebrow}>People to reach</span>
                  {contactSlots.map((contact, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr] gap-2">
                      <input name={`contactName${index}`} defaultValue={contact.name} placeholder={index === 0 ? "Counsellor" : "Name"} className={input} />
                      <input name={`contactPhone${index}`} defaultValue={contact.phone} placeholder="07X XXX XXXX" inputMode="tel" className={input} />
                    </div>
                  ))}
                  <span className="text-xs text-stone-500">Stored only in your Thoughts account.</span>
                </div>

                <div className="grid grid-cols-[1fr_8rem] gap-2">
                  <label className="grid gap-2 text-sm text-stone-700">
                    <span className={eyebrow}>Helpline</span>
                    <input name="helplineName" defaultValue={plan.helpline.name} className={input} />
                  </label>
                  <label className="grid gap-2 text-sm text-stone-700">
                    <span className={eyebrow}>Number</span>
                    <input name="helplinePhone" defaultValue={plan.helpline.phone} inputMode="tel" className={input} />
                  </label>
                </div>

                <label className="flex items-center gap-3 text-sm text-stone-700">
                  <input type="checkbox" name="enabled" defaultChecked={plan.enabled} className="h-4 w-4 accent-emerald-800" />
                  Show the support card on rough days
                </label>

                <button type="submit" className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800">
                  Save plan
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
