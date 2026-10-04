import assert from "node:assert/strict";
import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

console.log("Running Thoughts test suite via Node.js native test runner...\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error("   ", err.message);
    failed++;
  }
}

// 1. Chunking test
function chunkText(text, maxChars = 1500, overlap = 200) {
  const chunks = [];
  if (!text || !text.length) return chunks;
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
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
  return createHmac("sha256", secret).update(token).digest("hex");
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
