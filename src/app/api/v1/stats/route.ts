import {
  generateDailyTasksFromRecurring,
  getOverdueOpenTasks,
  getRecurringSkipsByUserRange,
  getRecurringTasksByUser,
  getSlippingOpenTasks,
  getTaskCompletionStats,
  getTasksByUserDateRange,
} from "@/lib/db";
import { withMobileUser } from "@/lib/mobile-api";
import { computeDayStreak, routineAdherence } from "@/lib/tasks/stats";
import { getCurrentColomboDate, shiftColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

// GET /api/v1/stats -> the web Weekly review and Completion pages in one payload:
// { today, streak, week: { days, done, total, skipped }, history (last 30 days),
//   routinesWeek, routinesMonth, slipping, overdue }
export const GET = withMobileUser(async (_request, user) => {
  const today = getCurrentColomboDate();
  const monthDays = Array.from({ length: MONTH_DAYS }, (_, index) => shiftColomboDate(today, index - (MONTH_DAYS - 1)));
  const weekDays = monthDays.slice(-WEEK_DAYS);

  try {
    await generateDailyTasksFromRecurring(user.id, today);
  } catch (error) {
    console.error("Failed to generate today's routine tasks.", error);
  }

  const [tasks, routines, skips, slipping, overdue, history] = await Promise.all([
    getTasksByUserDateRange(user.id, monthDays[0], today),
    getRecurringTasksByUser(user.id),
    getRecurringSkipsByUserRange(user.id, monthDays[0], today),
    getSlippingOpenTasks(user.id, 2),
    getOverdueOpenTasks(user.id, today),
    getTaskCompletionStats(user.id, 120),
  ]);

  const skipped = new Set(skips.map((skip) => `${skip.recurring_task_id}:${skip.skip_date}`));
  const weekTasks = tasks.filter((task) => task.scheduled_date !== null && task.scheduled_date >= weekDays[0]);
  const weekCounted = weekTasks.filter((task) => task.status !== "skipped");

  return Response.json({
    today,
    streak: computeDayStreak(
      history.map((day) => ({ date: day.date, total: day.total_tasks, done: day.completed_tasks })),
      today,
    ),
    week: {
      done: weekCounted.filter((task) => task.status === "done").length,
      total: weekCounted.length,
      skipped: weekTasks.length - weekCounted.length,
      days: weekDays.map((day) => {
        const dayTasks = weekCounted.filter((task) => task.scheduled_date === day);
        return { date: day, total: dayTasks.length, done: dayTasks.filter((task) => task.status === "done").length };
      }),
    },
    history: history.filter((day) => day.date >= monthDays[0]),
    routinesWeek: routineAdherence(routines, tasks, skipped, weekDays, today),
    routinesMonth: routineAdherence(routines, tasks, skipped, monthDays, today),
    slipping,
    overdue,
  });
});
