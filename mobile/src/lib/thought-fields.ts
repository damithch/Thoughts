// What a thought is about: emotions (fixed list), life area and an optional trigger. The two
// lists mirror the server's src/lib/thought-fields.ts (a test checks they stay the same).

export const EMOTIONS = [
  "calm",
  "happy",
  "hopeful",
  "proud",
  "grateful",
  "excited",
  "neutral",
  "unsure",
  "numb",
  "tired",
  "sad",
  "lonely",
  "anxious",
  "afraid",
  "angry",
  "frustrated",
  "annoyed",
  "disappointed",
  "regretful",
  "ashamed",
  "envious",
  "overwhelmed",
] as const;

export const LIFE_AREAS = [
  { key: "study", label: "Study" },
  { key: "work", label: "Work & career" },
  { key: "family", label: "Family" },
  { key: "love", label: "Love & dating" },
  { key: "social", label: "Friends & social" },
  { key: "health", label: "Health & body" },
  { key: "money", label: "Money" },
  { key: "self", label: "Self" },
  { key: "other", label: "Other" },
] as const;

export const MAX_EMOTIONS = 3;
export const MAX_TRIGGER_LENGTH = 80;

// Adds or removes an emotion; a fourth pick is ignored.
export function toggleEmotion(current: string[], emotion: string) {
  if (current.includes(emotion)) return current.filter((item) => item !== emotion);

  return current.length >= MAX_EMOTIONS ? current : [...current, emotion];
}

export function lifeAreaLabel(area: string) {
  return LIFE_AREAS.find((item) => item.key === area)?.label ?? "";
}

// "Anxious, sad" for a card header. Older thoughts with no emotions fall back to their category.
export function emotionsLabel(thought: { emotions?: string[]; category: string }) {
  const emotions = thought.emotions ?? [];
  const text = emotions.join(", ");

  return text ? text[0].toUpperCase() + text.slice(1) : thought.category;
}

// The second line on a card: "Study · saw the exam results".
export function contextLine(thought: { life_area?: string; trigger?: string }) {
  return [lifeAreaLabel(thought.life_area ?? ""), thought.trigger ?? ""].filter(Boolean).join(" · ");
}
