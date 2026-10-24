import { createHash } from "node:crypto";

export const LOCAL_EXECUTION_PROTOCOL_VERSION = 1;
export const MAX_LOCAL_EXECUTION_DURATION_MS = 5 * 60 * 1000;

const RESULT_STATUSES = new Set([
  "ACCEPTED",
  "PASSED",
  "FAILED",
  "WRONG_ANSWER",
  "COMPILATION_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "SYSTEM_ERROR",
  "SECURITY_VIOLATION",
  "INTERNAL_ENGINE_ERROR",
  "OUTPUT_LIMIT_EXCEEDED",
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalTranscriptJson(transcript) {
  return JSON.stringify(canonicalize(transcript));
}

export function hashLocalTranscript(transcript) {
  return createHash("sha256")
    .update(canonicalTranscriptJson(transcript), "utf8")
    .digest("hex");
}

export function validateLocalExecutionTranscript({
  transcript,
  transcriptHash,
  expected,
  now = Date.now(),
}) {
  if (!transcript || typeof transcript !== "object" || Array.isArray(transcript)) {
    throw new TypeError("A local execution transcript is required.");
  }

  const requiredStrings = [
    "executionId",
    "submissionId",
    "assessmentId",
    "challengeId",
    "challengeVersion",
    "sourceHash",
    "nonce",
    "clientVersion",
    "engineVersion",
    "testSetVersion",
  ];
  if (
    requiredStrings.some(
      (field) =>
        typeof transcript[field] !== "string" || transcript[field].length === 0,
    )
  ) {
    throw new TypeError("The local execution transcript is incomplete.");
  }
  if (
    transcript.executionProtocolVersion !== LOCAL_EXECUTION_PROTOCOL_VERSION ||
    transcript.language !== "java" ||
    !/^[a-f\d]{64}$/i.test(transcript.sourceHash) ||
    !/^[a-f\d]{64}$/i.test(transcript.nonce) ||
    !/^[a-f\d]{64}$/i.test(transcriptHash || "")
  ) {
    throw new TypeError("The local execution transcript has invalid identifiers.");
  }

  for (const field of requiredStrings) {
    if (transcript[field] !== expected[field]) {
      throw new Error(`The local execution transcript ${field} does not match its grant.`);
    }
  }

  if (!Array.isArray(transcript.results) || transcript.results.length !== expected.testCount) {
    throw new TypeError("The local execution test count does not match the authorized test set.");
  }

  const startTime = Date.parse(transcript.startTime);
  const endTime = Date.parse(transcript.endTime);
  const duration = transcript.durationMs;
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    !Number.isSafeInteger(duration) ||
    duration < 0 ||
    duration > MAX_LOCAL_EXECUTION_DURATION_MS ||
    endTime < startTime ||
    Math.abs(endTime - startTime - duration) > 5_000 ||
    endTime > now + 60_000
  ) {
    throw new TypeError("The local execution transcript timing is invalid.");
  }

  const results = transcript.results.map((result, index) => {
    if (
      !result ||
      result.testCase !== index + 1 ||
      !RESULT_STATUSES.has(result.status) ||
      !Number.isFinite(result.executionTimeMs) ||
      result.executionTimeMs < 0 ||
      result.executionTimeMs > MAX_LOCAL_EXECUTION_DURATION_MS ||
      !Number.isFinite(result.memoryUsedKb) ||
      result.memoryUsedKb < 0
    ) {
      throw new TypeError(`Local execution result ${index + 1} is invalid.`);
    }
    return {
      testCase: result.testCase,
      status: result.status,
      executionTime: result.executionTimeMs,
      memoryUsed: result.memoryUsedKb,
    };
  });

  const passed = results.filter((result) =>
    ["PASSED", "ACCEPTED"].includes(result.status),
  ).length;
  const total = results.length;
  const firstFailure = results.find(
    (result) => !["PASSED", "ACCEPTED"].includes(result.status),
  );
  const expectedStatus =
    passed === total
      ? "ACCEPTED"
      : ["FAILED", "WRONG_ANSWER"].includes(firstFailure.status)
        ? "WRONG_ANSWER"
        : firstFailure.status;
  if (transcript.result?.passed !== passed || transcript.result?.total !== total) {
    throw new TypeError("The local execution summary does not match its test results.");
  }
  if (transcript.result?.status !== expectedStatus) {
    throw new TypeError("The local execution status does not match its test results.");
  }
  if (hashLocalTranscript(transcript) !== transcriptHash.toLowerCase()) {
    throw new TypeError("The local execution transcript digest is invalid.");
  }

  const riskSignals = [];
  if (duration < Math.max(1, total) * 2) riskSignals.push("UNUSUALLY_SHORT_EXECUTION");
  if (transcript.clientVersion !== expected.allowedClientVersion) {
    riskSignals.push("CLIENT_VERSION_MISMATCH");
  }
  if (transcript.engineVersion !== expected.allowedEngineVersion) {
    riskSignals.push("ENGINE_VERSION_MISMATCH");
  }

  const riskScore = Math.min(
    100,
    riskSignals.reduce((score, signal) => {
      if (signal === "UNUSUALLY_SHORT_EXECUTION") return score + 35;
      if (signal === "CLIENT_VERSION_MISMATCH" || signal === "ENGINE_VERSION_MISMATCH") {
        return score + 40;
      }
      return score;
    }, 0),
  );
  const riskLevel =
    riskScore >= 60 ? "HIGH" : riskScore >= 25 ? "MEDIUM" : "LOW";

  return {
    results,
    passed,
    failed: total - passed,
    total,
    status: expectedStatus,
    durationMs: duration,
    riskSignals,
    riskScore,
    riskLevel,
  };
}
