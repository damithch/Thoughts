import assert from "node:assert/strict";
import cases from "./query-intent-eval.json" with { type: "json" };
import { extractRagQueryIntent } from "../src/lib/temporal.ts";

const referenceDate = "2026-09-24";
const originalDate = Date;

// Keep this evaluation deterministic without changing application time behavior.
// The extractor uses Colombo's current date, so pin the clock for these examples.
globalThis.Date = class extends originalDate {
  constructor(...args: any[]) {
    if (args.length === 0) super(`${referenceDate}T12:00:00+05:30`);
    else super(args[0]);
  }
  static now() {
    return new originalDate(`${referenceDate}T12:00:00+05:30`).getTime();
  }
} as DateConstructor;

for (const testCase of cases) {
  const result = extractRagQueryIntent(testCase.query);
  assert.equal(result.rewrittenQuery, testCase.rewrittenQuery, testCase.query);
  if (testCase.fromDate) assert.equal(result.filters.fromDate, testCase.fromDate, testCase.query);
  if (testCase.toDate) assert.equal(result.filters.toDate, testCase.toDate, testCase.query);
  if (testCase.tag) assert.deepEqual(result.filters.tags, [testCase.tag], testCase.query);
  if (testCase.category) assert.deepEqual(result.filters.categories, [testCase.category], testCase.query);
  if (testCase.minMood) assert.equal(result.filters.minMood, testCase.minMood, testCase.query);
}

console.log(`Query intent evaluation passed (${cases.length} cases).`);
