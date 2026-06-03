"use client";

import { useEffect, useState } from "react";

type ToastProps = {
  message: string;
  tone?: "success" | "error" | "info";
};

const toneClassNames: Record<NonNullable<ToastProps["tone"]>, string> = {
  success: "border-emerald-800/15 bg-emerald-50/95 text-emerald-950",
  error: "border-rose-700/15 bg-rose-50/95 text-rose-950",
  info: "border-stone-900/10 bg-white/95 text-stone-900",
};

export function Toast({ message, tone = "info" }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
      <div
        className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-3xl border px-4 py-4 shadow-[0_20px_60px_rgba(36,27,20,0.16)] backdrop-blur ${toneClassNames[tone]}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.22em] opacity-70">
            {tone}
          </p>
          <p className="mt-1 text-sm leading-6">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-full border border-current/10 px-2 py-1 text-xs uppercase tracking-[0.18em] opacity-70 transition hover:opacity-100"
          aria-label="Dismiss notification"
        >
          Close
        </button>
      </div>
    </div>
  );
}
