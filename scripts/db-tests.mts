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

await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
await pool.end();

console.log(`\nDB Test Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
