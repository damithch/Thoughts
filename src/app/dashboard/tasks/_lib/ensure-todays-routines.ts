import "server-only";

import { cache } from "react";

import { generateDailyTasksFromRecurring } from "@/lib/db";

// Creates today's routine tasks once per request. Next renders the Tasks layout and the page
// concurrently, so each of them awaits this (memoised) promise before reading tasks; otherwise
// a page could query before the layout's insert finished and miss today's routines.
export const ensureTodaysRoutines = cache(async (userId: number, today: string) => {
  try {
    await generateDailyTasksFromRecurring(userId, today);
  } catch (error) {
    console.error("Failed to generate today's routine tasks.", error);
  }
});
