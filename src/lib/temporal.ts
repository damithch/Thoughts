import { getCurrentColomboDate, shiftColomboDate } from "@/lib/time";

export type TemporalRange = {
  startDate: string;
  endDate: string;
  label: string;
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
 * a recognisable date-relative expression.  Returns `null` when
 * no temporal intent is detected.
 */
export function resolveTemporalRange(query: string): TemporalRange | null {
  const today = getCurrentColomboDate();

  for (const { pattern, resolve } of TEMPORAL_PATTERNS) {
    const match = query.match(pattern);

    if (match) {
      return resolve(today, match);
    }
  }

  return null;
}
