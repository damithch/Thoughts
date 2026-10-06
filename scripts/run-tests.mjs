import assert from "node:assert/strict";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

import { appendRagFilterClauses, parseRagQueryFilters } from "../src/lib/rag-filters.ts";
import { rankHybridResults, selectDiverseResults } from "../src/lib/rag-retrieval.ts";
import { normalizeVector } from "../src/lib/embedding-config.ts";
import { buildResendRequest, RESEND_EMAILS_URL } from "../src/lib/resend-request.ts";
import {
  isValidTaskDate,
  normalizeTaskTags,
  normalizeTaskTitle,
  parseTaskId,
  parseTaskPriorityValue,
  parseTaskStatusValue,
} from "../src/lib/tasks/validation.ts";
import { getWeekdayCode, isRoutineScheduledOn } from "../src/lib/tasks/recurrence.ts";
import { describeUpcomingDays, resolveRelativeDate } from "../src/lib/tasks/dates.ts";
import { buildAgentPlan } from "../src/lib/tasks/agent-plan.ts";
import { computeDayStreak, routineAdherence } from "../src/lib/tasks/stats.ts";

console.log("Running Thoughts test suite via Node.js native test runner...\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  âœ“ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  âœ— ${name}`);
    console.error("   ", err.message);
    failed++;
  }
}

// 1. Chunking test
function chunkText(text, maxChars = 1500, overlap = 200) {
  const chunks = [];
  if (!text || !text.length) return chunks;
  const safeMaxChars = Number.isInteger(maxChars) && maxChars > 0 ? maxChars : 1500;
  const safeOverlap =
    Number.isInteger(overlap) && overlap >= 0
      ? Math.min(overlap, safeMaxChars - 1)
      : Math.min(200, safeMaxChars - 1);
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + safeMaxChars, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === text.length) break;
    start = end - safeOverlap;
  }
  return chunks;
}

test("chunkText: returns empty array for empty string", () => {
  assert.deepEqual(chunkText(""), []);
});

test("chunkText: keeps text under maxChars in single chunk", () => {
  const chunks = chunkText("Short text sample", 100, 20);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], "Short text sample");
});

test("chunkText: splits long string into overlapping chunks", () => {
  const text = "A".repeat(100);
  const chunks = chunkText(text, 40, 10);
  assert.ok(chunks.length > 1);
  assert.ok(chunks[0].length <= 40);
});

test("chunkText: terminates when overlap is equal to or greater than maxChars", () => {
  const text = "A".repeat(100);
  const equalOverlap = chunkText(text, 20, 20);
  const excessiveOverlap = chunkText(text, 20, 50);
  assert.ok(equalOverlap.length > 1);
  assert.ok(excessiveOverlap.length > 1);
  assert.ok(equalOverlap.length <= text.length);
  assert.ok(excessiveOverlap.length <= text.length);
  assert.ok(equalOverlap.every((chunk) => chunk.length <= 20));
  assert.ok(excessiveOverlap.every((chunk) => chunk.length <= 20));
  assert.equal(equalOverlap.at(-1), "A".repeat(20));
  assert.equal(excessiveOverlap.at(-1), "A".repeat(20));
});

// 2a. Metadata filter validation tests

test("filters: validates metadata filters and normalizes values", () => {
  const result = parseRagQueryFilters(
    {
      kinds: ["thought", "journal"],
      tags: ["  focus  ", " deep-work "],
      categories: ["  work ", "personal"],
      minMood: 3,
      maxMood: 9,
      fromDate: "2024-01-02",
      toDate: "2024-02-03",
    },
    ["thought", "journal", "summary"],
  );

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value.kinds, ["thought", "journal"]);
  assert.deepEqual(result.value.tags, ["focus", "deep-work"]);
  assert.deepEqual(result.value.categories, ["work", "personal"]);
  assert.equal(result.value.minMood, 3);
  assert.equal(result.value.maxMood, 9);
  assert.equal(result.value.fromDate, "2024-01-02");
  assert.equal(result.value.toDate, "2024-02-03");
});

test("filters: rejects invalid metadata filter inputs", () => {
  assert.equal(parseRagQueryFilters({ kinds: [] }, ["thought"]).error, "kinds must be a non-empty array.");
  assert.equal(parseRagQueryFilters({ kinds: ["ghost"] }, ["thought"]).error, "No requested document kinds are enabled.");
  assert.equal(parseRagQueryFilters({ tags: ["", "valid"] }, ["thought"]).error, "tags must contain non-empty strings.");
  assert.equal(parseRagQueryFilters({ categories: ["work", "  "] }, ["thought"]).error, "categories must contain non-empty strings.");
  assert.equal(parseRagQueryFilters({ minMood: 11 }, ["thought"]).error, "minMood must be a number between 1 and 10.");
  assert.equal(parseRagQueryFilters({ minMood: 8, maxMood: 7 }, ["thought"]).error, "minMood cannot be greater than maxMood.");
  assert.equal(parseRagQueryFilters({ fromDate: "2024-02-10", toDate: "2024-02-09" }, ["thought"]).error, "fromDate cannot be after toDate.");
  assert.equal(parseRagQueryFilters({ fromDate: "invalid-date" }, ["thought"]).error, "fromDate must be a valid YYYY-MM-DD date.");
});

test("filters: appends SQL clauses for metadata filters", () => {
  const clauses = [];
  const values = [];

  appendRagFilterClauses(
    clauses,
    values,
    {
      kinds: ["thought"],
      tags: ["alpha", "beta"],
      categories: ["work"],
      minMood: 4,
      maxMood: 7,
      fromDate: "2024-01-01",
      toDate: "2024-02-01",
    },
    "d",
  );

  assert.equal(clauses.length, 7);
  assert.deepEqual(values, [["thought"], ["alpha", "beta"], ["work"], 4, 7, "2024-01-01", "2024-02-01"]);
  assert.match(clauses[0], /document_kind = ANY\(\$1::text\[\]\)/);
  assert.match(clauses[1], /metadata->'tags'\) \?\| \$2::text\[\]/);
  assert.match(clauses[2], /metadata->>'category' = ANY\(\$3::text\[\]\)/);
  assert.match(clauses[3], /metadata->>'mood'\)\s*::numeric >= \$4/);
});

// 2b. Hybrid reranking and merge tests

test("hybrid: reranks merged vector and keyword results by weighted score", () => {
  const rows = [
    { document_key: "doc-a", distance: 0.3, keyword_rank: 1 },
    { document_key: "doc-b", distance: 0.1, keyword_rank: 0 },
    { document_key: "doc-c", distance: 0.2, keyword_rank: 8 },
  ];

  const ranked = rankHybridResults(rows);
  assert.deepEqual(ranked.map((row) => row.document_key), ["doc-c", "doc-a", "doc-b"]);
});

test("hybrid: preserves a per-document cap while merging diverse results", () => {
  const rows = [
    { document_key: "doc-1", distance: 0.8, keyword_rank: 2 },
    { document_key: "doc-1", distance: 0.2, keyword_rank: 3 },
    { document_key: "doc-2", distance: 0.1, keyword_rank: 6 },
    { document_key: "doc-3", distance: 0.4, keyword_rank: 4 },
    { document_key: "doc-4", distance: 0.6, keyword_rank: 5 },
  ];

  const selected = selectDiverseResults(rows, 4, 1);
  assert.deepEqual(selected.map((row) => row.document_key), ["doc-1", "doc-2", "doc-3", "doc-4"]);
  assert.equal(selected.length, 4);
});

// 2c. Embedding normalization tests

test("embeddings: normalizes vectors to unit length", () => {
  const normalized = normalizeVector([3, 4]);
  assert.deepEqual(normalized, [0.6, 0.8]);
  const length = Math.sqrt(normalizeVector([1, 2, 3, 4]).reduce((sum, v) => sum + v * v, 0));
  assert.ok(Math.abs(length - 1) < 1e-12);
});

test("embeddings: leaves zero vectors unchanged instead of dividing by zero", () => {
  assert.deepEqual(normalizeVector([0, 0, 0]), [0, 0, 0]);
});

// 2. Auth cryptography test
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, originalHash] = storedPassword.split(":");
  if (!salt || !originalHash) return false;
  const computedHash = scryptSync(password, salt, 64).toString("hex");
  const originalBuffer = Buffer.from(originalHash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");
  if (originalBuffer.length !== computedBuffer.length) return false;
  return timingSafeEqual(originalBuffer, computedBuffer);
}

test("auth: hashes and verifies password matching", () => {
  const pass = "SecurePass!123";
  const hashed = hashPassword(pass);
  assert.ok(hashed.includes(":"));
  assert.equal(verifyPassword(pass, hashed), true);
  assert.equal(verifyPassword("WrongPassword", hashed), false);
});

function hashResetToken(token, secret) {
  return scryptSync(token, secret, 64).toString("hex");
}

function forgotPasswordOutcome() {
  return "requested";
}

function consumeResetToken(state, tokenHash, nextPasswordHash, now = new Date()) {
  const record = state.tokens.find((item) => item.token_hash === tokenHash);
  if (!record) return { success: false, reason: "invalid" };
  if (record.used_at || record.revoked_at) return { success: false, reason: "already_used" };
  if (record.expires_at <= now) return { success: false, reason: "expired" };

  const user = state.users.find((item) => item.id === record.user_id);
  if (!user) return { success: false, reason: "invalid" };

  user.password_hash = nextPasswordHash;
  user.password_updated_at = now;
  record.used_at = now;
  state.tokens.forEach((item) => {
    if (item.user_id === user.id && item.id !== record.id && !item.used_at && !item.revoked_at) {
      item.revoked_at = now;
    }
  });

  return { success: true };
}

function isSessionValid(issuedAtMs, passwordUpdatedAt) {
  return issuedAtMs >= passwordUpdatedAt.getTime();
}

test("forgot password: unknown and known emails get same generic outcome", () => {
  const known = new Set(["known@example.com"]);
  assert.equal(forgotPasswordOutcome("known@example.com", known), "requested");
  assert.equal(forgotPasswordOutcome("unknown@example.com", known), "requested");
});

test("reset token hashing: hash is deterministic and never equals token", () => {
  const token = "plain-reset-token";
  const hashA = hashResetToken(token, "secret");
  const hashB = hashResetToken(token, "secret");
  assert.equal(hashA, hashB);
  assert.notEqual(hashA, token);
});

test("reset flow: valid token updates password and marks token used", () => {
  const now = new Date("2026-10-04T03:00:00.000Z");
  const user = { id: 1, password_hash: "old", password_updated_at: new Date("2026-10-04T02:00:00.000Z") };
  const state = {
    users: [user],
    tokens: [
      {
        id: 101,
        user_id: 1,
        token_hash: "valid",
        expires_at: new Date("2026-10-04T04:00:00.000Z"),
        used_at: null,
        revoked_at: null,
      },
    ],
  };
  const result = consumeResetToken(state, "valid", "newhash", now);
  assert.equal(result.success, true);
  assert.equal(user.password_hash, "newhash");
  assert.equal(user.password_updated_at.toISOString(), now.toISOString());
  assert.equal(state.tokens[0].used_at?.toISOString(), now.toISOString());
});

test("reset flow: invalid token is rejected", () => {
  const result = consumeResetToken({ users: [], tokens: [] }, "missing", "x");
  assert.equal(result.success, false);
  assert.equal(result.reason, "invalid");
});

test("reset flow: expired token is rejected", () => {
  const state = {
    users: [{ id: 1, password_hash: "old", password_updated_at: new Date("2026-10-04T02:00:00.000Z") }],
    tokens: [
      {
        id: 102,
        user_id: 1,
        token_hash: "expired",
        expires_at: new Date("2026-10-04T02:59:59.000Z"),
        used_at: null,
        revoked_at: null,
      },
    ],
  };
  const result = consumeResetToken(state, "expired", "newhash", new Date("2026-10-04T03:00:00.000Z"));
  assert.equal(result.success, false);
  assert.equal(result.reason, "expired");
});

test("reset flow: reused token is rejected", () => {
  const usedAt = new Date("2026-10-04T02:30:00.000Z");
  const state = {
    users: [{ id: 1, password_hash: "old", password_updated_at: new Date("2026-10-04T02:00:00.000Z") }],
    tokens: [
      {
        id: 103,
        user_id: 1,
        token_hash: "used",
        expires_at: new Date("2026-10-04T04:00:00.000Z"),
        used_at: usedAt,
        revoked_at: null,
      },
    ],
  };
  const result = consumeResetToken(state, "used", "newhash", new Date("2026-10-04T03:00:00.000Z"));
  assert.equal(result.success, false);
  assert.equal(result.reason, "already_used");
});

test("session invalidation: sessions issued before password reset become invalid", () => {
  const passwordUpdatedAt = new Date("2026-10-04T03:00:00.000Z");
  assert.equal(isSessionValid(new Date("2026-10-04T02:59:59.000Z").getTime(), passwordUpdatedAt), false);
  assert.equal(isSessionValid(new Date("2026-10-04T03:00:01.000Z").getTime(), passwordUpdatedAt), true);
});

test("auth: handles malformed password hash gracefully", () => {
  assert.equal(verifyPassword("pass", "malformedhash"), false);
  assert.equal(verifyPassword("pass", ""), false);
});

// 3. Time utility test
function shiftColomboDate(date, deltaDays) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
    value.getUTCDate(),
  ).padStart(2, "0")}`;
}

test("time: shifts dates forwards and backwards across boundaries", () => {
  assert.equal(shiftColomboDate("2026-06-22", 1), "2026-06-23");
  assert.equal(shiftColomboDate("2026-06-22", -1), "2026-06-21");
  assert.equal(shiftColomboDate("2026-01-01", -1), "2025-12-31");
});

// 4. Anchor streak calculation test
function calculateStreak(dates, today) {
  const yesterday = shiftColomboDate(today, -1);
  const dateSet = new Set(dates);
  const hasToday = dateSet.has(today);

  let currentStreak = 0;
  let checkDate = hasToday ? today : dateSet.has(yesterday) ? yesterday : null;

  if (checkDate) {
    while (dateSet.has(checkDate)) {
      currentStreak += 1;
      checkDate = shiftColomboDate(checkDate, -1);
    }
  }

  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate = null;
  const sortedDates = [...dates].sort();

  for (const d of sortedDates) {
    if (!previousDate) {
      runningStreak = 1;
    } else {
      const expectedNext = shiftColomboDate(previousDate, 1);
      if (d === expectedNext) {
        runningStreak += 1;
      } else if (d !== previousDate) {
        runningStreak = 1;
      }
    }
    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
    previousDate = d;
  }

  return { currentStreak, longestStreak, totalEntries: dates.length, hasToday };
}

test("anchor streak: accurately calculates active streak when today is logged", () => {
  const result = calculateStreak(["2026-09-18", "2026-09-17", "2026-09-16", "2026-09-14"], "2026-09-18");
  assert.equal(result.currentStreak, 3);
  assert.equal(result.longestStreak, 3);
  assert.equal(result.hasToday, true);
  assert.equal(result.totalEntries, 4);
});

test("anchor streak: preserves streak from yesterday when today is pending", () => {
  const result = calculateStreak(["2026-09-17", "2026-09-16"], "2026-09-18");
  assert.equal(result.currentStreak, 2);
  assert.equal(result.hasToday, false);
});

test("anchor streak: resets to 0 when gap is more than 1 day", () => {
  const result = calculateStreak(["2026-09-15", "2026-09-14"], "2026-09-18");
  assert.equal(result.currentStreak, 0);
  assert.equal(result.longestStreak, 2);
});


test("email: Resend request uses Bearer auth and sets a User-Agent", () => {
  const email = { from: "a@example.com", to: ["b@example.com"], subject: "Reset", text: "link" };
  const request = buildResendRequest("re_test_key", email);
  assert.equal(RESEND_EMAILS_URL, "https://api.resend.com/emails");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.Authorization, "Bearer re_test_key");
  assert.ok(request.headers["User-Agent"]);
  assert.deepEqual(JSON.parse(request.body), email);
});


test("tasks: accepts only real calendar dates", () => {
  assert.equal(isValidTaskDate("2026-10-10"), true);
  assert.equal(isValidTaskDate("2028-02-29"), true);
  assert.equal(isValidTaskDate("2026-02-29"), false);
  assert.equal(isValidTaskDate("2026-13-01"), false);
  assert.equal(isValidTaskDate("tomorrow"), false);
  assert.equal(isValidTaskDate("2026-10-10T00:00:00Z"), false);
  assert.equal(isValidTaskDate(undefined), false);
});

test("tasks: rejects unknown priorities, statuses and ids", () => {
  assert.equal(parseTaskPriorityValue("high"), "high");
  assert.equal(parseTaskPriorityValue("urgent"), null);
  assert.equal(parseTaskStatusValue("in_progress"), "in_progress");
  assert.equal(parseTaskStatusValue("completed"), null);
  assert.equal(parseTaskId("42"), 42);
  assert.equal(parseTaskId(7), 7);
  assert.equal(parseTaskId(-1), null);
  assert.equal(parseTaskId("1.5"), null);
  assert.equal(parseTaskId(null), null);
});

test("tasks: normalizes titles and tags", () => {
  assert.equal(normalizeTaskTitle("  Call bank  "), "Call bank");
  assert.equal(normalizeTaskTitle(42), "");
  assert.equal(normalizeTaskTitle("x".repeat(500)).length, 200);
  assert.deepEqual(normalizeTaskTags("Work, admin ,WORK,,"), ["work", "admin"]);
  assert.deepEqual(normalizeTaskTags(["A", 3, "b"]), ["a", "b"]);
  assert.deepEqual(normalizeTaskTags(undefined), []);
});


test("routines: weekday codes and schedule windows", () => {
  assert.equal(getWeekdayCode("2026-10-06"), "tue");
  assert.equal(getWeekdayCode("2026-10-11"), "sun");
  const weekdays = { days_of_week: ["mon", "tue", "wed", "thu", "fri"], start_date: "2026-10-01", end_date: "2026-10-31" };
  assert.equal(isRoutineScheduledOn(weekdays, "2026-10-06"), true);
  assert.equal(isRoutineScheduledOn(weekdays, "2026-10-11"), false);
  assert.equal(isRoutineScheduledOn(weekdays, "2026-09-30"), false);
  assert.equal(isRoutineScheduledOn(weekdays, "2026-11-02"), false);
  assert.equal(isRoutineScheduledOn({ ...weekdays, end_date: null }, "2027-03-01"), true);
});


test("dates: resolves relative phrases from a Tuesday", () => {
  const today = "2026-10-06"; // Tuesday
  const cases = {
    "today": "2026-10-06",
    "Tomorrow": "2026-10-07",
    "day after tomorrow": "2026-10-08",
    "in 3 days": "2026-10-09",
    "in two weeks": "2026-10-20",
    "friday": "2026-10-09",
    "this friday": "2026-10-09",
    "next friday": "2026-10-09",
    "tuesday": "2026-10-06",
    "next tuesday": "2026-10-13",
    "on monday": "2026-10-12",
    "next week": "2026-10-12",
    "oct 10": "2026-10-10",
    "10th of october": "2026-10-10",
    "jan 5": "2027-01-05",
    "2026-12-25": "2026-12-25",
  };
  for (const [phrase, expected] of Object.entries(cases)) {
    assert.equal(resolveRelativeDate(phrase, today), expected, phrase);
  }
  assert.equal(resolveRelativeDate("someday", today), null);
  assert.equal(resolveRelativeDate("feb 30", today), null);
  assert.match(describeUpcomingDays(today, 2), /2026-10-06 tuesday \(today\)\n2026-10-07 wednesday \(tomorrow\)/);
});

const agentContext = {
  today: "2026-10-06",
  defaultDate: "2026-10-06",
  tasks: [
    { id: 1, title: "Gym", status: "todo", priority: "medium", scheduled_date: "2026-10-06" },
    { id: 2, title: "Email", status: "todo", priority: "low", scheduled_date: "2026-10-06" },
    { id: 3, title: "Report", status: "todo", priority: "high", scheduled_date: "2026-10-07" },
  ],
};

test("agent plan: dates resolved in code win over the model's date", () => {
  const plan = buildAgentPlan(
    [{ tool: "create_task", title: "Call bank", priority: "high", when: "next friday", date: "2026-10-16" }],
    agentContext,
  );
  assert.equal(plan.operations[0].date, "2026-10-09");
  assert.equal(plan.operations[0].requiresConfirmation, false);
  assert.match(plan.operations[0].description, /Call bank.*2026-10-09.*high/);
});

test("agent plan: rejects unknown tasks, bad dates and bad values", () => {
  const plan = buildAgentPlan(
    [
      { tool: "delete_task", taskId: 99 },
      { tool: "create_task", title: "X", when: "someday soon" },
      { tool: "create_task", title: "Y", priority: "urgent" },
      { tool: "set_status", taskId: 1, status: "finished" },
      { tool: "drop_database" },
    ],
    agentContext,
  );
  assert.equal(plan.operations.length, 0);
  assert.equal(plan.rejected.length, 5);
});

test("agent plan: deletes and roll-forward need confirmation; small edits don't", () => {
  const plan = buildAgentPlan(
    [
      { tool: "set_status", taskId: 1, status: "done" },
      { tool: "update_task", taskId: 3, when: "tomorrow", priority: "low" },
      { tool: "delete_task", taskId: 2 },
      { tool: "roll_forward" },
      { tool: "create_task", title: "Inbox idea", toInbox: true },
    ],
    agentContext,
  );
  const byTool = Object.fromEntries(plan.operations.map((op) => [op.tool, op]));
  assert.equal(byTool.set_status.requiresConfirmation, false);
  assert.equal(byTool.update_task.requiresConfirmation, false);
  assert.equal(byTool.update_task.date, "2026-10-07");
  assert.equal(byTool.delete_task.requiresConfirmation, true);
  assert.equal(byTool.roll_forward.requiresConfirmation, true);
  assert.equal(byTool.create_task.date, null);
});

test("agent plan: three or more changes to existing tasks are a bulk change", () => {
  const plan = buildAgentPlan(
    [1, 2, 3].map((taskId) => ({ tool: "set_status", taskId, status: "done" })),
    agentContext,
  );
  assert.equal(plan.operations.length, 3);
  assert.ok(plan.operations.every((op) => op.requiresConfirmation));
});


test("stats: empty days don't break a streak and an unfinished today doesn't either", () => {
  const day = (date, total, done) => ({ date, total, done });
  const days = [
    day("2026-10-01", 2, 1), // broken
    day("2026-10-02", 1, 1),
    day("2026-10-03", 0, 0), // empty: neutral
    day("2026-10-04", 3, 3),
    day("2026-10-05", 2, 2),
    day("2026-10-06", 4, 1), // today, in progress
  ];
  assert.deepEqual(computeDayStreak(days, "2026-10-06"), { current: 3, best: 3 });
  assert.deepEqual(computeDayStreak([...days.slice(0, 5), day("2026-10-06", 2, 2)], "2026-10-06"), { current: 4, best: 4 });
  assert.deepEqual(computeDayStreak([day("2026-10-05", 1, 0)], "2026-10-06"), { current: 0, best: 0 });
});

test("stats: routine adherence counts missed days but not skips or today", () => {
  const routines = [
    { id: 1, title: "Gym", is_active: true, days_of_week: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], start_date: "2026-01-01", end_date: null },
    { id: 2, title: "Old", is_active: false, days_of_week: ["mon"], start_date: "2026-01-01", end_date: null },
  ];
  const days = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"];
  const tasks = [
    { recurring_task_id: 1, scheduled_date: "2026-10-02", status: "done" },
    { recurring_task_id: 1, scheduled_date: "2026-10-03", status: "skipped" },
    // 10-04: no task created -> missed
    { recurring_task_id: 1, scheduled_date: "2026-10-05", status: "todo" }, // left open -> missed
    { recurring_task_id: 1, scheduled_date: "2026-10-06", status: "todo" }, // today -> not yet
  ];
  assert.deepEqual(routineAdherence(routines, tasks, new Set(), days, "2026-10-06"), [
    { id: 1, title: "Gym", done: 1, scheduled: 3 },
  ]);
  assert.deepEqual(routineAdherence(routines, tasks, new Set(["1:2026-10-04"]), days, "2026-10-06")[0].scheduled, 2);
});


console.log(`\nTest Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
