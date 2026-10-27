import Submission from "../models/Submission.js";
import Challenge from "../models/Challenge.js";
import User from "../models/User.js";

function calculateScore(passed, total) {
  const passRatio = total > 0 ? Math.min(1, Math.max(0, passed / total)) : 0;
  return Math.round(passRatio * 10000) / 100;
}

function parseExecutionResult(result) {
  const defaultResult = {
    status: "ERROR",
    accepted: false,
    passed: 0,
    failed: 0,
    total: 0,
    output: "",
    error: "No execution result received.",
    executionTime: 0,
    memoryUsed: 0,
    results: [],
  };

  if (!result) return defaultResult;

  try {
    const parsed = typeof result === "string" ? JSON.parse(result) : result;

    const results = (parsed.results || []).map((r, idx) => ({
      ...(r.testCaseId ? { testCaseId: String(r.testCaseId) } : {}),
      testCase: r.testCase ?? idx + 1,
      status: r.status || "ERROR",
      input: r.input ?? "",
      executionTime: r.executionTime ?? 0,
      memoryUsed: r.memoryUsed ?? 0,
      output: r.output ?? "",
      expectedOutput: r.expectedOutput ?? "",
      error: r.error ?? "",
    }));

    const passed = results.filter((r) => ["PASSED", "ACCEPTED"].includes(r.status)).length;
    const total = Number(parsed.total) || results.length;
    const caseFailures = results.length
      ? results.length - passed
      : Number(parsed.failed) || 0;
    const failed = ["PENDING", "PROCESSING"].includes(parsed.status)
      ? caseFailures
      : Math.max(caseFailures, Math.max(0, total - passed));
    const accepted =
      parsed.status === "ACCEPTED" &&
      total > 0 &&
      passed === total &&
      failed === 0;
    const status = accepted
      ? "ACCEPTED"
      : parsed.status && parsed.status !== "ACCEPTED"
        ? parsed.status
        : "WRONG_ANSWER";

    return {
      status,
      accepted,
      passed,
      failed,
      total,
      output: parsed.output ?? "",
      error: parsed.error ?? "",
      executionTime: parsed.executionTime ?? results.reduce((sum, r) => sum + r.executionTime, 0),
      memoryUsed: parsed.memoryUsed ?? results.reduce((sum, r) => sum + r.memoryUsed, 0),
      results,
    };
  } catch (e) {
    return { ...defaultResult, error: "Failed to parse execution result." };
  }
}

export async function createSubmission(userId, challengeId, code, language, timeToSolve) {
  const existingSubmission = await Submission.findOne({ userId, challengeId });
  if (existingSubmission) {
    throw new Error("You have already submitted a solution for this challenge. Each challenge allows only one submission.");
  }

  const challenge = await Challenge.findById(challengeId);
  if (!challenge) {
    throw new Error("Challenge not found.");
  }

  const submission = new Submission({
    userId,
    challengeId,
    code,
    language: language || "java",
    status: "PENDING",
    timeToSolve: timeToSolve || 0,
    total: challenge.testCases.length,
  });

  await submission.save();
  return submission;
}

export async function processSubmissionResult(submissionId, executionResult) {
  const submission = await Submission.findById(submissionId);
  if (!submission) {
    throw new Error("Submission not found.");
  }

  const parsed = parseExecutionResult(executionResult);

  submission.status = parsed.status;
  submission.passed = parsed.passed;
  submission.failed = parsed.failed;
  submission.total = parsed.total;
  submission.output = parsed.output;
  submission.error = parsed.error;
  submission.executionTime = parsed.executionTime;
  submission.memoryUsed = parsed.memoryUsed;
  submission.results = parsed.results;

  submission.score = calculateScore(
    parsed.passed,
    parsed.total,
    submission.timeToSolve,
    parsed.executionTime,
    parsed.memoryUsed
  );

  await submission.save();

  await updateUserStats(submission.userId, parsed.accepted, submission.score);
  await updateChallengeStats(submission.challengeId, parsed.accepted);

  return submission.toPublicJSON({ includeTestCaseDetails: true });
}

export async function disqualifySubmission(submissionId) {
  const submission = await Submission.findById(submissionId);
  if (!submission) {
    throw new Error("Submission not found.");
  }

  submission.status = "DISQUALIFIED";
  submission.isDisqualified = true;
  submission.score = 0;
  submission.passed = 0;
  submission.failed = 0;
  await submission.save();

  return submission.toPublicJSON();
}

export async function getSubmission(userId, challengeId) {
  return await Submission.findOne({ userId, challengeId }).sort({ createdAt: -1 });
}

async function updateUserStats(userId, accepted, score) {
  const user = await User.findById(userId);
  if (!user) return;

  if (accepted) {
    user.challengesCompleted += 1;
  }
  user.totalScore += score;
  user.lastActiveDate = new Date();
  await user.save();
}

async function updateChallengeStats(challengeId, accepted) {
  await Challenge.findByIdAndUpdate(challengeId, {
    $inc: {
      totalSubmissions: 1,
      ...(accepted ? { totalAccepted: 1 } : {}),
    },
  });
}
