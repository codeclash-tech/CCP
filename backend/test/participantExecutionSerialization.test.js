import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import BattleRoomSubmission from "../src/models/BattleRoomSubmission.js";
import {
  getVisibleExecutionOutput,
  sanitizeParticipantExecutionError,
  sanitizeParticipantTestResult,
} from "../src/services/participantExecutionSerialization.js";

test("does not serialize hidden test data or diagnostics for participants", () => {
  const result = sanitizeParticipantTestResult({
    testCaseId: "private-test-id",
    testCase: 2,
    status: "RUNTIME_ERROR",
    input: "secret hidden input",
    output: "secret hidden output",
    expectedOutput: "secret expected output",
    error: "RuntimeException: secret hidden input",
    executionTime: 25,
    memoryUsed: 2_048,
    isHidden: true,
  });

  assert.deepEqual(result, {
    testCase: 2,
    status: "RUNTIME_ERROR",
    executionTime: 25,
    memoryUsed: 2_048,
    isHidden: true,
  });
  assert.equal(
    sanitizeParticipantExecutionError(
      "RUNTIME_ERROR",
      "RuntimeException: secret hidden input",
    ),
    "Runtime error on one or more test cases.",
  );
  assert.equal(
    sanitizeParticipantExecutionError("COMPILATION_ERROR", "syntax error"),
    "syntax error",
  );
});

test("preserves visible diagnostics while excluding hidden stdout from aggregates", () => {
  const visible = sanitizeParticipantTestResult({
    testCaseId: "public-test-id",
    testCase: 1,
    status: "PASSED",
    input: "1 2",
    output: "3",
    expectedOutput: "3",
    error: "",
    executionTime: 4,
    memoryUsed: 1_024,
    isHidden: false,
  });
  const output = getVisibleExecutionOutput([
    visible,
    {
      isHidden: true,
      output: "hidden stdout",
    },
  ]);

  assert.equal(visible.input, "1 2");
  assert.equal(visible.output, "3");
  assert.equal(visible.expectedOutput, "3");
  assert.equal(output, "3");
  assert.equal(output.includes("hidden stdout"), false);
});

test("participant result serialization redacts stored hidden case data", () => {
  const questionId = new mongoose.Types.ObjectId();
  const submission = new BattleRoomSubmission({
    questionResults: [
      {
        questionId,
        questionTitle: "Private cases",
        status: "RUNTIME_ERROR",
        output: "visible output\nhidden output",
        error: "RuntimeException: secret hidden input",
        results: [
          {
            testCase: 1,
            status: "PASSED",
            input: "public input",
            output: "public output",
            expectedOutput: "public expected",
            error: "",
            isHidden: false,
          },
          {
            testCase: 2,
            status: "RUNTIME_ERROR",
            input: "secret hidden input",
            output: "secret hidden output",
            expectedOutput: "secret expected output",
            error: "RuntimeException: secret hidden input",
          },
        ],
      },
    ],
  });

  const result = submission.toPublicJSON({
    visibleTestCaseCounts: { [questionId.toString()]: 1 },
  }).questionResults[0];
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("secret hidden input"), false);
  assert.equal(serialized.includes("secret hidden output"), false);
  assert.equal(serialized.includes("secret expected output"), false);
  assert.equal(result.output, "public output");
  assert.equal(result.error, "Runtime error on one or more test cases.");
  assert.deepEqual(result.results[1], {
    testCase: 2,
    status: "RUNTIME_ERROR",
    executionTime: 0,
    memoryUsed: 0,
    isHidden: true,
  });
});
