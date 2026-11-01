// Checks a report date range on the phone before asking the server (same limits as the server).
// Pure, so the web project's test runner can test it.
export const REPORT_MAX_DAYS = 92;

export function checkReportRange(from: string | null, to: string | null, today: string, anySection: boolean) {
  if (!from || !to) return "Pick both dates.";
  if (to > today) return "The report can't end after today.";
  if (from > to) return "The start date must be on or before the end date.";
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > REPORT_MAX_DAYS) return `A report can cover at most ${REPORT_MAX_DAYS} days.`;
  if (!anySection) return "Pick at least one section.";
  return null;
}
