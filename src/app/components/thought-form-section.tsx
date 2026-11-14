"use client";

import React, { useRef, useState, useCallback } from "react";

import { SmartCapture, type SmartCaptureResult } from "@/app/components/smart-capture";
import { LiveRagContext } from "@/app/components/live-rag-context";
import SubmitButton from "@/app/components/submit-button";
import Link from "next/link";
import { EMOTIONS, LIFE_AREAS, THOUGHT_FIELD_LIMITS, type Emotion } from "@/lib/thought-fields";

type BookIdeaOption = {
  id: number;
  book_title: string;
  idea_text: string;
};

type EditingThought = {
  id: number;
  title: string;
  category: string;
  emotions: string[];
  life_area: string;
  trigger: string;
  mood: number;
  tags: string[];
  concept_tags: string[];
  summary: string;
  body: string;
  linked_book_idea_id: number | null;
  insight_reflection: string | null;
};

type ThoughtFormSectionProps = {
  editingThought: EditingThought | null;
  bookIdeas: BookIdeaOption[];
  databaseAvailable: boolean;
  createAction: (formData: FormData) => void;
  updateAction: (formData: FormData) => void;
};

export function ThoughtFormSection({
  editingThought,
  bookIdeas,
  databaseAvailable,
  createAction,
  updateAction,
}: ThoughtFormSectionProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [requestId] = useState(() =>
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );

  // Controlled form field state — initialized from editingThought or empty
  const [title, setTitle] = useState(editingThought?.title ?? "");
  const [emotions, setEmotions] = useState<string[]>(editingThought?.emotions ?? []);
  const [lifeArea, setLifeArea] = useState(editingThought?.life_area ?? "");
  const [trigger, setTrigger] = useState(editingThought?.trigger ?? "");
  const [mood, setMood] = useState(editingThought ? String(editingThought.mood) : "");
  const [tags, setTags] = useState(editingThought?.tags.join(", ") ?? "");
  const [conceptTags, setConceptTags] = useState(editingThought?.concept_tags.join(", ") ?? "");
  const [summary, setSummary] = useState(editingThought?.summary ?? "");
  const [body, setBody] = useState(editingThought?.body ?? "");
  const [insightReflection, setInsightReflection] = useState(editingThought?.insight_reflection ?? "");
  const [bookIdeaId, setBookIdeaId] = useState(
    editingThought?.linked_book_idea_id ? String(editingThought.linked_book_idea_id) : "",
  );

  // Smart Capture callback — populates all form fields via React state
  const handleAutoFill = useCallback((result: SmartCaptureResult) => {
    setTitle(result.title);
    setEmotions(result.emotions);
    setLifeArea(result.lifeArea);
    setTrigger(result.trigger);
    setMood(String(result.mood));
    setTags(result.tags.join(", "));
    setConceptTags(result.conceptTags.join(", "));
    setSummary(result.summary);
    setBody(result.body);
    setInsightReflection(result.insightReflection);
    if (result.linkedBookIdeaId !== null) {
      setBookIdeaId(String(result.linkedBookIdeaId));
    }

    // Scroll the form into view so the user can review
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const toggleEmotion = (emotion: Emotion) => {
    setEmotions((current) =>
      current.includes(emotion)
        ? current.filter((item) => item !== emotion)
        : current.length >= THOUGHT_FIELD_LIMITS.emotions
          ? current
          : [...current, emotion],
    );
  };

  return (
    <div className="grid gap-6">
      {!editingThought ? <SmartCapture onAutoFill={handleAutoFill} /> : null}
      <LiveRagContext formRef={formRef} />
      <form
        ref={formRef}
        action={editingThought ? updateAction : createAction}
        className="rounded-[1.5rem] border border-emerald-950/10 bg-white/45 p-4 shadow-[0_26px_80px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6 md:p-8"
      >
        <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6 sm:gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              {editingThought ? "Edit thought" : "New thought"}
            </p>
            <h2 className="mt-2 font-[family:var(--font-display)] text-[1.75rem] leading-none text-stone-900 sm:text-3xl">
              {editingThought ? "Refine your card" : "Capture a new card"}
            </h2>
          </div>
        </div>
        <div className="grid gap-4 sm:gap-5">
          {editingThought ? (
            <input type="hidden" name="thoughtId" value={editingThought.id} />
          ) : (
            <input type="hidden" name="requestId" value={requestId} />
          )}
          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-emerald-800/70">
              Title
            </span>
            <input
              type="text"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
            />
          </label>

          <fieldset className="grid gap-2 text-sm text-stone-700">
            <legend className="uppercase tracking-[0.18em] text-emerald-800/70">How it feels</legend>
            <input type="hidden" name="emotions" value={emotions.join(",")} />
            {editingThought ? <input type="hidden" name="category" value={editingThought.category} /> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {EMOTIONS.map((emotion) => {
                const selected = emotions.includes(emotion);

                return (
                  <button
                    key={emotion}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleEmotion(emotion)}
                    className={`rounded-full border px-3 py-1.5 text-sm capitalize transition ${
                      selected
                        ? "border-emerald-950 bg-emerald-950 text-emerald-50"
                        : "border-emerald-950/10 bg-emerald-50/60 text-stone-700 hover:border-emerald-700"
                    }`}
                  >
                    {emotion}
                  </button>
                );
              })}
            </div>
            <span className="text-xs leading-5 text-stone-500">
              Pick up to {THOUGHT_FIELD_LIMITS.emotions}. This replaces the old free-text category.
            </span>
          </fieldset>

          <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-sm text-stone-700">
              <span className="uppercase tracking-[0.18em] text-emerald-800/70">Life area</span>
              <select
                name="lifeArea"
                value={lifeArea}
                onChange={(e) => setLifeArea(e.target.value)}
                className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
              >
                <option value="">Not set</option>
                {LIFE_AREAS.map((area) => (
                  <option key={area.key} value={area.key}>
                    {area.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-2 text-sm text-stone-700">
              <span className="uppercase tracking-[0.18em] text-emerald-800/70">Trigger</span>
              <input
                type="text"
                name="trigger"
                value={trigger}
                maxLength={THOUGHT_FIELD_LIMITS.trigger}
                onChange={(e) => setTrigger(e.target.value)}
                placeholder="Person, place or event (optional)"
                className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
              />
            </label>

            <label className="grid min-w-0 gap-2 text-sm text-stone-700 md:col-span-2">
              <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                Mood level
              </span>
              <select
                name="mood"
                required
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
              >
                <option value="" disabled>
                  Select a mood from 1 to 10
                </option>
                {Array.from({ length: 10 }, (_, index) => {
                  const level = index + 1;

                  return (
                    <option key={level} value={level}>
                      {level} / 10
                    </option>
                  );
                })}
              </select>
              <div className="flex justify-between text-xs uppercase tracking-[0.12em] text-stone-500">
                <span>1 = low</span>
                <span>10 = high</span>
              </div>
            </label>
          </div>

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-emerald-800/70">
              Tags
            </span>
            <input
              type="text"
              name="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="work, family, health"
              className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
            />
            <span className="text-xs leading-6 text-stone-500">
              Separate tags with commas. Use them to group cards across different categories.
            </span>
          </label>

          <div className="grid gap-4 sm:gap-5 md:grid-cols-[1fr_1fr]">
            <label className="grid gap-2 text-sm text-stone-700">
              <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                Concept tags
              </span>
              <input
                type="text"
                name="conceptTags"
                value={conceptTags}
                onChange={(e) => setConceptTags(e.target.value)}
                placeholder="stoicism, ego, delayed gratification"
                className="rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
              />
              <span className="text-xs leading-5 text-stone-500">
                Optional idea-level tags for pattern tracking across your journal.
              </span>
            </label>

            <label className="grid min-w-0 gap-2 text-sm text-stone-700">
              <span className="uppercase tracking-[0.18em] text-emerald-800/70">
                Linked idea
              </span>
              <select
                name="bookIdeaId"
                value={bookIdeaId}
                onChange={(e) => setBookIdeaId(e.target.value)}
                className="min-w-0 rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
              >
                <option value="">No linked source idea</option>
                {bookIdeas.map((idea) => (
                  <option key={idea.id} value={idea.id}>
                    {idea.book_title} - {idea.idea_text}
                  </option>
                ))}
              </select>
              <span className="text-xs leading-5 text-stone-500">
                Link the thought to an idea from your library when you notice it in real life.
              </span>
            </label>
          </div>

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-emerald-800/70">
              Card summary
            </span>
            <textarea
              name="summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              className="resize-none rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
            />
              <span className="text-xs leading-5 text-stone-500">
                Keep this short so your cards stay easy to scan in the archive.
              </span>
            </label>

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-emerald-800/70">
              Insight reflection
            </span>
            <textarea
              name="insightReflection"
              rows={3}
              value={insightReflection}
              onChange={(e) => setInsightReflection(e.target.value)}
              placeholder="How did this idea show up today?"
              className="resize-none rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
            />
              <span className="text-xs leading-5 text-stone-500">
                Optional evidence note for how the linked idea appeared in the day.
              </span>
            </label>

          <label className="grid gap-2 text-sm text-stone-700">
            <span className="uppercase tracking-[0.18em] text-emerald-800/70">
              Long-form note
            </span>
            <textarea
              name="body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="resize-y rounded-2xl border border-emerald-950/10 bg-emerald-50/60 px-4 py-3 outline-none transition focus:border-emerald-700"
            />
              <span className="text-xs leading-5 text-stone-500">
                Optional deeper reflection. This stays attached to the card without cluttering the archive view.
              </span>
            </label>

          <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
              {editingThought ? "Updates this card" : "Saves to your account"}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {editingThought ? (
                <Link
                  href="/dashboard"
                  className="rounded-full border border-emerald-950/10 bg-white/70 px-5 py-3 text-center text-sm uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-white"
                >
                  Cancel
                </Link>
              ) : null}
              <SubmitButton
                label={editingThought ? "Update Card" : "Create Card"}
                pendingLabel={editingThought ? "Updating…" : "Creating…"}
                disabled={!databaseAvailable}
                className="rounded-full bg-emerald-950 px-5 py-3 text-sm uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default ThoughtFormSection;
