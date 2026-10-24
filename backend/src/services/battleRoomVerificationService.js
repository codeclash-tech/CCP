import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import cron from "node-cron";
import mongoose from "mongoose";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import { executionService } from "./executionService.js";
import { composeProgram } from "./wrapperGenerator.js";
import { calculateQuestionScore } from "./battleRoomScoring.js";
import {
  sanitizeParticipantExecutionError,
  sanitizeParticipantTestResult,
} from "./participantExecutionSerialization.js";

const VERIFICATION_LEASE_MS = 10 * 60 * 1000;
const enabled = () => process.env.BATTLE_ROOM_PERF_LOGS === "true";
let workerRunning = false;
let workerScheduled = false;

function logVerification(event, details = {}) {
  if (!enabled()) return;
  console.info(
    "[ExecutionPerf] " +
      JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...details,
      }),
  );
}

async function claimNextVerification() {
  const now = new Date();
  const leaseId = randomUUID();
  const submission = await BattleRoomSubmission.findOneAndUpdate(
    {
      status: { $in: ["PENDING", "PROCESSING"] },
      questionResults: {
        $elemMatch: {
          $or: [
            { verificationStatus: "PENDING_VERIFICATION" },
            {
              verificationStatus: "VERIFYING",
              verificationLeaseExpiresAt: { $lte: now },
            },
          ],
        },
      },
    },
    {
      $set: {
        "questionResults.$.verificationStatus": "VERIFYING",
        "questionResults.$.verificationStartedAt": now,
        "questionResults.$.verificationLeaseExpiresAt": new Date(
          now.getTime() + VERIFICATION_LEASE_MS,
        ),
        "questionResults.$.verificationLeaseId": leaseId,
      },
      $inc: { "questionResults.$.verificationAttempts": 1 },
    },
    { new: true },
  )
    .select(
      "+questionResults.verificationTestCases +questionResults.verificationSignature +questionResults.verificationPoints",
    )
    .lean();

  if (!submission) return null;
  const questionResult = submission.questionResults.find(
    (result) => result.verificationLeaseId === leaseId,
  );
  if (!questionResult) {
    throw new Error("Claimed verification job could not be located.");
  }
  return { submission, questionResult, leaseId };
}

function buildExecutionResult(questionResult) {
  const cases = questionResult.verificationTestCases || [];
  const code = questionResult.code;
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("The persisted verification test cases are unavailable.");
  }
  const program =
    questionResult.verificationSignature?.name
      ? composeProgram(
          { signature: questionResult.verificationSignature },
          code,
          questionResult.language,
        )
      : code;
  return executionService.execute(program, cases, questionResult.language, {
    timeLimit: 5_000,
    memoryLimit: 131_072,
  });
}

export async function finalizeBattleRoomSubmission(submissionId) {
  const current = await BattleRoomSubmission.findById(submissionId)
    .select("status endRequestedAt questionResults")
    .lean();
  if (!current || !["PENDING", "PROCESSING"].includes(current.status)) return;

  const allQuestionsFinal = current.endRequestedAt
    ? (current.questionResults || []).every(
        (questionResult) =>
          !["PENDING_VERIFICATION", "VERIFYING", "ERROR"].includes(
            questionResult.verificationStatus,
          ),
      )
    : (current.questionResults || []).every(
        (questionResult) =>
          questionResult.verificationStatus === "VERIFIED" ||
          questionResult.status === "REJECTED",
      );
  if (!allQuestionsFinal) return;

  const openStatuses = [
    { verificationStatus: { $in: ["PENDING_VERIFICATION", "VERIFYING", "ERROR"] } },
  ];
  if (!current.endRequestedAt) {
    openStatuses.push({ status: { $in: ["PENDING", "PROCESSING"] } });
  }
  const filter = {
    _id: current._id,
    status: { $in: ["PENDING", "PROCESSING"] },
    questionResults: {
      $not: {
        $elemMatch: {
          $or: openStatuses,
        },
      },
    },
  };

  await BattleRoomSubmission.updateOne(
    filter,
    {
      $set: {
        status: "COMPLETED",
        submittedAt: new Date(),
        ...(current.endRequestedAt
          ? { "questionResults.$[unsubmitted].status": "REJECTED" }
          : {}),
      },
    },
    current.endRequestedAt
      ? {
          arrayFilters: [
            {
              "unsubmitted.status": "PENDING",
              "unsubmitted.verificationStatus": null,
            },
          ],
        }
      : undefined,
  );
}

async function saveVerificationResult(job, result, error = null) {
  const { submission, questionResult, leaseId } = job;
  const questionIndex = submission.questionResults.findIndex(
    (candidate) => candidate.verificationLeaseId === leaseId,
  );
  if (questionIndex < 0) {
    throw new Error("Verification result no longer matches its claimed job.");
  }

  const completedAt = new Date();
  const previous = submission.questionResults[questionIndex];
  if (error) {
    const verificationError = sanitizeParticipantExecutionError(
      "SYSTEM_ERROR",
      error.message,
    );
    const updated = await BattleRoomSubmission.updateOne(
      {
        _id: submission._id,
        status: { $in: ["PENDING", "PROCESSING"] },
        [`questionResults.${questionIndex}.verificationStatus`]: "VERIFYING",
        [`questionResults.${questionIndex}.verificationLeaseId`]: leaseId,
      },
      {
        $set: {
          [`questionResults.${questionIndex}.verificationStatus`]: "ERROR",
          [`questionResults.${questionIndex}.verificationCompletedAt`]: completedAt,
          [`questionResults.${questionIndex}.verificationError`]: verificationError,
          [`questionResults.${questionIndex}.verificationLeaseId`]: null,
          [`questionResults.${questionIndex}.verificationLeaseExpiresAt`]: null,
          [`questionResults.${questionIndex}.status`]: "ERROR",
          [`questionResults.${questionIndex}.error`]: verificationError,
        },
      },
    );
    if (updated.matchedCount) {
      logVerification("database_update", {
        submissionId: String(submission._id),
        questionId: String(questionResult.questionId),
        verificationStatus: "ERROR",
      });
    }
    return;
  }

  const testCases = questionResult.verificationTestCases || [];
  const visibleCount = testCases.filter((testCase) => !testCase.isHidden).length;
  const normalizedResults = (result.results || []).map((item, index) =>
    sanitizeParticipantTestResult({
      ...(item.testCaseId ? { testCaseId: item.testCaseId } : {}),
      testCase: item.testCase ?? index + 1,
      input: item.input ?? testCases[index]?.input ?? "",
      status: item.status,
      executionTime: item.executionTime ?? 0,
      memoryUsed: item.memoryUsed ?? 0,
      output: item.output ?? "",
      expectedOutput:
        index < visibleCount
          ? item.expectedOutput ?? testCases[index]?.expectedOutput ?? ""
          : "",
      error: item.error ?? "",
      isHidden: index >= visibleCount,
    }),
  );
  const passed = normalizedResults.filter((item) =>
    ["PASSED", "ACCEPTED"].includes(item.status),
  ).length;
  const total = testCases.length;
  const score = calculateQuestionScore(
    questionResult.verificationPoints,
    passed,
    total,
  );
  const updatedQuestionResult = {
    ...previous,
    status: result.status,
    score: Math.round(score * 100) / 100,
    passed,
    failed: total - passed,
    total,
    executionTime: Number(result.executionTime) || 0,
    memoryUsed: Number(result.memoryUsed) || 0,
    output: normalizedResults
      .slice(0, visibleCount)
      .map((item) => item.output || "")
      .join("\n"),
    error: sanitizeParticipantExecutionError(result.status, result.error),
    results: normalizedResults,
    verificationStatus: "VERIFIED",
    verificationCompletedAt: completedAt,
    verificationError: "",
    verificationLeaseId: null,
    verificationLeaseExpiresAt: null,
  };
  delete updatedQuestionResult.verificationTestCases;
  delete updatedQuestionResult.verificationSignature;
  delete updatedQuestionResult.verificationPoints;

  const updateStart = performance.now();
  const saved = await BattleRoomSubmission.updateOne(
    {
      _id: submission._id,
      status: { $in: ["PENDING", "PROCESSING"] },
      [`questionResults.${questionIndex}.verificationStatus`]: "VERIFYING",
      [`questionResults.${questionIndex}.verificationLeaseId`]: leaseId,
    },
    {
      $set: {
        [`questionResults.${questionIndex}`]: updatedQuestionResult,
      },
      $inc: {
        totalScore: updatedQuestionResult.score - (previous.score || 0),
        totalPassed: passed - (previous.passed || 0),
        totalFailed: total - passed - (previous.failed || 0),
      },
    },
  );
  logVerification("database_update", {
    submissionId: String(submission._id),
    questionId: String(questionResult.questionId),
    verificationStatus: saved.matchedCount ? "VERIFIED" : "STALE",
    durationMs: Number((performance.now() - updateStart).toFixed(3)),
  });
  if (saved.matchedCount) await finalizeBattleRoomSubmission(submission._id);
}

async function processNextVerification() {
  const job = await claimNextVerification();
  if (!job) return false;

  const startedAt = performance.now();
  logVerification("verification_started", {
    submissionId: String(job.submission._id),
    questionId: String(job.questionResult.questionId),
    queueWaitMs: Math.max(
      0,
      Date.now() -
        new Date(
          job.questionResult.verificationSubmittedAt ||
            job.questionResult.verificationStartedAt,
        ).getTime(),
    ),
  });

  try {
    logVerification("execution_started", {
      submissionId: String(job.submission._id),
      questionId: String(job.questionResult.questionId),
    });
    const result = await buildExecutionResult(job.questionResult);
    logVerification("execution_completed", {
      submissionId: String(job.submission._id),
      questionId: String(job.questionResult.questionId),
      status: result.status,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
    });
    if (["SYSTEM_ERROR", "INTERNAL_ENGINE_ERROR"].includes(result.status)) {
      await saveVerificationResult(
        job,
        null,
        new Error("The authoritative execution engine could not complete verification."),
      );
    } else {
      await saveVerificationResult(job, result);
    }
  } catch (error) {
    logVerification("verification_failed", {
      submissionId: String(job.submission._id),
      questionId: String(job.questionResult.questionId),
      error: error.message,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
    });
    await saveVerificationResult(job, null, error);
  }
  logVerification("verification_completed", {
    submissionId: String(job.submission._id),
    questionId: String(job.questionResult.questionId),
    durationMs: Number((performance.now() - startedAt).toFixed(3)),
  });
  return true;
}

async function drainVerifications() {
  if (mongoose.connection.readyState !== 1) return;
  if (workerRunning) return;
  workerRunning = true;
  try {
    while (await processNextVerification()) {
      // Drain persisted jobs one at a time per server instance.
    }
  } catch (error) {
    console.error("[BattleRoomVerification] Worker iteration failed:", error.message);
  } finally {
    workerRunning = false;
  }
}

export function wakeBattleRoomVerificationWorker() {
  setImmediate(() => {
    drainVerifications().catch((error) => {
      console.error("[BattleRoomVerification] Worker wake failed:", error.message);
    });
  });
}

export function startBattleRoomVerificationWorker() {
  if (workerScheduled) return;
  workerScheduled = true;
  cron.schedule("*/5 * * * * *", wakeBattleRoomVerificationWorker);
  wakeBattleRoomVerificationWorker();
}
