import {
  generateDailyTasksFromRecurring,
  getDailyCheckInsByUserAndDate,
  getDayRecordByUserAndDate,
  getOverdueOpenTasks,
  getTasksByUserAndDate,
} from "@/lib/db";
import { apiError, withMobileUser } from "@/lib/mobile-api";
import { isValidTaskDate } from "@/lib/tasks/validation";
import { getCurrentColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

// GET /api/v1/today?date=YYYY-MM-DD (defaults to today in Colombo)
// -> { date, today, tasks, dayRecord, checkIns, overdueCount }
export const GET = withMobileUser(async (request, user) => {
  const today = getCurrentColomboDate();
  const date = new URL(request.url).searchParams.get("date") ?? today;

  if (!isValidTaskDate(date)) {
    return apiError("date must be a valid YYYY-MM-DD date.", 400);
  }

  // Same rule as the web Today page: routines are only generated automatically for today.
  if (date === today) {
    try {
      await generateDailyTasksFromRecurring(user.id, today);
    } catch (error) {
      console.error("Failed to generate today's routine tasks.", error);
    }
  }

  const [tasks, dayRecord, overdueTasks, checkIns] = await Promise.all([
    getTasksByUserAndDate(user.id, date),
    getDayRecordByUserAndDate(user.id, date),
    getOverdueOpenTasks(user.id, date),
    getDailyCheckInsByUserAndDate(user.id, date),
  ]);

  return Response.json({
    date,
    today,
    tasks,
    dayRecord,
    checkIns,
    overdueCount: overdueTasks.length,
  });
});
