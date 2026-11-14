// What a thought is about, split into three separate answers instead of one free-text
// "category": the emotions felt (from a fixed list), the life area it belongs to, and an
// optional trigger (the person, place or event that set it off).
//
// Pure and dependency-free so the web, the phone API, Claude's tools and the tests share it.
// The phone keeps a copy of the two lists in mobile/src/lib/thought-fields.ts.

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

export type Emotion = (typeof EMOTIONS)[number];

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

export type LifeArea = (typeof LIFE_AREAS)[number]["key"];

export const THOUGHT_FIELD_LIMITS = { emotions: 3, trigger: 80 };

export type ThoughtFields = { emotions: Emotion[]; lifeArea: LifeArea | ""; trigger: string };

const EMOTION_SET = new Set<string>(EMOTIONS);
const LIFE_AREA_SET = new Set<string>(LIFE_AREAS.map((area) => area.key));

// Up to three known emotions, lower-cased, in the order given. Accepts an array or a
// comma-separated string; anything not on the list is dropped.
export function normalizeEmotions(value: unknown): Emotion[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const picked: Emotion[] = [];

  for (const item of raw) {
    const emotion = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (EMOTION_SET.has(emotion) && !picked.includes(emotion as Emotion)) picked.push(emotion as Emotion);
    if (picked.length >= THOUGHT_FIELD_LIMITS.emotions) break;
  }

  return picked;
}

export function normalizeLifeArea(value: unknown): LifeArea | "" {
  const area = typeof value === "string" ? value.trim().toLowerCase() : "";

  return LIFE_AREA_SET.has(area) ? (area as LifeArea) : "";
}

export function normalizeTrigger(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, THOUGHT_FIELD_LIMITS.trigger) : "";
}

export function lifeAreaLabel(area: string) {
  return LIFE_AREAS.find((item) => item.key === area)?.label ?? "";
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

// The short label still stored in the old "category" column and shown on cards:
// "Anxious, sad", or the life area when no emotion was picked.
export function categoryLabel(fields: { emotions: readonly string[]; lifeArea: string }, fallback = "Reflection") {
  if (fields.emotions.length > 0) return capitalize(fields.emotions.join(", "));

  return lifeAreaLabel(fields.lifeArea) || fallback;
}

// Words people actually typed into the old category box, mapped to the list.
const EMOTION_PATTERNS: [Emotion, RegExp][] = [
  ["sad", /\bsad|sandness|depress|unhappy|\bdown\b/],
  ["angry", /\banger|\bangry|\brage/],
  ["frustrated", /frustrat/],
  ["annoyed", /annoy|irritat/],
  ["anxious", /anxi|\btens|worr|stress|nervous/],
  ["afraid", /\bfear|scared|afraid|panic/],
  ["calm", /\bcalm|peace|relax/],
  ["happy", /\bhappy|\bjoy|\bgood\b|positive/],
  ["neutral", /neutral/],
  ["unsure", /\bidk\b|uncertain|unsure|don'?t know|confus/],
  ["disappointed", /disappoint/],
  ["regretful", /regret/],
  ["lonely", /\balone\b|lonel/],
  ["tired", /\btired|fatigue|exhaust/],
  ["numb", /\bnumb|\bempty/],
  ["hopeful", /\bhope/],
  ["proud", /\bproud/],
  ["grateful", /grateful|gratitude|thankful/],
  ["ashamed", /\bshame|ashamed|embarrass/],
  ["envious", /\benvy|envious|jealous/],
  ["overwhelmed", /overwhelm/],
  ["excited", /excit|thrill/],
];

const LIFE_AREA_PATTERNS: [LifeArea, RegExp][] = [
  ["study", /\bstud|exam|academic|\buni\b|university|campus|research|lecture|semester|assignment/],
  ["work", /\bwork|career|\bjob|freelanc|interview|client/],
  ["family", /family|\bmom\b|\bdad\b|mother|father|parent|brother|sister/],
  ["love", /relationship|dating|girlfriend|boyfriend|\bcrush|attraction|romanc/],
  ["social", /social|\bpeer|friend/],
  ["health", /health|\bbody|sleep|medic|\bgym|\blooks\b|appearance/],
  ["money", /money|financ|budget/],
  ["self", /myself|\bself\b|identity/],
];

// Old categories that say nothing about emotion, area or trigger.
const GENERIC_CATEGORIES = new Set([
  "reflection",
  "emotional processing",
  "attention training",
  "general",
  "other",
  "none",
  "note",
  "draft",
]);

// Reads an old free-text category (plus the thought's tags) into the three fields. Emotion
// words become emotions; a life-area word in the category or tags sets the area; a category
// that is neither ("met an old friend at the station") is kept whole as the trigger.
export function classifyLegacyCategory(category: string, tags: readonly string[] = []): ThoughtFields {
  const text = category.toLowerCase().replace(/\s+/g, " ").trim();

  const emotions = EMOTION_PATTERNS.map(([emotion, pattern]) => ({ emotion, index: text.search(pattern) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((match) => match.emotion)
    .slice(0, THOUGHT_FIELD_LIMITS.emotions);

  const areaIn = (value: string) => LIFE_AREA_PATTERNS.find(([, pattern]) => pattern.test(value))?.[0] ?? "";
  const categoryArea = areaIn(text);
  const lifeArea = categoryArea || areaIn(tags.join(" ").toLowerCase());

  const trigger =
    text && emotions.length === 0 && !categoryArea && !GENERIC_CATEGORIES.has(text) ? normalizeTrigger(category) : "";

  return { emotions, lifeArea, trigger };
}

export type ThoughtFieldsInput = { emotions?: unknown; lifeArea?: unknown; trigger?: unknown; category?: unknown };

// What a save should store. A client that sends the new fields gets exactly those, with the
// old category column filled from them; an older client that only sends a category has it
// read into the new fields. Returns null when neither gives anything to store.
export function resolveThoughtFields(input: ThoughtFieldsInput, tags: readonly string[] = []) {
  const sentNewFields = input.emotions !== undefined || input.lifeArea !== undefined || input.trigger !== undefined;
  const legacy = typeof input.category === "string" ? input.category.replace(/\s+/g, " ").trim().slice(0, 80) : "";

  if (!sentNewFields) {
    return legacy ? { category: legacy, ...classifyLegacyCategory(legacy, tags) } : null;
  }

  const fields: ThoughtFields = {
    emotions: normalizeEmotions(input.emotions),
    lifeArea: normalizeLifeArea(input.lifeArea),
    trigger: normalizeTrigger(input.trigger),
  };

  if (fields.emotions.length === 0 && !fields.lifeArea) {
    return legacy ? { category: legacy, ...fields } : null;
  }

  return { category: categoryLabel(fields), ...fields };
}

// Tags as the capture prompts should see them: most used first, so the model reuses the
// labels that matter instead of whichever come first alphabetically.
export function rankTags(counts: readonly { tag: string; count: number }[], limit = 50) {
  return [...counts]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit)
    .map((item) => item.tag);
}

export function normalizeTagName(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/^#/, "").slice(0, 40) : "";
}
