// Deterministic resolution of the date phrases people type ("tomorrow", "next friday",
// "in 3 days", "oct 10"). The agent uses this instead of trusting the LLM with date math.
import { isValidTaskDate } from "./validation.ts";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_ALIASES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));

  return value.toISOString().slice(0, 10);
}

function weekdayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekdayName(date: string) {
  return WEEKDAYS[weekdayOf(date)];
}

function buildDate(year: number, month: number, day: number) {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return isValidTaskDate(value) ? value : null;
}

// Returns YYYY-MM-DD, or null when the phrase isn't a date we understand.
// Weekday rules: "friday" / "this friday" = the next Friday on or after today;
// "next friday" = the next Friday strictly after today.
export function resolveRelativeDate(phrase: string, today: string): string | null {
  const text = phrase.trim().toLowerCase().replace(/[.,!?]+$/g, "").replace(/\s+/g, " ");

  if (!text) {
    return null;
  }

  // (Widened so the type guard doesn't narrow `text` to never below.)
  if (isValidTaskDate(text as unknown)) {
    return text;
  }

  if (text === "today" || text === "tonight" || text === "this evening") {
    return today;
  }

  if (text === "tomorrow" || text === "tmrw" || text === "tmr") {
    return addDays(today, 1);
  }

  if (text === "day after tomorrow" || text === "the day after tomorrow") {
    return addDays(today, 2);
  }

  if (text === "yesterday") {
    return addDays(today, -1);
  }

  const inMatch = text.match(/^in (\d{1,3}|a|an|one|two|three) (day|days|week|weeks)$/);
  if (inMatch) {
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3 };
    const amount = words[inMatch[1]] ?? Number(inMatch[1]);
    return addDays(today, inMatch[2].startsWith("week") ? amount * 7 : amount);
  }

  if (text === "next week") {
    // The Monday after this week.
    const daysUntilMonday = ((1 - weekdayOf(today) + 7) % 7) || 7;
    return addDays(today, daysUntilMonday);
  }

  const weekdayMatch = text.match(/^(?:(this|next|on)\s+)?([a-z]+)$/);
  if (weekdayMatch && weekdayMatch[2] in WEEKDAY_ALIASES) {
    const target = WEEKDAY_ALIASES[weekdayMatch[2]];
    let delta = (target - weekdayOf(today) + 7) % 7;
    if (weekdayMatch[1] === "next" && delta === 0) {
      delta = 7;
    }
    return addDays(today, delta);
  }

  // "oct 10", "october 10th", "10 oct", "10th of october"
  const monthDay =
    text.match(/^(?:on )?([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/) ??
    text.match(/^(?:on )?(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+)$/);
  if (monthDay) {
    const [monthWord, dayText] = /^\d/.test(monthDay[1]) ? [monthDay[2], monthDay[1]] : [monthDay[1], monthDay[2]];
    const month = MONTHS[monthWord];
    if (month) {
      const year = Number(today.slice(0, 4));
      const thisYear = buildDate(year, month, Number(dayText));
      // A date already past this year means next year.
      if (thisYear && thisYear >= today) {
        return thisYear;
      }
      return buildDate(year + 1, month, Number(dayText));
    }
  }

  return null;
}

// A small calendar for the prompt so the model can map weekday names without doing arithmetic.
export function describeUpcomingDays(today: string, count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(today, index);
    const label = index === 0 ? " (today)" : index === 1 ? " (tomorrow)" : "";
    return `${date} ${weekdayName(date)}${label}`;
  }).join("\n");
}
