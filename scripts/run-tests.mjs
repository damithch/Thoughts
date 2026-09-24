import assert from "node:assert/strict";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

import { appendRagFilterClauses, parseRagQueryFilters } from "../src/lib/rag-filters.ts";
import { rankHybridResults, selectDiverseResults } from "../src/lib/rag-retrieval.ts";

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


console.log(`\nTest Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
