import type { Weekday } from "@/lib/types";

export const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

export function describeDays(days: string[]) {
  if (days.length === 7) return "Every day";
  if (days.length === 5 && !days.includes("sat") && !days.includes("sun")) return "Weekdays";
  if (days.length === 2 && days.includes("sat") && days.includes("sun")) return "Weekends";

  return WEEKDAYS.filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(", ");
}
