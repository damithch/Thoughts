"use client";
import React, { useState } from "react";

type SmartCaptureResult = {
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

export function SmartCapture() {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);

  async function handleAutoFill() {
    setError(null);
    setFilled(false);

    if (!rawText.trim()) {
      setError("Paste or type your journal entry first.");
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
        throw new Error(
          (errorData as any).error ?? `Request failed: ${response.status}`,
        );
      }

      const result: SmartCaptureResult = await response.json();

      // Populate the thought form using DOM API
      populateThoughtForm(result);
      setFilled(true);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function populateThoughtForm(data: SmartCaptureResult) {
    // Find the thought form — it's the form containing an input[name="title"]
    const titleInput = document.querySelector<HTMLInputElement>(
      'form input[name="title"]',
    );
    if (!titleInput) return;

    const form = titleInput.closest("form");
    if (!form) return;

    // Helper to set a form field value and trigger React-compatible events
    function setFieldValue(name: string, value: string) {
      const element = form!.elements.namedItem(name) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | null;

      if (!element) return;

      // Use native setter to bypass React's synthetic event system
      const nativeInputValueSetter =
        Object.getOwnPropertyDescriptor(
          element instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : element instanceof HTMLSelectElement
              ? window.HTMLSelectElement.prototype
              : window.HTMLInputElement.prototype,
          "value",
        )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
      } else {
        element.value = value;
      }

      // Dispatch events so the browser and any listeners pick up the change
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setFieldValue("title", data.title);
    setFieldValue("category", data.category);
    setFieldValue("mood", String(data.mood));
    setFieldValue("tags", data.tags.join(", "));
    setFieldValue("conceptTags", data.conceptTags.join(", "));
    setFieldValue("summary", data.summary);
    setFieldValue("body", data.body);
    setFieldValue("insightReflection", data.insightReflection);

    if (data.linkedBookIdeaId !== null) {
      setFieldValue("bookIdeaId", String(data.linkedBookIdeaId));
    }

    // Scroll the form into view so the user can review
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 sm:mt-0">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Form filled — review below
          </span>
        ) : null}
      </div>

      <textarea
        className="mt-3 w-full resize-y rounded-xl border border-purple-950/10 bg-purple-50/40 px-4 py-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-purple-600"
        rows={5}
        value={rawText}
        onChange={(e) => {
          setRawText(e.target.value);
          setFilled(false);
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
          disabled={loading || !rawText.trim()}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing…
            </span>
          ) : (
            "Auto-Fill ✨"
          )}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default SmartCapture;
