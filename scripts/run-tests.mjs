import assert from "node:assert/strict";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

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

console.log(`\nTest Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
