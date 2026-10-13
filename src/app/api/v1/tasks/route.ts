import { revalidatePath } from "next/cache";

import {
  createTask,
  generateDailyTasksFromRecurring,
  getInboxTasksByUser,
  getOverdueOpenTasks,
  getRecurringSkipsByUserMonth,
  getRecurringTasksByUser,
  getTaskByIdForUser,
  getTasksByUserDateRange,
} from "@/lib/db";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { isRoutineScheduledOn } from "@/lib/tasks/recurrence";
import {
  isValidTaskDate,
  normalizeTaskNote,
  normalizeTaskTags,
  normalizeTaskTitle,
  parseTaskPriorityValue,
} from "@/lib/tasks/validation";
import { getCurrentColomboDate, shiftColomboDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const UPCOMING_DAYS = 14;

// GET /api/v1/tasks?view=upcoming -> { today, days: [{ date, tasks, pendingRoutines }], overdue }
// GET /api/v1/tasks?view=inbox    -> { tasks } (tasks without a date)
// Same data as the web Upcoming and Inbox pages.
export const GET = withMobileUser(async (request, user) => {
  const view = new URL(request.url).searchParams.get("view");

  if (view === "inbox") {
    return Response.json({ tasks: await getInboxTasksByUser(user.id) });
  }

  if (view !== "upcoming") {
    return apiError("view must be upcoming or inbox.", 400);
  }

  const today = getCurrentColomboDate();
  const days = Array.from({ length: UPCOMING_DAYS }, (_, index) => shiftColomboDate(today, index));
  const months = Array.from(new Set(days.map((day) => day.slice(0, 7))));

  try {
    await generateDailyTasksFromRecurring(user.id, today);
  } catch (error) {
    console.error("Failed to generate today's routine tasks.", error);
  }

  const [tasks, routines, overdue, ...skipsByMonth] = await Promise.all([
    getTasksByUserDateRange(user.id, today, days[days.length - 1]),
    getRecurringTasksByUser(user.id),
    getOverdueOpenTasks(user.id, today),
    ...months.map((month) => getRecurringSkipsByUserMonth(user.id, month)),
  ]);

  const skipped = new Set(skipsByMonth.flat().map((skip) => `${skip.recurring_task_id}:${skip.skip_date}`));
  const activeRoutines = routines.filter((routine) => routine.is_active);

  return Response.json({
    today,
    overdue,
    days: days.map((day) => {
      const dayTasks = tasks.filter((task) => task.scheduled_date === day);
      const createdRoutineIds = new Set(dayTasks.map((task) => task.recurring_task_id));

      // Future routines aren't created yet; list them so the day's load is visible.
      return {
        date: day,
        tasks: dayTasks,
        pendingRoutines: activeRoutines
          .filter(
            (routine) =>
              isRoutineScheduledOn(routine, day) &&
              !createdRoutineIds.has(routine.id) &&
              !skipped.has(`${routine.id}:${day}`),
          )
          .map((routine) => routine.title),
      };
    }),
  });
});

// POST /api/v1/tasks { title, date (YYYY-MM-DD, or null for the Inbox), priority?, note?, tags? }
// -> 201 { task }
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the task as a JSON object.", 400);
  }

  const title = normalizeTaskTitle(body.title);
  const priority = parseTaskPriorityValue(body.priority ?? "medium");

  if (!title) {
    return apiError("Give the task a title.", 400);
  }

  if (!priority) {
    return apiError("priority must be low, medium or high.", 400);
  }

  if (body.date !== null && !isValidTaskDate(body.date)) {
    return apiError("date must be a valid YYYY-MM-DD date, or null for the Inbox.", 400);
  }

  const taskId = await createTask({
    title,
    priority,
    tags: normalizeTaskTags(body.tags),
    note: normalizeTaskNote(body.note),
    scheduledDate: body.date,
    userId: user.id,
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks", "layout");

  return Response.json({ task: await getTaskByIdForUser(taskId, user.id) }, { status: 201 });
});
