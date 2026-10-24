import assert from "node:assert/strict";
import test from "node:test";
import {
  hashLocalTranscript,
  validateLocalExecutionTranscript,
} from "../src/services/localExecutionProtocol.js";

function makeTranscript(overrides = {}) {
  const start = Date.parse("2026-10-24T10:00:00.000Z");
  return {
    executionProtocolVersion: 1,
    executionId: "execution-1",
    submissionId: "submission-1",
    assessmentId: "assessment-1",
    challengeId: "challenge-1",
    challengeVersion: "version-1",
    sourceHash: "a".repeat(64),
    nonce: "b".repeat(64),
    clientVersion: "1.0.0",
    engineVersion: "1.0.0",
    testSetVersion: "test-set-1",
    language: "java",
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + 1000).toISOString(),
    durationMs: 1000,
    results: [
      {
        testCase: 1,
        status: "PASSED",
        executionTimeMs: 300,
        memoryUsedKb: 128,
      },
      {
        testCase: 2,
        status: "FAILED",
        executionTimeMs: 300,
        memoryUsedKb: 128,
      },
    ],
    result: { status: "WRONG_ANSWER", passed: 1, total: 2 },
    ...overrides,
  };
}

function expected() {
  return {
    executionId: "execution-1",
    submissionId: "submission-1",
    assessmentId: "assessment-1",
    challengeId: "challenge-1",
    challengeVersion: "version-1",
    sourceHash: "a".repeat(64),
    nonce: "b".repeat(64),
    clientVersion: "1.0.0",
    engineVersion: "1.0.0",
    testSetVersion: "test-set-1",
    testCount: 2,
    allowedClientVersion: "1.0.0",
    allowedEngineVersion: "1.0.0",
  };
}

test("validates transcript digest and derives result counts", () => {
  const transcript = makeTranscript();
  const validation = validateLocalExecutionTranscript({
    transcript,
    transcriptHash: hashLocalTranscript(transcript),
    expected: expected(),
    now: Date.parse("2026-10-24T10:01:00.000Z"),
  });

  assert.equal(validation.passed, 1);
  assert.equal(validation.failed, 1);
  assert.equal(validation.total, 2);
  assert.equal(validation.status, "WRONG_ANSWER");
  assert.deepEqual(validation.riskSignals, []);
});

test("rejects a transcript bound to a different source or challenge", () => {
  const transcript = makeTranscript();
  const digest = hashLocalTranscript(transcript);

  assert.throws(
    () =>
      validateLocalExecutionTranscript({
        transcript: { ...transcript, sourceHash: "c".repeat(64) },
        transcriptHash: digest,
        expected: expected(),
      }),
    /sourceHash does not match its grant/,
  );
});

test("rejects inconsistent test counts, forged summary data, and altered digests", () => {
  const transcript = makeTranscript();
  assert.throws(
    () =>
      validateLocalExecutionTranscript({
        transcript: { ...transcript, results: transcript.results.slice(0, 1) },
        transcriptHash: hashLocalTranscript(transcript),
        expected: expected(),
      }),
    /test count does not match/,
  );

  const inconsistent = makeTranscript({
    result: { status: "ACCEPTED", passed: 2, total: 2 },
  });

  test("flags unusually short local execution as a review signal without declaring misconduct", () => {
    const started = Date.parse("2026-10-24T10:00:00.000Z");
    const transcript = makeTranscript({
      startTime: new Date(started).toISOString(),
      endTime: new Date(started + 1).toISOString(),
      durationMs: 1,
    });
    const result = validateLocalExecutionTranscript({
      transcript,
      transcriptHash: hashLocalTranscript(transcript),
      expected: expected(),
      now: started + 10_000,
    });

    assert.deepEqual(result.riskSignals, ["UNUSUALLY_SHORT_EXECUTION"]);
    assert.equal(result.riskScore, 35);
    assert.equal(result.riskLevel, "MEDIUM");
  });
  assert.throws(
    () =>
      validateLocalExecutionTranscript({
        transcript: inconsistent,
        transcriptHash: hashLocalTranscript(inconsistent),
        expected: expected(),
      }),
    /summary does not match/,
  );

  const valid = makeTranscript();
  assert.throws(
    () =>
      validateLocalExecutionTranscript({
        transcript: valid,
        transcriptHash: "0".repeat(64),
        expected: expected(),
      }),
    /digest is invalid/,
  );
});

test("rejects invalid state-like timing and test result metadata", () => {
  const transcript = makeTranscript({
    endTime: "2026-10-24T09:59:59.000Z",
  });
  assert.throws(
    () =>
      validateLocalExecutionTranscript({
        transcript,
        transcriptHash: hashLocalTranscript(transcript),
        expected: expected(),
      }),
    /timing is invalid/,
  );

  const malformed = makeTranscript({
    results: [
      {
        testCase: 0,
        status: "PASSED",
        executionTimeMs: 300,
        memoryUsedKb: 128,
      },
      ...makeTranscript().results.slice(1),
    ],
  });
  assert.throws(
    () =>
      validateLocalExecutionTranscript({
        transcript: malformed,
        transcriptHash: hashLocalTranscript(malformed),
        expected: expected(),
      }),
    /result 1 is invalid/,
  );
});
