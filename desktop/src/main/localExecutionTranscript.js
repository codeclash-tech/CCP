import { createHash } from "node:crypto";

const EXECUTION_PROTOCOL_VERSION = 1;

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

export function hashSource(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function createLocalExecutionTranscript({
  grant,
  sourceHash,
  execution,
  startedAt,
  finishedAt,
  durationMs,
  language = "java",
}) {
  if (!Array.isArray(execution?.results) || execution.results.length === 0) {
    throw new TypeError("The local engine returned no test results.");
  }
  const results = execution.results.map((result, index) => ({
    testCase: index + 1,
    status: String(result?.status || "").toUpperCase(),
    executionTimeMs: Math.max(0, Math.round(Number(result?.executionTime) || 0)),
    memoryUsedKb: Math.max(0, Math.round(Number(result?.memoryUsed) || 0)),
  }));
  const passed = results.filter((result) =>
    ["PASSED", "ACCEPTED"].includes(result.status),
  ).length;
  const firstFailure = results.find(
    (result) => !["PASSED", "ACCEPTED"].includes(result.status),
  );
  const status =
    passed === results.length
      ? "ACCEPTED"
      : ["FAILED", "WRONG_ANSWER"].includes(firstFailure.status)
        ? "WRONG_ANSWER"
        : firstFailure.status;
  const transcript = {
    executionProtocolVersion: EXECUTION_PROTOCOL_VERSION,
    executionId: grant.executionId,
    submissionId: grant.submissionId,
    assessmentId: grant.assessmentId,
    challengeId: grant.challengeId,
    challengeVersion: grant.challengeVersion,
    sourceHash,
    nonce: grant.nonce,
    clientVersion: grant.clientVersion,
    engineVersion: grant.engineVersion,
    testSetVersion: grant.testSetVersion,
    language,
    startTime: new Date(startedAt).toISOString(),
    endTime: new Date(finishedAt).toISOString(),
    durationMs: Math.max(0, Math.round(durationMs)),
    results,
    result: { status, passed, total: results.length },
  };
  const transcriptHash = createHash("sha256")
    .update(JSON.stringify(canonicalize(transcript)), "utf8")
    .digest("hex");
  return { transcript, transcriptHash };
}
