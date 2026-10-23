import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExecutionRequest } from "../src/main/executionRequest.js";

test("normalizes a valid Java request within engine limits", () => {
  assert.deepEqual(
    normalizeExecutionRequest({
      code: "class Main {}",
      language: "JAVA",
      testCases: [{ input: "1", expectedOutput: "1" }],
    }),
    {
      language: "JAVA",
      code: "class Main {}",
      timeLimit: 5_000,
      memoryLimit: 131_072,
      testCases: [{ input: "1", expectedOutput: "1" }],
    },
  );
});

test("rejects missing, excessive and invalid execution input", () => {
  assert.throws(
    () => normalizeExecutionRequest({ code: "", testCases: [{ input: "", expectedOutput: "" }] }),
    /cannot be empty/,
  );
  assert.throws(
    () => normalizeExecutionRequest({ code: "x", testCases: [] }),
    /At least one test case/,
  );
  assert.throws(
    () =>
      normalizeExecutionRequest({
        code: "x",
        testCases: Array.from({ length: 51 }, () => ({ input: "", expectedOutput: "" })),
      }),
    /No more than 50/,
  );
  assert.throws(
    () =>
      normalizeExecutionRequest({
        code: "x",
        language: "javascript",
        testCases: [{ input: "", expectedOutput: "" }],
      }),
    /Only Java/,
  );
});

test("rejects out-of-range limits and oversized case input", () => {
  assert.throws(
    () =>
      normalizeExecutionRequest({
        code: "x",
        timeLimit: 30_001,
        testCases: [{ input: "", expectedOutput: "" }],
      }),
    /time limit/,
  );
  assert.throws(
    () =>
      normalizeExecutionRequest({
        code: "x",
        testCases: [{ input: "x".repeat(5_001), expectedOutput: "" }],
      }),
    /input is invalid or too long/,
  );
  assert.throws(
    () =>
      normalizeExecutionRequest({
        code: "x",
        testCases: [{ input: "", expectedOutput: "x".repeat(100_001) }],
      }),
    /expected output is invalid or too long/,
  );
});
