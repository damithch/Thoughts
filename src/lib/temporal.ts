import { getCurrentColomboDate, shiftColomboDate } from "./time.ts";
import type { RagQueryFilters } from "./rag-filters";

export type TemporalRange = {
  startDate: string;
  endDate: string;
  label: string;
};

export type RagQueryIntent = {
  originalQuery: string;
  rewrittenQuery: string;
  temporalRange: TemporalRange | null;
  filters: Pick<RagQueryFilters, "tags" | "categories" | "minMood" | "maxMood" | "fromDate" | "toDate">;
  matchedPhrases: string[];
};

/**
 * Patterns matched (case-insensitive) against the user query.
 * Order matters — more specific patterns are checked first.
 */
const TEMPORAL_PATTERNS: Array<{
  pattern: RegExp;
  resolve: (today: string, match: RegExpMatchArray) => TemporalRange;
}> = [
  // "last N days" / "past N days"
  {
    pattern: /\b(?:last|past)\s+(\d{1,3})\s+days?\b/i,
    resolve: (today, match) => {
      const n = Math.min(Number(match[1]), 365);
      return {
        startDate: shiftColomboDate(today, -(n - 1)),
        endDate: today,
        label: `last ${n} day${n === 1 ? "" : "s"}`,
      };
    },
  },
  // "last N weeks" / "past N weeks"
  {
    pattern: /\b(?:last|past)\s+(\d{1,2})\s+weeks?\b/i,
    resolve: (today, match) => {
      const n = Math.min(Number(match[1]), 52);
      return {
        startDate: shiftColomboDate(today, -(n * 7 - 1)),
        endDate: today,
        label: `last ${n} week${n === 1 ? "" : "s"}`,
      };
    },
  },
  // "last N months" / "past N months"
  {
    pattern: /\b(?:last|past)\s+(\d{1,2})\s+months?\b/i,
    resolve: (today, match) => {
      const n = Math.min(Number(match[1]), 24);
      return {
        startDate: shiftColomboDate(today, -(n * 30)),
        endDate: today,
        label: `last ${n} month${n === 1 ? "" : "s"}`,
      };
    },
  },
  // "today"
  {
    pattern: /\btoday\b/i,
    resolve: (today) => ({
      startDate: today,
      endDate: today,
      label: "today",
    }),
  },
  // "yesterday"
  {
    pattern: /\byesterday\b/i,
    resolve: (today) => {
      const yesterday = shiftColomboDate(today, -1);
      return { startDate: yesterday, endDate: yesterday, label: "yesterday" };
    },
  },
  // "this week"
  {
    pattern: /\bthis\s+week\b/i,
    resolve: (today) => {
      // Week starts on Monday (ISO convention).
      const [year, month, day] = today.split("-").map(Number);
      const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      // jsDay: 0 = Sun, 1 = Mon … 6 = Sat
      const daysSinceMonday = jsDay === 0 ? 6 : jsDay - 1;
      return {
        startDate: shiftColomboDate(today, -daysSinceMonday),
        endDate: today,
        label: "this week",
      };
    },
  },
  // "last week"
  {
    pattern: /\blast\s+week\b/i,
    resolve: (today) => {
      const [year, month, day] = today.split("-").map(Number);
      const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const daysSinceMonday = jsDay === 0 ? 6 : jsDay - 1;
      const thisMonday = shiftColomboDate(today, -daysSinceMonday);
      return {
        startDate: shiftColomboDate(thisMonday, -7),
        endDate: shiftColomboDate(thisMonday, -1),
        label: "last week",
      };
    },
  },
  // "this month"
  {
    pattern: /\bthis\s+month\b/i,
    resolve: (today) => {
      const monthStart = today.slice(0, 8) + "01";
      return {
        startDate: monthStart,
        endDate: today,
        label: "this month",
      };
    },
  },
  // "last month"
  {
    pattern: /\blast\s+month\b/i,
    resolve: (today) => {
      const [year, month] = today.split("-").map(Number);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
      const daysInPrevMonth = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
      const prevMonthEnd = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(daysInPrevMonth).padStart(2, "0")}`;
      return {
        startDate: prevMonthStart,
        endDate: prevMonthEnd,
        label: "last month",
      };
    },
  },
];

/**
 * Resolve a user query to a temporal date range, if it contains
 * a recognisable date-relative expression. Returns `null` when
 * no temporal intent is detected.
 */
export function resolveTemporalRange(query: string): TemporalRange | null {
  const today = getCurrentColomboDate();
  for (const { pattern, resolve } of TEMPORAL_PATTERNS) {
    const match = query.match(pattern);
    if (match) return resolve(today, match);
  }
  return null;
}

const SAFE_FILTER_PATTERNS: Array<{
  pattern: RegExp;
  getValue: (match: RegExpMatchArray) => { field: "tags" | "categories"; value: string } | null;
}> = [
  {
    pattern: /\btag(?:ged)?\s*(?:with|:)?\s*(?:"([^"]+)"|'([^']+)'|([a-z0-9][a-z0-9 _-]*?))(?=\s*(?:,|$|\b(?:and|about|from|for|during|last|past|today|yesterday|this|mood|category)\b))/i,
    getValue: (match) => ({ field: "tags", value: match[1] || match[2] || match[3] }),
  },
  {
    pattern: /\bcategory\s*(?::|is|=)?\s*(?:"([^"]+)"|'([^']+)'|([a-z0-9][a-z0-9 _-]*?))(?=\s*(?:,|$|\b(?:and|about|from|for|during|last|past|today|yesterday|this|mood|tag)\b))/i,
    getValue: (match) => ({ field: "categories", value: match[1] || match[2] || match[3] }),
  },
];

function extractMood(query: string) {
  const match = query.match(/\bmood\s*(?:is\s*)?(>=|at least|above|over|=)\s*(10|[1-9])\b/i)
    || query.match(/\bmood\s*(10|[1-9])\s*\+/i);
  if (!match) return null;
  const value = Number(match[2] || match[1]);
  if (!Number.isInteger(value) || value < 1 || value > 10) return null;
  return { value, operator: match[1] === "=" ? "equal" as const : "min" as const, text: match[0] };
}

/** Extract only unambiguous retrieval intents and remove control phrases. */
export function extractRagQueryIntent(query: string): RagQueryIntent {
  let rewrittenQuery = query.trim();
  const matchedPhrases: string[] = [];
  const filters: RagQueryIntent["filters"] = {};

  for (const { pattern, getValue } of SAFE_FILTER_PATTERNS) {
    const match = rewrittenQuery.match(pattern);
    if (!match) continue;
    const extracted = getValue(match);
    const value = extracted?.value.trim();
    if (!extracted || !value) continue;
    filters[extracted.field] = [value];
    matchedPhrases.push(match[0]);
    rewrittenQuery = rewrittenQuery.replace(match[0], " ");
  }

  const mood = extractMood(rewrittenQuery);
  if (mood) {
    if (mood.operator === "equal") {
      filters.minMood = mood.value;
      filters.maxMood = mood.value;
    } else {
      filters.minMood = mood.value;
    }
    matchedPhrases.push(mood.text);
    rewrittenQuery = rewrittenQuery.replace(mood.text, " ");
  }

  const temporalRange = resolveTemporalRange(rewrittenQuery);
  if (temporalRange) {
    const temporalMatch = TEMPORAL_PATTERNS.find(({ pattern }) => pattern.test(rewrittenQuery));
    const match = temporalMatch && rewrittenQuery.match(temporalMatch.pattern);
    if (match) {
      matchedPhrases.push(match[0]);
      rewrittenQuery = rewrittenQuery.replace(match[0], " ");
    }
    filters.fromDate = temporalRange.startDate;
    filters.toDate = temporalRange.endDate;
  }

  rewrittenQuery = rewrittenQuery.replace(/\s+/g, " ").replace(/\s+([,?.])/g, "$1").trim();
  if (!rewrittenQuery) rewrittenQuery = "entries";
  return { originalQuery: query, rewrittenQuery, temporalRange, filters, matchedPhrases };
}
