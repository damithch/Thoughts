"use client";
import React, { useState, useEffect, useRef } from "react";

export type SmartCaptureResult = {
  title: string;
  category: string;
  mood: number;
  tags: string[];
  conceptTags: string[];
  summary: string;
  body: string;
  linkedBookIdeaId: number | null;
  insightReflection: string;
};

type ErrorType = "rate_limit" | "token_exceeded" | "auth_error" | "api_error" | "parse_error" | "overloaded";

type SmartCaptureError = {
  message: string;
  errorType: ErrorType;
};

const ERROR_CONFIG: Record<ErrorType, { icon: string; title: string; hint: string; color: string }> = {
  rate_limit: {
    icon: "⏳",
    title: "Rate limit reached",
    hint: "The Gemini API has a usage limit. Wait a moment and try again.",
    color: "amber",
  },
  overloaded: {
    icon: "🔥",
    title: "Model under high demand",
    hint: "The Gemini model is temporarily overloaded. This usually resolves within a minute. Try again shortly, or switch to a different model in Settings.",
    color: "amber",
  },
  token_exceeded: {
    icon: "📏",
    title: "Input too long",
    hint: "Your text exceeds the model's token limit. Try shortening it or splitting into two entries.",
    color: "orange",
  },
  auth_error: {
    icon: "🔑",
    title: "API key issue",
    hint: "Your Gemini API key may be invalid or expired. Check the key in your .env.local file.",
    color: "red",
  },
  api_error: {
    icon: "⚠️",
    title: "AI service error",
    hint: "The Gemini API returned an unexpected error. This is usually temporary — try again in a few seconds.",
    color: "red",
  },
  parse_error: {
    icon: "🔄",
    title: "Unexpected response",
    hint: "The AI returned a response that couldn't be parsed. Try submitting again.",
    color: "purple",
  },
};

type SmartCaptureProps = {
  onAutoFill?: (result: SmartCaptureResult) => void;
};

export function SmartCapture({ onAutoFill }: SmartCaptureProps) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SmartCaptureError | null>(null);
  const [filled, setFilled] = useState(false);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up countdown timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    };
  }, []);

  function startRetryCountdown(seconds: number) {
    setRetryCountdown(seconds);
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    retryTimerRef.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          if (retryTimerRef.current) clearInterval(retryTimerRef.current);
          retryTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleAutoFill() {
    setError(null);
    setFilled(false);
    setModelUsed(null);

    if (!rawText.trim()) {
      setError({ message: "Paste or type your journal entry first.", errorType: "api_error" });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/smart-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorType: ErrorType = (errorData as any).errorType ?? "api_error";
        const message: string =
          (errorData as any).error ?? `Request failed: ${response.status}`;

        setError({ message, errorType });

        // Start countdown for rate-limit and overload errors
        if (errorType === "rate_limit") {
          startRetryCountdown(60);
        } else if (errorType === "overloaded") {
          startRetryCountdown(30);
        }
        return;
      }

      const data = await response.json();
      const result: SmartCaptureResult = data;

      // Pass the structured result to the parent via callback
      if (onAutoFill) {
        onAutoFill(result);
      }
      setFilled(true);
      setModelUsed(data.modelUsed ?? null);
    } catch (e: any) {
      setError({
        message: String(e?.message ?? e),
        errorType: "api_error",
      });
    } finally {
      setLoading(false);
    }
  }

  const errorConfig = error ? ERROR_CONFIG[error.errorType] : null;

  return (
    <div className="rounded-[1.75rem] border border-purple-950/10 bg-white/72 p-4 shadow-[0_20px_50px_rgba(88,48,120,0.08)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-purple-800/70">
            Smart Capture
          </p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Paste raw text and let AI auto-fill the thought card fields.
          </p>
        </div>
        {filled ? (
          <div className="mt-2 flex flex-col items-end gap-1 sm:mt-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Form filled — review below
            </span>
            {modelUsed ? (
              <span className="text-[10px] text-stone-400">
                via {modelUsed}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <textarea
        className="mt-3 w-full resize-y rounded-xl border border-purple-950/10 bg-purple-50/40 px-4 py-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-purple-600"
        rows={5}
        value={rawText}
        onChange={(e) => {
          setRawText(e.target.value);
          setFilled(false);
          if (error) {
            setError(null);
            setRetryCountdown(0);
            if (retryTimerRef.current) {
              clearInterval(retryTimerRef.current);
              retryTimerRef.current = null;
            }
          }
        }}
        placeholder="Today I realized that I've been putting off the hard conversations at work. The anxiety peaks right before meetings but once I'm in them it's usually fine. I think this connects to what I read in Atomic Habits about starting small — just showing up is the hardest part…"
      />

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-stone-500">
          {rawText.length > 0 ? `${rawText.length.toLocaleString()} characters` : "Supports up to 10,000 characters"}
        </p>
        <button
          className="rounded-full bg-purple-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300"
          onClick={handleAutoFill}
          disabled={loading || !rawText.trim() || retryCountdown > 0}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing…
            </span>
          ) : retryCountdown > 0 ? (
            `Retry in ${retryCountdown}s`
          ) : (
            "Auto-Fill ✨"
          )}
        </button>
      </div>

      {error && errorConfig ? (
        <div
          className={`mt-3 rounded-xl border px-4 py-3 ${
            errorConfig.color === "amber"
              ? "border-amber-200 bg-amber-50"
              : errorConfig.color === "orange"
                ? "border-orange-200 bg-orange-50"
                : errorConfig.color === "purple"
                  ? "border-purple-200 bg-purple-50"
                  : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-base leading-none">{errorConfig.icon}</span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-semibold ${
                  errorConfig.color === "amber"
                    ? "text-amber-900"
                    : errorConfig.color === "orange"
                      ? "text-orange-900"
                      : errorConfig.color === "purple"
                        ? "text-purple-900"
                        : "text-red-900"
                }`}
              >
                {errorConfig.title}
              </p>
              <p
                className={`mt-1 text-sm leading-relaxed ${
                  errorConfig.color === "amber"
                    ? "text-amber-800"
                    : errorConfig.color === "orange"
                      ? "text-orange-800"
                      : errorConfig.color === "purple"
                        ? "text-purple-800"
                        : "text-red-800"
                }`}
              >
                {errorConfig.hint}
              </p>
              {error.message !== errorConfig.hint && error.message !== errorConfig.title ? (
                <p
                  className={`mt-1.5 text-xs leading-relaxed opacity-70 ${
                    errorConfig.color === "amber"
                      ? "text-amber-700"
                      : errorConfig.color === "orange"
                        ? "text-orange-700"
                        : errorConfig.color === "purple"
                          ? "text-purple-700"
                          : "text-red-700"
                  }`}
                >
                  Details: {error.message}
                </p>
              ) : null}
              {error.errorType === "rate_limit" && retryCountdown > 0 ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-200">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${((60 - retryCountdown) / 60) * 100}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs font-medium text-amber-700">
                    {retryCountdown}s
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SmartCapture;
