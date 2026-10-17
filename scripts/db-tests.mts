// Integration tests for the task data layer against a real, disposable Postgres database.
// Run: TEST_DATABASE_URL=postgres://.../thoughts_test npm run test:db
// The schema is created automatically. Each run uses a fresh user, deleted at the end.
import assert from "node:assert/strict";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  console.error("TEST_DATABASE_URL is not set. Point it at a disposable database (never production).");
  process.exit(1);
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.AUTH_SECRET ??= "db-test-secret";

const { pool } = await import("@/lib/db/client");
const { ensureInitialized } = await import("@/lib/db/init");
const db = await import("@/lib/db/tasks");
const { getCurrentColomboDate, shiftColomboDate } = await import("@/lib/time");

const today = getCurrentColomboDate();
const yesterday = shiftColomboDate(today, -1);
const tomorrow = shiftColomboDate(today, 1);
const weekAgo = shiftColomboDate(today, -7);

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`  ✗ ${name}\n    ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

await ensureInitialized();
const { rows: userRows } = await pool.query<{ id: number }>(
  `INSERT INTO users (name, email, password_hash) VALUES ('DB test', $1, 'x:y') RETURNING id`,
  [`db-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`],
);
const userId = userRows[0].id;

async function makeRoutine(title: string) {
  const id = await db.createRecurringTask({
    userId,
    title,
    priority: "medium",
    tags: [],
    note: "",
    daysOfWeek: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
    startDate: weekAgo,
    endDate: null,
  });
  return Number(id);
}

async function tasksOn(date: string) {
  return db.getTasksByUserAndDate(userId, date);
}

console.log("Running DB integration tests...\n");

await test("ids come back as numbers", async () => {
  const id = await db.createTask({ userId, title: "Typed id", priority: "low", tags: [], note: "", scheduledDate: today });
  assert.equal(typeof id, "number");
  const [task] = (await tasksOn(today)).filter((t) => t.title === "Typed id");
  assert.equal(typeof task.id, "number");
  await db.deleteTask(id, userId);
});

await test("routine generation is idempotent and matches by routine id, not title", async () => {
  const routineId = await makeRoutine("Gym");
  await db.createTask({ userId, title: "Gym", priority: "low", tags: [], note: "", scheduledDate: today });
  await Promise.all([1, 2, 3].map(() => db.generateDailyTasksFromRecurring(userId, today)));
  const gym = (await tasksOn(today)).filter((t) => t.title === "Gym");
  assert.equal(gym.length, 2, "one-off Gym plus exactly one routine instance");
  assert.equal(gym.filter((t) => t.recurring_task_id === routineId).length, 1);
});

await test("a deleted routine instance is not regenerated; restore clears the skip", async () => {
  const routineId = await makeRoutine("Read");
  await db.generateDailyTasksFromRecurring(userId, today);
  const instance = (await tasksOn(today)).find((t) => t.recurring_task_id === routineId)!;
  assert.ok(await db.deleteTask(instance.id, userId));
  assert.equal(await db.generateDailyTasksFromRecurring(userId, today), 0);
  assert.equal((await tasksOn(today)).filter((t) => t.recurring_task_id === routineId).length, 0);
  await db.restoreDeletedTask(instance, userId);
  const restored = (await tasksOn(today)).filter((t) => t.recurring_task_id === routineId);
  assert.equal(restored.length, 1);
  const { rows } = await pool.query(`SELECT 1 FROM recurring_task_skips WHERE recurring_task_id = $1`, [routineId]);
  assert.equal(rows.length, 0);
});

await test("roll forward moves every overdue one-off task, never routines, and counts slips", async () => {
  const routineId = await makeRoutine("Stretch");
  await db.generateDailyTasksFromRecurring(userId, weekAgo);
  const oldId = await db.createTask({ userId, title: "Old bill", priority: "high", tags: [], note: "", scheduledDate: weekAgo });
  const yId = await db.createTask({ userId, title: "Call mum", priority: "medium", tags: [], note: "", scheduledDate: yesterday });
  const overdueBefore = await db.getOverdueOpenTasks(userId, today);
  assert.ok(overdueBefore.some((t) => t.id === oldId) && overdueBefore.some((t) => t.id === yId));
  assert.ok(!overdueBefore.some((t) => t.recurring_task_id === routineId));

  const moved = await db.rollForwardOpenTasks(userId, today);
  assert.ok(moved >= 2);
  const old = await db.getTaskByIdForUser(oldId, userId);
  assert.equal(old?.scheduled_date, today);
  assert.equal(old?.rollover_count, 1);
  assert.equal((await tasksOn(weekAgo)).filter((t) => t.recurring_task_id === routineId).length, 1, "routine stays");
});

await test("rescheduling a routine instance detaches it and skips its original day", async () => {
  const routineId = await makeRoutine("Walk");
  await db.generateDailyTasksFromRecurring(userId, tomorrow);
  const instance = (await tasksOn(tomorrow)).find((t) => t.recurring_task_id === routineId)!;
  assert.ok(await db.updateTask({ id: instance.id, userId, scheduledDate: shiftColomboDate(tomorrow, 2) }));
  const moved = await db.getTaskByIdForUser(instance.id, userId);
  assert.equal(moved?.recurring_task_id, null);
  assert.equal(moved?.rollover_count, 1);
  assert.equal(await db.generateDailyTasksFromRecurring(userId, tomorrow), 0);
});

await test("Inbox: undated tasks, scheduling and sending back", async () => {
  const id = await db.createTask({ userId, title: "Someday idea", priority: "low", tags: [], note: "", scheduledDate: null });
  assert.ok((await db.getInboxTasksByUser(userId)).some((t) => t.id === id));
  assert.equal(await db.getInboxOpenTaskCount(userId) >= 1, true);
  await db.updateTask({ id, userId, scheduledDate: tomorrow });
  assert.ok(!(await db.getInboxTasksByUser(userId)).some((t) => t.id === id));
  await db.updateTask({ id, userId, scheduledDate: null });
  assert.equal((await db.getTaskByIdForUser(id, userId))?.scheduled_date, null);
});

await test("slipping tasks: pushed back twice shows up", async () => {
  const id = await db.createTask({ userId, title: "Taxes", priority: "high", tags: [], note: "", scheduledDate: today });
  await db.updateTask({ id, userId, scheduledDate: tomorrow });
  await db.updateTask({ id, userId, scheduledDate: shiftColomboDate(tomorrow, 1) });
  const slipping = await db.getSlippingOpenTasks(userId, 2);
  assert.ok(slipping.some((t) => t.id === id && t.rollover_count === 2));
});

await test("completion stats leave skipped tasks out", async () => {
  const day = shiftColomboDate(today, -3);
  const a = await db.createTask({ userId, title: "A", priority: "low", tags: [], note: "", scheduledDate: day });
  const b = await db.createTask({ userId, title: "B", priority: "low", tags: [], note: "", scheduledDate: day });
  await db.updateTaskStatus({ id: a, status: "done", userId });
  await db.updateTaskStatus({ id: b, status: "skipped", userId });
  const stats = (await db.getTaskCompletionStats(userId, 7)).find((row) => row.date === day)!;
  assert.deepEqual([stats.total_tasks, stats.completed_tasks, stats.skipped_tasks, stats.completion_rate], [1, 1, 1, 100]);
});

const support = await import("@/lib/db/support");

await test("support day: partial updates keep other fields; dismissal is remembered", async () => {
  await support.updateSupportDay(userId, today, { ate: true });
  await support.updateSupportDay(userId, today, { connected: false, stepsTried: ["Breathe"] });
  const day = await support.getSupportDay(userId, today);
  assert.deepEqual([day.ate, day.slept, day.connected, day.steps_tried], [true, null, false, ["Breathe"]]);
  assert.equal(await support.getLatestSupportDismissal(userId, today), null);
  await support.updateSupportDay(userId, today, { dismiss: true });
  assert.ok((await support.getLatestSupportDismissal(userId, today)) instanceof Date);
  assert.equal((await support.getSupportDay(userId, today)).ate, true);
});

await test("breathing: sessions add up, and a minute or more ticks off the breathing routine", async () => {
  const routineId = await makeRoutine("Breathing exercises");
  const short = await support.recordBreathingSession(userId, today, 40, true);
  assert.equal(short.completedTask, null);
  const full = await support.recordBreathingSession(userId, today, 120, true);
  assert.equal(full.totalSeconds, 160);
  assert.equal(full.completedTask, "Breathing exercises");
  const [instance] = (await tasksOn(today)).filter((t) => t.recurring_task_id === routineId);
  assert.equal(instance.status, "done");
  const again = await support.recordBreathingSession(userId, today, 90, true);
  assert.equal(again.completedTask, null);
});

await test("recent moods merge thoughts and check-ins, newest first", async () => {
  await pool.query(
    `INSERT INTO thoughts (title, category, mood, tags, excerpt, body, user_id, created_at)
     VALUES ('Older', 'test', 5, '{}', 'x', '', $1, NOW() - INTERVAL '2 hours'),
            ('Newest', 'test', 2, '{}', 'x', '', $1, NOW() - INTERVAL '10 minutes')`,
    [userId],
  );
  await pool.query(
    `INSERT INTO daily_check_ins (user_id, entry_date, mood, energy, focus, note, created_at)
     VALUES ($1, $2::date, 3, 'low', 'okay', '', NOW() - INTERVAL '1 hour')`,
    [userId, today],
  );
  const moods = (await support.getRecentMoodEntries(userId, 3)).map((entry) => entry.mood);
  assert.deepEqual(moods, [2, 3, 5]);
});

await test("routine reminder time: saved, kept when not sent, cleared with null", async () => {
  const id = await db.createRecurringTask({
    userId, title: "Remind me", priority: "low", tags: [], note: "", daysOfWeek: ["mon"],
    startDate: weekAgo, endDate: null, remindAt: "21:00",
  });
  const find = async () => (await db.getRecurringTasksByUser(userId)).find((routine) => routine.id === Number(id))!;
  assert.equal((await find()).remind_at, "21:00");
  const base = { id: Number(id), userId, title: "Remind me", priority: "low" as const, tags: [], note: "", isActive: true, daysOfWeek: ["mon"], startDate: weekAgo, endDate: null };
  await db.updateRecurringTask(base);
  assert.equal((await find()).remind_at, "21:00");
  await db.updateRecurringTask({ ...base, remindAt: "07:30" });
  assert.equal((await find()).remind_at, "07:30");
  await db.updateRecurringTask({ ...base, remindAt: null });
  assert.equal((await find()).remind_at, null);
});

const push = await import("@/lib/db/push");

await test("push devices: register, move to another account, remove", async () => {
  const token = `test-token-${Date.now()}-abcdefghijklmnop`;
  await push.registerPushDevice(userId, token, "android");
  await push.registerPushDevice(userId, token, "android");
  assert.deepEqual(await push.getPushTokens(userId), [token]);

  const { rows: other } = await pool.query<{ id: number }>(
    `INSERT INTO users (name, email, password_hash) VALUES ('Other', $1, 'x:y') RETURNING id`,
    [`db-test-other-${Date.now()}@example.test`],
  );
  await push.registerPushDevice(other[0].id, token, "android");
  assert.deepEqual(await push.getPushTokens(userId), []);
  assert.deepEqual(await push.getPushTokens(other[0].id), [token]);

  assert.equal(await push.removePushDevice(userId, token), false);
  await push.forgetPushToken(token);
  assert.deepEqual(await push.getPushTokens(other[0].id), []);
  await pool.query(`DELETE FROM users WHERE id = $1`, [other[0].id]);
});

await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
await pool.end();

console.log(`\nDB Test Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
