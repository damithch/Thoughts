import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  createPostponedItem,
  createTask,
  createThought,
  getActiveWorryModule,
  getThoughtByIdForUser,
  getThoughtIdByRequestId,
} from "@/lib/db";
import {
  apiError,
  readJsonObject,
  readMood,
  readOwnedBookIdeaId,
  readString,
  readTags,
  withMobileUser,
} from "@/lib/mobile-api";
import { isValidTaskDate, normalizeTaskTitle, parseTaskPriorityValue } from "@/lib/tasks/validation";
import { getCurrentColomboDate } from "@/lib/time";
import { VOICE_LIMITS } from "@/lib/voice-capture";

export const dynamic = "force-dynamic";

const VOICE_TASK_TAG = "voice";

// POST /api/v1/voice/save {
//   thought: { title, category, mood, summary, body, tags?, linkedBookIdeaId?, insightReflection? },
//   tasks?: [{ title, date (YYYY-MM-DD | null), priority? }],
//   worries?: [string],
//   requestId
// } -> 201 { thought, tasksCreated, worriesParked }
// Saves the reviewed draft. A retry with the same requestId returns the saved thought without
// adding the tasks or worries twice.
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);
  const raw = body?.thought && typeof body.thought === "object" ? (body.thought as Record<string, unknown>) : null;

  if (!body || !raw) return apiError("Send the reviewed thought as a JSON object.", 400);

  const title = readString(raw.title, 200);
  const category = readString(raw.category, 80);
  const mood = readMood(raw.mood);
  const summary = readString(raw.summary, 2000);

  if (!title || !category || !mood || !summary) {
    return apiError("The thought needs a title, category, mood (1-10) and summary.", 400);
  }

  // Validate everything before writing anything.
  const rawTasks = Array.isArray(body.tasks) ? body.tasks : [];
  if (rawTasks.length > VOICE_LIMITS.tasks) return apiError(`Add up to ${VOICE_LIMITS.tasks} tasks at once.`, 400);

  const tasks: { title: string; date: string | null; priority: "low" | "medium" | "high" }[] = [];
  for (const item of rawTasks) {
    const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const taskTitle = normalizeTaskTitle(record.title);
    const priority = parseTaskPriorityValue(record.priority ?? "medium");
    const date = record.date === null || record.date === undefined || record.date === "" ? null : record.date;

    if (!taskTitle) return apiError("Each task needs a title.", 400);
    if (!priority) return apiError("Task priority must be low, medium or high.", 400);
    if (date !== null && !isValidTaskDate(date)) return apiError(`Check the date for "${taskTitle}".`, 400);

    tasks.push({ title: taskTitle, date, priority });
  }

  const rawWorries = Array.isArray(body.worries) ? body.worries : [];
  const worries = rawWorries.map((worry) => readString(worry, VOICE_LIMITS.worryLength)).filter(Boolean);
  if (worries.length > VOICE_LIMITS.worries) return apiError(`Park up to ${VOICE_LIMITS.worries} worries at once.`, 400);

  const worryModule = worries.length > 0 ? await getActiveWorryModule(user.id) : null;
  if (worries.length > 0 && !worryModule) {
    return apiError("Worries can be parked once a worry postponement is running.", 409);
  }

  const linkedBookIdeaId = await readOwnedBookIdeaId(raw.linkedBookIdeaId, user.id);
  if (linkedBookIdeaId === false) return apiError("That insight idea isn't in your library.", 400);

  const requestId = readString(body.requestId, 100) || randomUUID();
  const alreadySaved = await getThoughtIdByRequestId(user.id, requestId);

  if (alreadySaved) {
    return Response.json(
      { thought: await getThoughtByIdForUser(alreadySaved, user.id), tasksCreated: 0, worriesParked: 0, repeated: true },
      { status: 200 },
    );
  }

  const thoughtId = await createThought({
    title,
    category,
    mood,
    summary,
    body: readString(raw.body),
    tags: readTags(raw.tags),
    conceptTags: [],
    linkedBookIdeaId: linkedBookIdeaId ?? null,
    insightReflection: readString(raw.insightReflection, 4000),
    userId: user.id,
    requestId,
  });

  for (const task of tasks) {
    await createTask({
      title: task.title,
      priority: task.priority,
      tags: [VOICE_TASK_TAG],
      note: "",
      scheduledDate: task.date,
      userId: user.id,
    });
  }

  if (worryModule) {
    const today = getCurrentColomboDate();
    for (const worry of worries) {
      await createPostponedItem(worryModule.id, today, worry);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks", "layout");
  revalidatePath("/");

  const thought = thoughtId ? await getThoughtByIdForUser(thoughtId, user.id) : null;

  return Response.json(
    { thought, tasksCreated: tasks.length, worriesParked: worryModule ? worries.length : 0 },
    { status: 201 },
  );
});
