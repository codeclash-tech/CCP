import BattleRoom from "../models/BattleRoom.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import AssessmentIntegritySession from "../models/AssessmentIntegritySession.js";
import Nonce from "../models/Nonce.js";
import { createHash } from "node:crypto";
import { executionService } from "../services/executionService.js";
import {
  closeBattleRoomAndNotify,
  retryBattleRoomResultDelivery,
} from "../services/battleRoomClosureService.js";
import { composeProgram } from "../services/wrapperGenerator.js";
import {
  getStoredSignature,
  validateSignature,
} from "../services/signatureParser.js";
import { composeStarterFile } from "../services/languageTemplates.js";
import {
  getRoomReportData,
  streamCompleteRoomPDF,
  streamRoomResultsExcel,
  streamParticipantReportPDF,
} from "../services/reportService.js";
import {
  getRoomWindowState,
  isCodeExecutionAllowed,
  buildBlockedRoomPayload,
  hasScheduledWindow,
  ROOM_WINDOW_STATE,
} from "../services/scheduleGuard.js";
import {
  countRoomTestCases,
  calculateQuestionScore,
} from "../services/battleRoomScoring.js";
import {
  LOCAL_EXECUTION_PROTOCOL_VERSION,
  validateLocalExecutionTranscript,
} from "../services/localExecutionProtocol.js";
import {
  RANKED_SUBMISSION_STATUSES,
  getRoomSubmissionTime,
  sortRoomSubmissions,
} from "../services/battleRoomRanking.js";
import { getOrganizationProfileName } from "../utils/organizationProfile.js";
import { calculateIntegrityRisk } from "../services/assessmentIntegrityService.js";
import {
  normalizeAllowedEmails,
} from "../utils/battleRoomAccess.js";
import {
  sanitizeParticipantExecutionError,
  sanitizeParticipantTestResult,
} from "../services/participantExecutionSerialization.js";
import {
  finalizeBattleRoomSubmission,
  wakeBattleRoomVerificationWorker,
} from "../services/battleRoomVerificationService.js";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DESKTOP_CLIENT_VERSION = process.env.CODECLASH_DESKTOP_VERSION || "1.0.0";
const DESKTOP_ENGINE_VERSION = process.env.CODECLASH_ENGINE_VERSION || "1.0.0";

function hashVersion(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function getQuestionExecutionVersions(question) {
  const visibleTestCases = (question.visibleTestCases || []).map((testCase) => ({
    input: testCase.input,
    expectedOutput: testCase.expectedOutput ?? "",
  }));
  return {
    challengeVersion: hashVersion({
      title: question.title,
      description: question.description,
      signature: question.signature || null,
      points: Number(question.points) || 0,
      visibleTestCases,
    }),
    testSetVersion: hashVersion(visibleTestCases),
    visibleTestCases,
  };
}

function logBattleRoomSubmissionEvent(event, details) {
  if (process.env.BATTLE_ROOM_PERF_LOGS !== "true") return;
  console.info(
    "[ExecutionPerf] " +
      JSON.stringify({ event, timestamp: new Date().toISOString(), ...details }),
  );
}

function warmUpJudgeEngine() {
  executionService.warmUp().catch((error) => {
    console.warn("[BattleRoom] Judge engine warm-up failed:", error.message);
  });
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function isValidLanguage(lang) {
  return String(lang || "").toLowerCase() === "java";
}

function buildParticipantSubmissionResponse(
  questionResult,
  currentSubmission,
  visibleCount,
  hiddenCount,
) {
  const officialSubmissionFinal =
    currentSubmission.status === "COMPLETED" ||
    currentSubmission.status === "DISQUALIFIED";
  const verified =
    questionResult.verificationStatus === "VERIFIED" ||
    (!questionResult.verificationStatus &&
      !["PENDING", "PROCESSING", "ERROR"].includes(questionResult.status));
  const results = verified
    ? (questionResult.results || []).map(sanitizeParticipantTestResult)
    : [];
  const visibleResults = results.slice(0, visibleCount);
  const hiddenResults = results.slice(visibleCount);
  const isPassed = (result) =>
    result.status === "PASSED" || result.status === "ACCEPTED";
  const visiblePassed =
    visibleResults.length > 0
      ? visibleResults.filter(isPassed).length
      : Math.min(visibleCount, questionResult.passed || 0);
  const hiddenPassed =
    hiddenResults.length > 0
      ? hiddenResults.filter(isPassed).length
      : Math.min(
          hiddenCount,
          Math.max(0, (questionResult.passed || 0) - visiblePassed),
        );
  const allCompleted = currentSubmission.questionResults.every(
    (result) =>
      result.verificationStatus === "VERIFIED" ||
      (!result.verificationStatus &&
        !["PENDING", "PROCESSING", "ERROR"].includes(result.status)) ||
      result.status === "REJECTED",
  );

  return {
    message: verified ? "Solution verified." : "Submission received.",
    submissionId: currentSubmission._id,
    questionResult: {
      questionId: questionResult.questionId,
      questionTitle: questionResult.questionTitle,
      language: questionResult.language,
      status: questionResult.status,
      verificationStatus:
        questionResult.verificationStatus || (verified ? "VERIFIED" : null),
      executionMode: questionResult.executionMode || "SERVER_VERIFIED",
      verificationSubmittedAt: questionResult.verificationSubmittedAt || null,
      verificationStartedAt: questionResult.verificationStartedAt || null,
      verificationCompletedAt: questionResult.verificationCompletedAt || null,
      verificationError: questionResult.verificationError || "",
      score: verified ? questionResult.score : null,
      passed: verified ? questionResult.passed : null,
      failed: verified ? questionResult.failed : null,
      total: questionResult.total,
      executionTime: verified ? questionResult.executionTime : null,
      memoryUsed: verified ? questionResult.memoryUsed : null,
      timeToSolve: questionResult.timeToSolve,
      output: "",
      error: sanitizeParticipantExecutionError(
        questionResult.status,
        questionResult.error,
      ),
      visiblePassed: verified ? visiblePassed : null,
      visibleFailed: verified ? visibleCount - visiblePassed : null,
      hiddenCount,
      hiddenPassed: verified ? hiddenPassed : null,
      hiddenFailed: verified ? hiddenCount - hiddenPassed : null,
      results,
    },
    status: questionResult.status,
    verificationStatus:
      questionResult.verificationStatus || (verified ? "VERIFIED" : null),
    score: verified ? questionResult.score : null,
    passed: verified ? questionResult.passed : null,
    failed: verified ? questionResult.failed : null,
    total: questionResult.total,
    executionTime: questionResult.executionTime,
    memoryUsed: questionResult.memoryUsed,
    hiddenPassed,
    hiddenFailed: hiddenCount - hiddenPassed,
    totalScore: officialSubmissionFinal ? currentSubmission.totalScore : null,
    totalPassed: officialSubmissionFinal ? currentSubmission.totalPassed : null,
    totalFailed: officialSubmissionFinal ? currentSubmission.totalFailed : null,
    submissionStatus: currentSubmission.status,
    allCompleted,
  };
}

export async function finalizeDesktopLocalSubmission(req, res) {
  let nonceClaim = null;
  try {
    const { roomCode } = req.params;
    const { transcript, transcriptHash } = req.body || {};
    if (!/^[A-Z0-9]{6}$/i.test(roomCode || "")) {
      return res.status(400).json({ error: "A valid battle room code is required." });
    }
    if (!transcript || typeof transcript !== "object" || Array.isArray(transcript)) {
      return res.status(400).json({ error: "A local execution transcript is required." });
    }
    if (transcript.executionProtocolVersion !== LOCAL_EXECUTION_PROTOCOL_VERSION) {
      return res.status(400).json({ error: "The execution protocol version is unsupported." });
    }

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    }).lean();
    if (!room) return res.status(404).json({ error: "Battle room not found." });

    const submission = await BattleRoomSubmission.findOne({
      roomId: room._id,
      userId: req.userId,
    }).lean();
    if (!submission) {
      return res.status(403).json({ error: "You have not joined this battle." });
    }
    if (submission.status === "DISQUALIFIED") {
      return res.status(403).json({ error: "You have been disqualified." });
    }

    const question = room.questions.find(
      (candidate) => String(candidate._id) === transcript.challengeId,
    );
    if (!question) {
      return res.status(404).json({ error: "Question not found in this room." });
    }
    const questionIndex = submission.questionResults.findIndex(
      (result) => String(result.questionId) === transcript.challengeId,
    );
    if (questionIndex < 0) {
      return res.status(403).json({ error: "Question is not assigned to your submission." });
    }

    const previous = submission.questionResults[questionIndex];
    if (submission.status === "COMPLETED" || previous.executionId) {
      return res.status(409).json({
        error: "This local execution has already been finalized.",
        code: "DUPLICATE_FINALIZATION",
      });
    }

    const { challengeVersion, testSetVersion, visibleTestCases } =
      getQuestionExecutionVersions(question);
    const sourceHash = transcript.sourceHash;
    const nonceResource =
      `${room._id}:${submission._id}:${question._id}:${sourceHash}:${transcript.executionId}:${challengeVersion}:${testSetVersion}:${DESKTOP_CLIENT_VERSION}:${DESKTOP_ENGINE_VERSION}`;
    if (typeof transcript.nonce !== "string" || !/^[a-f\d]{64}$/i.test(transcript.nonce)) {
      return res.status(400).json({ error: "A valid execution grant is required." });
    }
    if (!isCodeExecutionAllowed(room)) {
      const windowState = getRoomWindowState(room);
      return res.status(403).json({
        error:
          windowState.state === ROOM_WINDOW_STATE.NOT_STARTED
            ? "Challenge has not started yet."
            : "Time is up! The battle has ended.",
        windowState: windowState.state,
        serverTime: windowState.now.toISOString(),
      });
    }

    const validation = validateLocalExecutionTranscript({
      transcript,
      transcriptHash,
      expected: {
        executionId: transcript.executionId,
        assessmentId: String(room._id),
        submissionId: String(submission._id),
        challengeId: String(question._id),
        challengeVersion,
        sourceHash,
        nonce: transcript.nonce,
        clientVersion: DESKTOP_CLIENT_VERSION,
        engineVersion: DESKTOP_ENGINE_VERSION,
        testSetVersion,
        testCount: visibleTestCases.length,
        allowedClientVersion: DESKTOP_CLIENT_VERSION,
        allowedEngineVersion: DESKTOP_ENGINE_VERSION,
      },
    });

    nonceClaim = await Nonce.claimDesktopSubmission(
      req.userId,
      transcript.nonce,
      nonceResource,
    );
    if (!nonceClaim.nonce || !nonceClaim.claimed) {
      return res.status(409).json({
        error: "The local execution grant is invalid, expired, or already used.",
        code: "EXECUTION_GRANT_REJECTED",
      });
    }

    const submittedAt = new Date();
    const resultDetails = validation.results.map((result, index) => ({
      testCase: index + 1,
      status: result.status,
      executionTime: result.executionTime,
      memoryUsed: result.memoryUsed,
      isHidden: false,
    }));
    const passed = validation.passed;
    const total = validation.total;
    const failed = total - passed;
    const score = calculateQuestionScore(
      Number(question.points) || 0,
      passed,
      total,
    );
    const timeToSolve = Math.max(
      0,
      Math.floor((submittedAt - new Date(submission.startTime)) / 1000),
    );
    const result = {
      ...previous,
      revision: (previous.revision || 0) + 1,
      executionId: transcript.executionId,
      sourceHash,
      executionMode: "DESKTOP_LOCAL",
      transcriptHash: transcriptHash.toLowerCase(),
      clientVersion: transcript.clientVersion,
      engineVersion: transcript.engineVersion,
      executionProtocolVersion: transcript.executionProtocolVersion,
      riskSignals: validation.riskSignals,
      riskScore: validation.riskScore,
      riskLevel: validation.riskLevel,
      executionTranscript: transcript,
      code: "",
      language: "java",
      status: validation.status,
      verificationStatus: "VERIFIED",
      verificationSubmittedAt: submittedAt,
      verificationStartedAt: new Date(transcript.startTime),
      verificationCompletedAt: new Date(transcript.endTime),
      verificationError: "",
      verificationAttempts: 1,
      verificationTestCases: [],
      verificationSignature: null,
      verificationPoints: 0,
      score,
      passed,
      failed,
      total,
      executionTime: validation.durationMs,
      memoryUsed: Math.max(...validation.results.map((item) => item.memoryUsed), 0),
      timeToSolve,
      output: "",
      error: "",
      results: resultDetails,
    };
    delete result._id;

    const saved = await BattleRoomSubmission.updateOne(
      {
        _id: submission._id,
        status: { $in: ["PENDING", "PROCESSING"] },
        [`questionResults.${questionIndex}.revision`]: previous.revision || 0,
        [`questionResults.${questionIndex}.executionId`]: previous.executionId || "",
        [`questionResults.${questionIndex}.verificationStatus`]:
          previous.verificationStatus ?? null,
      },
      {
        $set: {
          [`questionResults.${questionIndex}`]: result,
          status: "PROCESSING",
        },
        $inc: {
          totalScore: score - (previous.score || 0),
          totalPassed: passed - (previous.passed || 0),
          totalFailed: failed - (previous.failed || 0),
        },
      },
    );
    if (saved.matchedCount !== 1) {
      await Nonce.releaseDesktopSubmission(
        nonceClaim.nonce._id,
        nonceClaim.claimId,
      );
      nonceClaim = null;
      return res.status(409).json({
        error: "The submission changed while the local result was being finalized.",
        code: "SUBMISSION_STATE_CHANGED",
      });
    }

    const completedGrant = await Nonce.completeDesktopSubmission(
      nonceClaim.nonce._id,
      nonceClaim.claimId,
    );
    if (!completedGrant) {
      console.error("[LocalSubmission] Result saved but the execution grant could not be finalized.", {
        executionId: transcript.executionId,
        requestId: req.requestId || "",
      });
    }
    nonceClaim = null;
    await finalizeBattleRoomSubmission(String(submission._id));
    const currentSubmission = await BattleRoomSubmission.findById(submission._id).lean();
    if (currentSubmission?.status === "COMPLETED") {
      try {
        await AssessmentIntegritySession.updateMany(
          {
            assessmentType: "BATTLE_ROOM",
            assessmentId: room._id,
            userId: req.userId,
            finalizedAt: null,
          },
          { $set: { finalizedAt: new Date() } },
        );
      } catch (error) {
        console.error("[AssessmentIntegrity] Could not finalize Battle Room event sessions:", {
          message: error.message,
          submissionId: String(submission._id),
        });
      }
    }
    logBattleRoomSubmissionEvent("local_submission_finalized", {
      executionId: transcript.executionId,
      submissionId: String(submission._id),
      userId: String(req.userId),
      riskSignals: validation.riskSignals,
      requestId: req.requestId || "",
    });
    return res.status(201).json(
      buildParticipantSubmissionResponse(
        result,
        currentSubmission,
        visibleTestCases.length,
        0,
      ),
    );
  } catch (error) {
    if (nonceClaim?.claimed && nonceClaim.nonce) {
      await Nonce.releaseDesktopSubmission(
        nonceClaim.nonce._id,
        nonceClaim.claimId,
      );
    }
    console.error("Finalize local Battle Room submission error:", {
      message: error?.message || String(error),
      requestId: req.requestId || "",
    });
    return res.status(error instanceof TypeError ? 400 : 500).json({
      error: error.message || "Could not finalize the local execution result.",
    });
  }
}

/**
 * Robustly parse date, time, and timezone parameters into UTC Date objects.
 *
 * IMPORTANT: Room scheduling is ALWAYS stored as UTC Date objects in MongoDB.
 * Comparison with server time `new Date()` is timezone-safe because both are
 * in UTC epoch milliseconds, regardless of browser or server timezone.
 *
 * Timezone string is stored for reference only (for the UI to display back to
 * the creator what timezone they selected), but is never used for access
 * control decisions. All access decisions use UTC Date comparison only.
 *
 * Handles:
 * 1. ISO 8601 timestamps (direct pass-through)
 * 2. Date picker + time string inputs with timezone conversion
 *    Examples: "2026-01-15", "03:30 PM", "15:30" (24h), timezone="Asia/Kolkata"
 */
function parseSchedule({
  startDate,
  endDate,
  startTime,
  endTime,
  scheduledDate,
  scheduledStartTime,
  scheduledEndTime,
  timezone = "UTC",
  durationMinutes = 60,
}) {
  const now = new Date();
  const tz = timezone || "UTC";

  // 1. Direct ISO 8601 strings or timestamp inputs (highest priority)
  const scheduledStart = startDate || startTime;
  const scheduledEnd = endDate || endTime;
  if (scheduledStart || scheduledEnd) {
    if (!scheduledStart || !scheduledEnd) {
      throw new Error("Both scheduled start and end timestamps are required.");
    }
    const s = new Date(scheduledStart);
    const e = new Date(scheduledEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      throw new Error("Scheduled start and end timestamps must be valid.");
    }
    if (e <= s) {
      throw new Error("Scheduled end time must be after the start time.");
    }
    return { start: s, end: e, timezone: tz };
  }

  // 2. Scheduled Date + Time string inputs (date picker workflow)
  if (scheduledDate || scheduledStartTime || scheduledEndTime) {
    if (!scheduledDate || !scheduledStartTime || !scheduledEndTime) {
      throw new Error(
        "A scheduled battle requires a date, start time, and end time.",
      );
    }
    const parseTimeString = (dateStr, timeStr) => {
      const trimmed = (timeStr || "").trim();
      // Match "3:30 PM", "3:30", "15:30", "15:30 PM" (12h and 24h formats)
      const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*([aApP][mM]))?$/);
      if (!match) return null;
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const meridiem = match[3] ? match[3].toUpperCase() : null;
      if (
        minutes > 59 ||
        hours > (meridiem ? 12 : 23) ||
        (hours < 1 && meridiem)
      ) {
        return null;
      }

      // Convert 12-hour to 24-hour if meridiem is specified
      if (meridiem === "PM" && hours < 12) hours += 12;
      if (meridiem === "AM" && hours === 12) hours = 0;

      const pad = (n) => String(n).padStart(2, "0");
      // ISO format: YYYY-MM-DDTHH:mm:ss
      const localIso = `${dateStr}T${pad(hours)}:${pad(minutes)}:00`;

      // Handle known timezones directly
      if (tz === "UTC") {
        return new Date(`${localIso}Z`);
      }
      if (tz === "Asia/Kolkata" || tz === "IST") {
        // IST is UTC+05:30
        return new Date(`${localIso}+05:30`);
      }

      // For other timezones, use Intl API to get offset (best-effort)
      try {
        const targetDate = new Date(`${dateStr}T12:00:00Z`);
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          timeZoneName: "longOffset",
        });
        const parts = formatter.formatToParts(targetDate);
        const tzPart = parts.find((p) => p.type === "timeZoneName");
        // Extract offset like "GMT+05:30" or "GMT-08:00"
        const offsetMatch = tzPart?.value?.match(/GMT([+-]\d{2}):(\d{2})/);
        if (offsetMatch) {
          return new Date(`${localIso}${offsetMatch[1]}:${offsetMatch[2]}`);
        }
      } catch (err) {
        // Intl API failed, fall through to default
      }

      // Fallback: treat as UTC if we can't determine offset
      return new Date(`${localIso}Z`);
    };

    const s = parseTimeString(scheduledDate, scheduledStartTime);
    const e = parseTimeString(scheduledDate, scheduledEndTime);

    if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) {
      throw new Error("Enter a valid scheduled date, start time, and end time.");
    }
    if (e <= s) {
      throw new Error("Scheduled end time must be after the start time.");
    }
    return { start: s, end: e, timezone: tz };
  }

  // 3. Fallback: No schedule provided. Start immediately with given duration.
  const start = now;
  const end = new Date(now.getTime() + (durationMinutes || 60) * 60 * 1000);
  return { start, end, timezone: tz };
}

/**
 * Shared execution helper for authoring-format questions.
 * Uses the stored structured signature for composition.
 * Stateless: only touches the execution engine, never the DB.
 */
async function executeComposedQuestion(question, code, language, testCases) {
  const sig = question.signature;
  if (!sig || !sig.name) {
    throw new Error("Question has no valid function signature.");
  }
  const parsedSig = getStoredSignature(sig);
  const program = composeProgram(
    { signature: parsedSig, problemType: question.problemType || "array" },
    code,
    language,
    { isFullProgram: true },
  );
  return executionService.execute(program, testCases, language, {
    timeLimit: 5000,
    memoryLimit: 131072,
  });
}

/**
 * Generate fresh Java starter code from a question's signature.
 */
function generateFreshStarters(question) {
  if (!question.signature || !question.signature.name) return {};
  const sig = getStoredSignature(question.signature);
  return { java: composeStarterFile(sig, "java") };
}

export async function createRoom(req, res) {
  try {
    const {
      title,
      description,
      questions,
      maxParticipants,
      scheduledDate,
      scheduledStartTime,
      scheduledEndTime,
      timezone,
      candidateAccess = "OPEN",
      allowedEmails,
      moderationAction = "DISQUALIFY",
      allowLeaderboard = true,
      allowReuse = true,
      // Legacy timestamp aliases remain accepted for existing clients.
      startDate: rawStartDate,
      endDate: rawEndDate,
      startTime: rawStartTime,
      endTime: rawEndTime,
    } = req.body;
    const userId = req.userId;

    if (!["OPEN", "ALLOWLIST"].includes(candidateAccess)) {
      return res.status(400).json({ error: "candidateAccess must be OPEN or ALLOWLIST." });
    }
    if (!["FLAG", "DISQUALIFY"].includes(moderationAction) ||
      typeof allowLeaderboard !== "boolean" ||
      typeof allowReuse !== "boolean") {
      return res.status(400).json({ error: "Room moderation and rules settings are invalid." });
    }
    let normalizedAllowedEmails;
    try {
      normalizedAllowedEmails = normalizeAllowedEmails(allowedEmails);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (candidateAccess === "ALLOWLIST" && normalizedAllowedEmails.length === 0) {
      return res.status(400).json({ error: "An allowlisted room must include at least one candidate email." });
    }

    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 120 ||
      !Array.isArray(questions) ||
      questions.length === 0
    ) {
      return res
        .status(400)
        .json({
          error:
            "A title of at most 120 characters and at least one question are required.",
        });
    }

    if (questions.length > 20) {
      return res
        .status(400)
        .json({ error: "Maximum 20 questions per battle room." });
    }

    if (
      maxParticipants !== undefined &&
      (!Number.isInteger(maxParticipants) || maxParticipants < 1)
    ) {
      return res
        .status(400)
        .json({ error: "Maximum participants must be a positive whole number." });
    }

    const calendarScheduleProvided = Boolean(
      scheduledDate || scheduledStartTime || scheduledEndTime,
    );
    const directScheduleProvided = Boolean(
      rawStartDate || rawEndDate || rawStartTime || rawEndTime,
    );
    if (!calendarScheduleProvided && !directScheduleProvided) {
      return res.status(400).json({
        error: "A battle date, start time, and end time are required.",
      });
    }
    if (calendarScheduleProvided && directScheduleProvided) {
      return res.status(400).json({
        error:
          "Provide either calendar schedule fields or start/end timestamps, not both.",
      });
    }

    const roomLanguages = ["java"];

    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (
        !q ||
        typeof q.title !== "string" ||
        !q.title.trim() ||
        typeof q.description !== "string" ||
        !q.description.trim()
      ) {
        return res.status(400).json({
          error: `Question ${i + 1} must have a title and description.`,
        });
      }
      if (!Array.isArray(q.visibleTestCases) || q.visibleTestCases.length < 3) {
        return res.status(400).json({
          error: `Question ${i + 1} must have at least three visible test cases.`,
        });
      }
      if (!Array.isArray(q.hiddenTestCases) || q.hiddenTestCases.length === 0) {
        return res.status(400).json({
          error: `Question ${i + 1} must have at least one hidden test case.`,
        });
      }
      for (const tc of q.visibleTestCases) {
        if (
          !tc ||
          typeof tc.input !== "string" ||
          tc.expectedOutput === undefined ||
          tc.expectedOutput === null
        ) {
          return res.status(400).json({
            error: `Question ${i + 1} has invalid visible test case format.`,
          });
        }
      }
      for (const tc of q.hiddenTestCases) {
        if (
          !tc ||
          typeof tc.input !== "string" ||
          tc.expectedOutput === undefined ||
          tc.expectedOutput === null
        ) {
          return res.status(400).json({
            error: `Question ${i + 1} has invalid hidden test case format.`,
          });
        }
      }
    }

    // Generate unique room code
    let roomCode = generateRoomCode();
    let existing = await BattleRoom.findOne({
      roomCode,
      isActive: true,
      isDeleted: false,
    });
    let attempts = 0;
    while (existing && attempts < 10) {
      roomCode = generateRoomCode();
      existing = await BattleRoom.findOne({
        roomCode,
        isActive: true,
        isDeleted: false,
      });
      attempts++;
    }

    if (attempts >= 10) {
      return res.status(500).json({
        error: "Failed to generate unique room code. Please try again.",
      });
    }

    // Process each question: store structured signature, generate fresh starter code
    const processedQuestions = [];
    for (const q of questions) {
      let starterCodeByLanguage = q.starterCodeByLanguage || {};
      let functionName = q.functionName || "";
      let signature = q.signature || null;

      // If a raw functionSignature is provided, parse it into structured signature.
      if (q.functionSignature && !signature) {
        const sigResult = validateSignature(q.functionSignature);
        if (sigResult.valid) {
          signature = sigResult.parsed;
          functionName = sigResult.parsed.name;
        }
      }

      // Generate fresh starter code from signature (never persisted — generated on room read)
      if (signature && signature.name) {
        functionName = signature.name;
        starterCodeByLanguage = {}; // Fresh starters will be generated on room read
      }

      processedQuestions.push({
        title: q.title.trim(),
        description: q.description.trim(),
        explanation: q.explanation || "",
        constraints: q.constraints || "",
        difficulty: q.difficulty || "MEDIUM",
        category: q.category || "Custom",
        tags: q.tags || [],
        examples: q.examples || [],
        hints: q.hints || [],
        signature: signature,
        starterCode:
          q.starterCode ||
          starterCodeByLanguage["java"] ||
          "",
        starterCodeByLanguage, // Will be populated on read with fresh starters
        visibleTestCases: q.visibleTestCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          description: tc.description || "",
          parameterValues: tc.parameterValues || null,
        })),
        hiddenTestCases: q.hiddenTestCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          parameterValues: tc.parameterValues || null,
        })),
        points: q.points || 100,
        problemType: q.problemType || "array",
        functionSignature: q.functionSignature || "",
        functionName,
        expectedOutputSource: q.expectedOutputSource || "manual",
        referenceSolution: q.referenceSolution || "",
        referenceSolutionLanguage: "java",
        wrapperByLanguage: q.wrapperByLanguage || {},
      });
    }

    const now = new Date();

    // Parse scheduled start/end into UTC Date objects using the shared helper
    let parsedStartTime;
    let parsedEndTime;
    try {
      ({ start: parsedStartTime, end: parsedEndTime } = parseSchedule({
        startDate: rawStartDate || null,
        endDate: rawEndDate || null,
        startTime: rawStartTime || null,
        endTime: rawEndTime || null,
        scheduledDate: scheduledDate || null,
        scheduledStartTime: scheduledStartTime || null,
        scheduledEndTime: scheduledEndTime || null,
        timezone: timezone || "UTC",
        durationMinutes: 1,
      }));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const scheduledDurationMinutes = Math.ceil(
      (parsedEndTime.getTime() - parsedStartTime.getTime()) / 60000,
    );
    if (scheduledDurationMinutes < 1 || scheduledDurationMinutes > 2000 * 10080) {
      return res.status(400).json({
        error: "Scheduled battle duration is outside the supported range.",
      });
    }
    const durationUnits = [
      { unit: "weeks", minutes: 10080 },
      { unit: "days", minutes: 1440 },
      { unit: "hours", minutes: 60 },
      { unit: "minutes", minutes: 1 },
    ];
    const duration = durationUnits.find(
      ({ minutes }) =>
        scheduledDurationMinutes % minutes === 0 &&
        scheduledDurationMinutes / minutes <= 2000,
    );
    const tValue = duration
      ? scheduledDurationMinutes / duration.minutes
      : scheduledDurationMinutes;
    const tUnit = duration?.unit || "minutes";

    const room = new BattleRoom({
      roomCode,
      title: title.trim(),
      description: description || "",
      createdBy: userId,
      questions: processedQuestions,
      languages: roomLanguages,
      candidateAccess,
      allowedEmails: normalizedAllowedEmails,
      timeLimit: tValue,
      timeLimitUnit: tUnit,
      status: "UPCOMING",
      isScheduled: true,
      maxParticipants: maxParticipants || 100,
      moderationAction,
      allowLeaderboard,
      allowReuse,
      scheduledDate: scheduledDate || "",
      scheduledStartTime: scheduledStartTime || "",
      scheduledEndTime: scheduledEndTime || "",
      timezone: timezone || "UTC",
      startTime: parsedStartTime || null,
      endTime: parsedEndTime || null,
      startDate: parsedStartTime || null,
      endDate: parsedEndTime || null,
      expiresAt: new Date(now.getTime() + ONE_YEAR_MS),
    });

    await room.save();

    return res.status(201).json({
      message: "Battle room created successfully!",
      room: room.toCreatorJSON(),
      roomKey: room.roomCode,
    });
  } catch (error) {
    console.error("Create battle room error:", error.message);
    return res.status(500).json({ error: "Failed to create battle room." });
  }
}

/**
 * Attach fresh starter code to a question object.
 */
function attachFreshStartersToQuestion(q) {
  if (q.signature && q.signature.name) {
    const freshStarters = generateFreshStarters(q);
    q.starterCodeByLanguage = freshStarters;
    q.starterCode =
      freshStarters["java"] ||
      freshStarters["java"] ||
      q.starterCode ||
      "";
  }
  return q;
}

// Reuse the immutable question set while requiring the owner to explicitly
// choose fresh restrictions for the new battle instance.
export async function reuseRoom(req, res) {
  try {
    const source = await BattleRoom.findOne({
      roomCode: req.params.roomCode.toUpperCase(),
      createdBy: req.userId,
      isDeleted: false,
    });
    if (!source)
      return res.status(404).json({ error: "Battle room not found." });
    if (!source.allowReuse)
      return res
        .status(403)
        .json({ error: "Reuse is disabled for this room." });
    const { timeLimit, timeLimitUnit, maxParticipants } = req.body;
    let roomCode = generateRoomCode();
    while (await BattleRoom.exists({ roomCode })) roomCode = generateRoomCode();
    const room = new BattleRoom({
      roomCode,
      title: source.title,
      description: source.description,
      createdBy: req.userId,
      questions: source.questions.map((question) => question.toObject()),
      timeLimit: timeLimit || source.timeLimit,
      timeLimitUnit: timeLimitUnit || source.timeLimitUnit,
      maxParticipants: maxParticipants || source.maxParticipants,
      languages: ["java"],
      moderationAction: "DISQUALIFY",
      allowLeaderboard: true,
      allowReuse: true,
      status: "UPCOMING",
      endDate: new Date(
        Date.now() +
          (timeLimit || source.timeLimit) *
            ({
              minutes: 60_000,
              hours: 3_600_000,
              days: 86_400_000,
              weeks: 604_800_000,
            }[timeLimitUnit || source.timeLimitUnit] || 60_000),
      ),
      expiresAt: new Date(Date.now() + ONE_YEAR_MS),
    });
    await room.save();
    return res.status(201).json({
      message: "Battle room reused.",
      room: room.toCreatorJSON(),
      roomKey: room.roomCode,
    });
  } catch (error) {
    console.error("Reuse battle room error:", error.message);
    return res.status(500).json({ error: "Failed to reuse battle room." });
  }
}

export async function startRoom(req, res) {
  try {
    const { roomCode } = req.params;
    const userId = req.userId;
    const organization = getOrganizationProfileName(req.user) || "Unspecified";

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    }).select("+allowedEmails");
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    if (room.createdBy.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "Only the room creator can start the battle." });
    }

    if (hasScheduledWindow(room)) {
      return res.status(400).json({
        error:
          "This battle is scheduled to run at its configured start and end times.",
      });
    }

    if (room.status !== "UPCOMING") {
      return res
        .status(400)
        .json({ error: "Battle room has already started or ended." });
    }

    const now = new Date();
    const durationMinutes = room.getDurationMinutes();
    room.status = "ACTIVE";
    room.startTime = now;
    room.endTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
    room.startDate = room.startTime;
    room.endDate = room.endTime;
    await room.save();
    warmUpJudgeEngine();

    // Auto-join the creator so they can submit solutions and get a score.
    const existingCreatorSubmission = await BattleRoomSubmission.findOne({
      roomId: room._id,
      userId,
    });
    if (!existingCreatorSubmission) {
      const creatorSubmission = new BattleRoomSubmission({
        roomId: room._id,
        userId,
        participantName: req.user?.name || "Participant",
        participantOrganization: organization,
        questionResults: room.questions.map((q) => ({
          questionId: q._id,
          questionTitle: q.title,
          status: "PENDING",
          score: 0,
          passed: 0,
          failed: 0,
          total: q.visibleTestCases.length + q.hiddenTestCases.length,
        })),
        totalQuestions: room.questions.length,
        status: "PENDING",
        startTime: now,
      });
      await creatorSubmission.save();
      await BattleRoom.findByIdAndUpdate(room._id, {
        $inc: { participantCount: 1 },
      });
    }

    return res.status(200).json({
      message: "Battle room started!",
      room: room.toCreatorJSON(),
      roomKey: room.roomCode,
    });
  } catch (error) {
    console.error("Start battle room error:", error.message);
    return res.status(500).json({ error: "Failed to start battle room." });
  }
}

async function findOwnedEditableRoom(roomCode, userId) {
  const room = await BattleRoom.findOne({
    roomCode: String(roomCode || "").toUpperCase(),
    isActive: true,
    isDeleted: false,
  }).select("+allowedEmails");
  if (!room) return { error: "Battle room not found.", status: 404 };
  if (String(room.createdBy) !== String(userId)) {
    return { error: "Only the room creator can manage this battle room.", status: 403 };
  }
  if (
    room.status !== "UPCOMING" ||
    new Date(room.startDate || room.startTime || 0) <= new Date()
  ) {
    return { error: "Saved room content can be edited only before the room starts.", status: 409 };
  }
  const [submissionCount, participants] = await Promise.all([
    BattleRoomSubmission.countDocuments({ roomId: room._id }),
    Promise.resolve(room.participants || []),
  ]);
  if (submissionCount > 0 || participants.length > 0) {
    return { error: "Room content cannot be changed after a candidate has joined.", status: 409 };
  }
  return { room };
}

export async function getRoomForEdit(req, res) {
  try {
    const result = await findOwnedEditableRoom(req.params.roomCode, req.userId);
    if (!result.room) return res.status(result.status).json({ error: result.error });
    return res.json({ room: result.room.toEditJSON() });
  } catch (error) {
    console.error("Load battle room edit data error:", error.message);
    return res.status(500).json({ error: "Could not load saved room for editing." });
  }
}

export async function updateRoom(req, res) {
  try {
    const result = await findOwnedEditableRoom(req.params.roomCode, req.userId);
    if (!result.room) return res.status(result.status).json({ error: result.error });
    const room = result.room;
    const {
      title,
      description,
      questions,
      maxParticipants,
      startDate,
      endDate,
      timezone,
      candidateAccess = "OPEN",
      allowedEmails,
      moderationAction = "DISQUALIFY",
      allowLeaderboard = true,
      allowReuse = true,
    } = req.body || {};
    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 120 ||
      !Array.isArray(questions) ||
      questions.length < 1 ||
      questions.length > 20
    ) {
      return res.status(400).json({
        error: "A title of at most 120 characters and between 1 and 20 questions are required.",
      });
    }
    if (
      !Number.isInteger(maxParticipants) ||
      maxParticipants < Math.max(1, room.participantCount || 0)
    ) {
      return res.status(400).json({
        error: "Maximum participants must be a whole number no lower than the current participant count.",
      });
    }
    if (!["OPEN", "ALLOWLIST"].includes(candidateAccess)) {
      return res.status(400).json({ error: "candidateAccess must be OPEN or ALLOWLIST." });
    }
    if (!["FLAG", "DISQUALIFY"].includes(moderationAction) ||
      typeof allowLeaderboard !== "boolean" ||
      typeof allowReuse !== "boolean") {
      return res.status(400).json({ error: "Room moderation and rules settings are invalid." });
    }
    let normalizedAllowedEmails;
    try {
      normalizedAllowedEmails = normalizeAllowedEmails(allowedEmails);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (candidateAccess === "ALLOWLIST" && normalizedAllowedEmails.length === 0) {
      return res.status(400).json({ error: "An allowlisted room must include at least one candidate email." });
    }

    const processedQuestions = [];
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      if (
        !question ||
        typeof question.title !== "string" ||
        !question.title.trim() ||
        typeof question.description !== "string" ||
        !question.description.trim() ||
        !Array.isArray(question.visibleTestCases) ||
        question.visibleTestCases.length < 3 ||
        !Array.isArray(question.hiddenTestCases) ||
        question.hiddenTestCases.length < 1
      ) {
        return res.status(400).json({
          error: `Question ${index + 1} needs a title, description, at least three visible cases, and one hidden case.`,
        });
      }
      for (const testCase of [...question.visibleTestCases, ...question.hiddenTestCases]) {
        if (
          !testCase ||
          typeof testCase.input !== "string" ||
          testCase.expectedOutput === undefined ||
          testCase.expectedOutput === null
        ) {
          return res.status(400).json({ error: `Question ${index + 1} has an invalid test case.` });
        }
      }
      let signature = question.signature || null;
      let functionName = question.functionName || "";
      let starterCodeByLanguage = question.starterCodeByLanguage || {};
      if (question.functionSignature && !signature) {
        const signatureResult = validateSignature(question.functionSignature);
        if (!signatureResult.valid) {
          return res.status(400).json({ error: `Question ${index + 1} has an invalid function signature.` });
        }
        signature = signatureResult.parsed;
        functionName = signature.name;
      }
      if (signature?.name) {
        functionName = signature.name;
        starterCodeByLanguage = {};
      }
      processedQuestions.push({
        title: question.title.trim(),
        description: question.description.trim(),
        explanation: question.explanation || "",
        constraints: question.constraints || "",
        difficulty: question.difficulty || "MEDIUM",
        category: question.category || "Custom",
        tags: question.tags || [],
        examples: question.examples || [],
        hints: question.hints || [],
        signature,
        starterCode: question.starterCode || starterCodeByLanguage.java || "",
        starterCodeByLanguage,
        visibleTestCases: question.visibleTestCases.map((testCase) => ({
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          description: testCase.description || "",
          parameterValues: testCase.parameterValues || null,
        })),
        hiddenTestCases: question.hiddenTestCases.map((testCase) => ({
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          parameterValues: testCase.parameterValues || null,
        })),
        points: question.points || 100,
        problemType: question.problemType || "array",
        functionSignature: question.functionSignature || "",
        functionName,
        expectedOutputSource: question.expectedOutputSource || "manual",
        referenceSolution: question.referenceSolution || "",
        referenceSolutionLanguage: "java",
        wrapperByLanguage: question.wrapperByLanguage || {},
      });
    }

    let schedule;
    try {
      schedule = parseSchedule({
        startDate: startDate || null,
        endDate: endDate || null,
        timezone: timezone || room.timezone || "UTC",
        durationMinutes: 1,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const start = new Date(schedule.start);
    const end = new Date(schedule.end);
    const now = new Date();
    const durationMinutes = Math.ceil((end.getTime() - start.getTime()) / 60000);
    if (start <= now || durationMinutes < 1 || durationMinutes > 2000 * 10080) {
      return res.status(400).json({ error: "Choose a future schedule within the supported duration." });
    }
    const durationUnits = [
      { unit: "weeks", minutes: 10080 },
      { unit: "days", minutes: 1440 },
      { unit: "hours", minutes: 60 },
      { unit: "minutes", minutes: 1 },
    ];
    const duration = durationUnits.find(({ minutes }) =>
      durationMinutes % minutes === 0 && durationMinutes / minutes <= 2000,
    );
    room.title = title.trim();
    room.description = typeof description === "string" ? description : "";
    room.questions = processedQuestions;
    room.maxParticipants = maxParticipants;
    room.candidateAccess = candidateAccess;
    room.allowedEmails = normalizedAllowedEmails;
    room.moderationAction = moderationAction;
    room.allowLeaderboard = allowLeaderboard;
    room.allowReuse = allowReuse;
    room.timezone = timezone || room.timezone || "UTC";
    room.scheduledDate = "";
    room.scheduledStartTime = "";
    room.scheduledEndTime = "";
    room.startTime = start;
    room.endTime = end;
    room.startDate = start;
    room.endDate = end;
    room.timeLimit = duration ? durationMinutes / duration.minutes : durationMinutes;
    room.timeLimitUnit = duration?.unit || "minutes";
    await room.save();
    return res.json({ message: "Battle room updated.", room: room.toCreatorJSON() });
  } catch (error) {
    console.error("Update battle room error:", error.message);
    return res.status(500).json({ error: "Could not update the saved battle room." });
  }
}

export async function getRoomParticipants(req, res) {
  try {
    const room = await BattleRoom.findOne({
      roomCode: String(req.params.roomCode || "").toUpperCase(),
      isActive: true,
      isDeleted: false,
    }).select("+allowedEmails");
    if (!room) return res.status(404).json({ error: "Battle room not found." });
    if (String(room.createdBy) !== String(req.userId)) {
      return res.status(403).json({ error: "Only the room creator can view candidate access and participants." });
    }
    const participants = await BattleRoomSubmission.find({ roomId: room._id })
      .sort({ createdAt: 1 })
      .select("userId participantEmail participantName participantOrganization status totalScore submittedAt startTime createdAt")
      .lean();
    const [securitySubmissions, integritySessions] = await Promise.all([
      BattleRoomSubmission.find({ roomId: room._id })
        .select(
          "userId questionResults.questionId questionResults.executionId questionResults.sourceHash questionResults.executionMode questionResults.transcriptHash questionResults.clientVersion questionResults.engineVersion questionResults.executionProtocolVersion questionResults.riskSignals questionResults.riskScore questionResults.riskLevel questionResults.status questionResults.score questionResults.passed questionResults.total questionResults.executionTime +questionResults.executionTranscript",
        )
        .lean(),
      AssessmentIntegritySession.find({
        assessmentType: "BATTLE_ROOM",
        assessmentId: room._id,
      }).lean(),
    ]);
    const sessionsByUser = new Map();
    for (const session of integritySessions) {
      const userId = String(session.userId);
      const sessions = sessionsByUser.get(userId) || [];
      sessions.push(session);
      sessionsByUser.set(userId, sessions);
    }
    const participantNameByUser = new Map(
      participants.map((participant) => [
        String(participant.userId),
        participant.participantName,
      ]),
    );
    const sourceHashGroups = new Map();
    for (const submission of securitySubmissions) {
      for (const result of submission.questionResults || []) {
        if (
          result.executionMode !== "DESKTOP_LOCAL" ||
          !result.sourceHash ||
          ["PENDING", "PROCESSING"].includes(result.status)
        ) {
          continue;
        }
        const key = `${result.questionId}:${result.sourceHash}`;
        const matching = sourceHashGroups.get(key) || [];
        matching.push({
          submissionId: String(submission._id),
          userId: String(submission.userId),
        });
        sourceHashGroups.set(key, matching);
      }
    }
    const reportByUser = new Map();
    for (const submission of securitySubmissions) {
      const sessions = sessionsByUser.get(String(submission.userId)) || [];
      const executions = (submission.questionResults || [])
        .filter((result) => result.executionMode === "DESKTOP_LOCAL")
        .map((result) => {
          const transcript = result.executionTranscript;
          return {
            questionId: String(result.questionId),
            executionMode: result.executionMode,
            executionId: result.executionId,
            sourceHash: result.sourceHash,
            transcriptHash: result.transcriptHash,
            clientVersion: result.clientVersion,
            engineVersion: result.engineVersion,
            executionProtocolVersion: result.executionProtocolVersion,
            resultStatus: result.status,
            score: result.score,
            passed: result.passed,
            total: result.total,
            riskSignals: result.riskSignals,
            riskScore: result.riskScore,
            riskLevel: result.riskLevel,
            exactSourceMatches: (sourceHashGroups.get(
              `${result.questionId}:${result.sourceHash}`,
            ) || [])
              .filter((match) => match.userId !== String(submission.userId))
              .map((match) => ({
                submissionId: match.submissionId,
                candidateName:
                  participantNameByUser.get(match.userId) || "Unknown participant",
              })),
            timeline: transcript
              ? {
                  startTime: transcript.startTime,
                  endTime: transcript.endTime,
                  durationMs: transcript.durationMs,
                  testOutcomes: (transcript.results || []).map((outcome) => ({
                    testCase: outcome.testCase,
                    status: outcome.status,
                    executionTimeMs: outcome.executionTimeMs,
                    memoryUsedKb: outcome.memoryUsedKb,
                  })),
                }
              : null,
          };
        });
      const integrityRisk = calculateIntegrityRisk(
        sessions.flatMap((session) => session.events),
      );
      const executionRiskScore = Math.max(
        0,
        ...executions.map((execution) => execution.riskScore || 0),
      );
      const hasExactSourceMatch = executions.some(
        (execution) => execution.exactSourceMatches.length > 0,
      );
      const riskScore = Math.min(
        100,
        executionRiskScore +
          integrityRisk.riskScore +
          (hasExactSourceMatch ? 40 : 0),
      );
      reportByUser.set(String(submission.userId), {
        executions,
        integritySessions: sessions.map((session) => ({
          sessionId: session.sessionId,
          startedAt: session.startedAt,
          lastEventAt: session.lastEventAt,
          lastSequence: session.lastSequence,
          events: [...session.events].sort(
            (left, right) => left.sequence - right.sequence,
          ),
          ...calculateIntegrityRisk(session.events),
        })),
        riskScore,
        riskLevel:
          riskScore >= 60 ? "HIGH" : riskScore >= 25 ? "MEDIUM" : "LOW",
        evidenceOnly: true,
      });
    }
    for (const session of integritySessions) {
      const userId = String(session.userId);
      if (reportByUser.has(userId)) continue;
      const sessions = sessionsByUser.get(userId) || [];
      reportByUser.set(userId, {
        executions: [],
        integritySessions: sessions.map((item) => ({
          sessionId: item.sessionId,
          startedAt: item.startedAt,
          lastEventAt: item.lastEventAt,
          lastSequence: item.lastSequence,
          events: [...item.events].sort(
            (left, right) => left.sequence - right.sequence,
          ),
          ...calculateIntegrityRisk(item.events),
        })),
        ...calculateIntegrityRisk(
          sessions.flatMap((item) => item.events),
        ),
        evidenceOnly: true,
      });
    }
    return res.json({
      room: {
        roomCode: room.roomCode,
        title: room.title,
        status: room.computeCurrentStatus(),
        candidateAccess: room.candidateAccess || "OPEN",
        allowedEmails: room.allowedEmails || [],
      },
      participants: participants.map((participant) => ({
        ...participant,
        securityReport: reportByUser.get(String(participant.userId)) || null,
      })),
    });
  } catch (error) {
    console.error("Load room candidates error:", error.message);
    return res.status(500).json({ error: "Could not load room candidates." });
  }
}

export async function updateRoomAllowlist(req, res) {
  try {
    const room = await BattleRoom.findOne({
      roomCode: String(req.params.roomCode || "").toUpperCase(),
      isActive: true,
      isDeleted: false,
    }).select("+allowedEmails");
    if (!room) return res.status(404).json({ error: "Battle room not found." });
    if (String(room.createdBy) !== String(req.userId)) {
      return res.status(403).json({ error: "Only the room creator can manage candidate access." });
    }
    const candidateAccess = req.body?.candidateAccess;
    if (!["OPEN", "ALLOWLIST"].includes(candidateAccess)) {
      return res.status(400).json({ error: "candidateAccess must be OPEN or ALLOWLIST." });
    }
    let allowedEmails;
    try {
      allowedEmails = normalizeAllowedEmails(req.body?.allowedEmails);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (candidateAccess === "ALLOWLIST" && allowedEmails.length === 0) {
      return res.status(400).json({ error: "An allowlisted room must include at least one candidate email." });
    }
    room.candidateAccess = candidateAccess;
    room.allowedEmails = allowedEmails;
    await room.save();
    return res.json({
      candidateAccess: room.candidateAccess,
      allowedEmails: room.allowedEmails,
    });
  } catch (error) {
    console.error("Update room candidate access error:", error.message);
    return res.status(500).json({ error: "Could not update candidate access." });
  }
}

export async function getRoomByCode(req, res) {
  try {
    const { roomCode } = req.params;
    const userId = req.userId;

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    }).select("+allowedEmails");
    if (!room) {
      return res
        .status(404)
        .json({ error: "Battle room not found or has been deleted." });
    }

    const isCreator = room.createdBy.toString() === userId.toString();

    // Authoritative schedule check computed on the server. Never trust the
    // client clock or the mutable `status` field to gate room access.
    const windowState = getRoomWindowState(room);

    // The creator always retains access for review and reporting, regardless
    // of the schedule window.
    if (!isCreator && windowState.state !== ROOM_WINDOW_STATE.ACTIVE) {
      const userSubmission = await BattleRoomSubmission.findOne({
        roomId: room._id,
        userId,
      })
        .select("status totalScore submittedAt totalPassed totalFailed totalQuestions questionResults")
        .lean();

      return res.status(200).json({
        room: buildBlockedRoomPayload(room, windowState),
        isCreator: false,
        isParticipant: !!userSubmission,
        questionsVisible: false,
        timeRemaining: 0,
        userSubmission: userSubmission
          ? {
              status: userSubmission.status,
              totalScore:
                ["COMPLETED", "DISQUALIFIED"].includes(userSubmission.status)
                  ? userSubmission.totalScore
                  : null,
              submittedAt: userSubmission.submittedAt,
              totalPassed: userSubmission.totalPassed,
              totalFailed: userSubmission.totalFailed,
              totalQuestions: userSubmission.totalQuestions,
              questionResults: (userSubmission.questionResults || []).map(
                (result) => ({
                  questionId: result.questionId,
                  status: result.status,
                  verificationStatus: result.verificationStatus,
                  verificationError: sanitizeParticipantExecutionError(
                    result.status,
                    result.verificationError || result.error,
                  ),
                  score:
                    result.verificationStatus === "VERIFIED"
                      ? result.score
                      : null,
                  passed:
                    result.verificationStatus === "VERIFIED"
                      ? result.passed
                      : null,
                  failed:
                    result.verificationStatus === "VERIFIED"
                      ? result.failed
                      : null,
                  total: result.total,
                }),
              ),
            }
          : null,
      });
    }

    const userSubmission = await BattleRoomSubmission.findOne({
      roomId: room._id,
      userId,
    });
    const isParticipant = !!userSubmission;
    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        error: "Join this Battle Room with its key before accessing the challenge.",
        code: "ROOM_JOIN_REQUIRED",
      });
    }
    if (windowState.state === ROOM_WINDOW_STATE.ACTIVE) {
      warmUpJudgeEngine();
    }

    const roomData = isCreator ? room.toCreatorJSON() : room.toPublicJSON();

    // Attach fresh starter code to each question
    if (roomData.questions) {
      roomData.questions = roomData.questions.map(
        attachFreshStartersToQuestion,
      );
    }

    return res.status(200).json({
      room: roomData,
      isCreator,
      isParticipant,
      questionsVisible: isCreator || windowState.state === ROOM_WINDOW_STATE.ACTIVE,
      roomKey: isCreator ? room.roomCode : undefined,
      userSubmission: userSubmission
        ? userSubmission.toPublicJSON({
            visibleTestCaseCounts: Object.fromEntries(
              room.questions.map((question) => [
                String(question._id),
                question.visibleTestCases.length,
              ]),
            ),
          })
        : null,
      timeRemaining: room.endTime
        ? Math.max(0, Math.floor((room.endTime - new Date()) / 1000))
        : null,
    });
  } catch (error) {
    console.error("Get battle room error:", error.message);
    return res.status(500).json({ error: "Failed to get battle room." });
  }
}

export async function joinRoom(req, res) {
  try {
    const { roomCode } = req.body;
    const userId = req.userId;
    const name = req.user?.name;
    const organization = getOrganizationProfileName(req.user) || "Unspecified";
    const email = req.user?.email;

    if (!roomCode) {
      return res.status(400).json({ error: "Room key is required." });
    }
    if (
      !userId ||
      req.tokenPayload?.guest === true ||
      !req.user?.isVerified ||
      !String(name || "").trim()
    ) {
      return res.status(401).json({ error: "An authenticated account is required." });
    }
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    }).select("+allowedEmails");
    if (!room) {
      return res
        .status(404)
        .json({ error: "Battle room not found. Check the key and try again." });
    }

    // Authoritative schedule gate: a participant may only join inside the
    // scheduled window, independent of the mutable `status` field.
    const joinWindow = getRoomWindowState(room);
    if (
      joinWindow.state === ROOM_WINDOW_STATE.ENDED ||
      joinWindow.state === ROOM_WINDOW_STATE.CLOSED
    ) {
      return res.status(400).json({
        error: "This battle has already ended.",
        windowState: joinWindow.state,
      });
    }
    if (joinWindow.state !== ROOM_WINDOW_STATE.ACTIVE) {
      return res.status(400).json({
        error: "This challenge has not started yet.",
        windowState: joinWindow.state,
        msUntilStart: Math.max(0, joinWindow.msUntilStart || 0),
        startTime: room.startTime,
        timezone: room.timezone || "UTC",
      });
    }

    const existingSubmission = await BattleRoomSubmission.findOne({
      roomId: room._id,
      userId,
    });
    if (
      existingSubmission &&
      (existingSubmission.status === "COMPLETED" ||
        existingSubmission.status === "DISQUALIFIED")
    ) {
      return res.status(400).json({
        error:
          "You have already completed or been disqualified from this battle and cannot re-enter.",
      });
    }

    if (!existingSubmission) {
      const reservedRoom = await BattleRoom.findOneAndUpdate(
        {
          _id: room._id,
          isActive: true,
          isDeleted: false,
          participants: { $ne: normalizedEmail },
          $expr: {
            $lt: [
              { $ifNull: ["$participantCount", 0] },
              { $ifNull: ["$maxParticipants", 100] },
            ],
          },
        },
        {
          $addToSet: { participants: normalizedEmail },
          $inc: { participantCount: 1 },
        },
        { new: true },
      );
      if (!reservedRoom) {
        const emailAlreadyJoined = (room.participants || []).some(
          (participantEmail) =>
            participantEmail.toLowerCase() === normalizedEmail,
        );
        return res.status(400).json({
          error: emailAlreadyJoined
            ? "This email address has already joined the room."
            : "Battle room is full.",
        });
      }

      const submission = new BattleRoomSubmission({
        roomId: room._id,
        userId,
        participantEmail: normalizedEmail,
        participantName: String(name).trim(),
        participantOrganization: organization,
        questionResults: room.questions.map((q) => ({
          questionId: q._id,
          questionTitle: q.title,
          status: "PENDING",
          score: 0,
          passed: 0,
          failed: 0,
          total: q.visibleTestCases.length + q.hiddenTestCases.length,
        })),
        totalQuestions: room.questions.length,
        status: "PENDING",
        startTime: new Date(),
      });

      try {
        await submission.save();
      } catch (error) {
        await BattleRoom.updateOne(
          { _id: room._id, participants: normalizedEmail },
          {
            $pull: { participants: normalizedEmail },
            $inc: { participantCount: -1 },
          },
        );
        throw error;
      }
    }
    warmUpJudgeEngine();

    return res.status(200).json({
      message: "Successfully joined the battle room!",
      room: room.toPublicJSON(),
      timeRemaining: room.endTime
        ? Math.max(0, Math.floor((room.endTime - new Date()) / 1000))
        : null,
    });
  } catch (error) {
    console.error("Join battle room error:", error.message);
    return res.status(500).json({ error: "Failed to join battle room." });
  }
}

export async function prepareDesktopSubmission(req, res) {
  try {
    const {
      questionId,
      codeHash,
      executionId,
      clientVersion,
      engineVersion,
      executionProtocolVersion,
    } = req.body || {};
    const { roomCode } = req.params;
    const userId = req.userId;
    if (
      typeof roomCode !== "string" ||
      !/^[A-Z0-9]{6}$/i.test(roomCode) ||
      typeof questionId !== "string" ||
      !/^[a-f\d]{24}$/i.test(questionId)
    ) {
      return res.status(400).json({ error: "A valid room code and question ID are required." });
    }
    if (
      typeof codeHash !== "string" ||
      !/^[a-f\d]{64}$/i.test(codeHash)
    ) {
      return res.status(400).json({ error: "A valid source-code digest is required." });
    }
    if (
      typeof executionId !== "string" ||
      !/^[a-f\d-]{36}$/i.test(executionId) ||
      typeof clientVersion !== "string" ||
      clientVersion !== DESKTOP_CLIENT_VERSION ||
      typeof engineVersion !== "string" ||
      engineVersion !== DESKTOP_ENGINE_VERSION ||
      executionProtocolVersion !== LOCAL_EXECUTION_PROTOCOL_VERSION
    ) {
      return res.status(400).json({
        error: "This CodeClash Desktop or execution protocol version is not supported.",
        code: "DESKTOP_VERSION_UNSUPPORTED",
      });
    }

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    }).lean();
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }
    const submission = await BattleRoomSubmission.findOne(
      { roomId: room._id, userId },
      { status: 1, questionResults: 1 },
    ).lean();
    if (!submission) {
      return res.status(403).json({ error: "You have not joined this battle." });
    }
    if (submission.status === "DISQUALIFIED") {
      return res.status(403).json({ error: "You have been disqualified." });
    }

    const question = room.questions.find(
      (candidate) => candidate._id.toString() === String(questionId),
    );
    if (!question) {
      return res.status(404).json({ error: "Question not found in this room." });
    }
    if (
      !submission.questionResults.some(
        (result) => result.questionId.toString() === String(questionId),
      )
    ) {
      return res.status(403).json({ error: "Question is not assigned to your submission." });
    }

    const requestedCodeHash = codeHash.toLowerCase();
    const hasPersistedMatchingResult = submission.questionResults.some(
      (result) =>
        result.questionId.toString() === String(questionId) &&
        !["PENDING", "PROCESSING"].includes(result.status) &&
        createHash("sha256").update(result.code || "", "utf8").digest("hex") ===
          requestedCodeHash,
    );
    if (submission.status === "COMPLETED" && !hasPersistedMatchingResult) {
      return res.status(409).json({
        error: "This battle is complete and has no saved result for this source.",
      });
    }
    if (!isCodeExecutionAllowed(room) && !hasPersistedMatchingResult) {
      const windowState = getRoomWindowState(room);
      return res.status(403).json({
        error:
          windowState.state === ROOM_WINDOW_STATE.NOT_STARTED
            ? "Challenge has not started yet."
            : "Time is up! The battle has ended.",
        windowState: windowState.state,
        serverTime: windowState.now.toISOString(),
      });
    }

    const { challengeVersion, testSetVersion, visibleTestCases } =
      getQuestionExecutionVersions(question);
    const hiddenTestCases = (question.hiddenTestCases || []).map((testCase) => ({
      input: testCase.input,
      expectedOutput: testCase.expectedOutput ?? "",
    }));
    const allTestCases = [...visibleTestCases, ...hiddenTestCases];
    if (visibleTestCases.length === 0 || allTestCases.length > 50) {
      return res.status(400).json({
        error: "Desktop execution requires at least one visible case and no more than 50 total cases.",
      });
    }
    let caseDataCharacters = 0;
    for (const testCase of allTestCases) {
      if (
        typeof testCase.input !== "string" ||
        testCase.input.length > 5_000 ||
        typeof testCase.expectedOutput !== "string" ||
        testCase.expectedOutput.length > 100_000
      ) {
        return res.status(422).json({
          error: "A configured test case exceeds the supported execution limits.",
        });
      }
      caseDataCharacters += testCase.input.length + testCase.expectedOutput.length;
    }
    if (caseDataCharacters > 1_000_000) {
      return res.status(422).json({
        error: "The configured test data exceeds the supported execution size.",
      });
    }

    const nonceResource =
      `${room._id}:${submission._id}:${questionId}:${codeHash.toLowerCase()}:${executionId}:${challengeVersion}:${testSetVersion}:${clientVersion}:${engineVersion}`;
    const now = new Date();
    const matchingQuestionResult = submission.questionResults.find(
      (result) =>
        String(result.questionId) === String(questionId) &&
        createHash("sha256").update(result.code || "", "utf8").digest("hex") ===
          requestedCodeHash,
    );
    const reusableGrantStates = ["PROCESSING", "RETRYABLE"];
    if (matchingQuestionResult?.verificationStatus !== "ERROR") {
      reusableGrantStates.push("COMPLETED");
    }
    const existingGrant = await Nonce.findOne({
      userId,
      action: "SUBMIT",
      resourceId: nonceResource,
      recoveryExpiresAt: { $gt: now },
      $or: [
        {
          state: "AVAILABLE",
          authorizationExpiresAt: { $gt: now },
        },
        {
          state: { $in: reusableGrantStates },
        },
      ],
    }).lean();
    const nonce =
      existingGrant?.nonce ||
      (await Nonce.generate(
        userId,
        "SUBMIT",
        nonceResource,
        5 * 60 * 1000,
      ));
    const grant = await Nonce.findOne({ userId, nonce }).lean();
    return res.status(200).json({
      nonce,
      executionId,
      assessmentId: String(room._id),
      submissionId: String(submission._id),
      challengeId: String(question._id),
      challengeVersion,
      testSetVersion,
      clientVersion,
      engineVersion,
      executionProtocolVersion: LOCAL_EXECUTION_PROTOCOL_VERSION,
      testCount: visibleTestCases.length,
      expiresAt: grant?.authorizationExpiresAt || null,
    });
  } catch (error) {
    console.error("Prepare desktop submission error:", error.message);
    return res.status(500).json({ error: "Unable to authorize this submission." });
  }
}

/**
 * STATELESS RUN
 * POST /api/battle-rooms/:roomCode/run
 * - Read-only wrt the database (uses .lean() everywhere).
 * - Fetches visible test cases, calls the engine, returns results.
 * - Persists NOTHING.
 */
export async function runQuestionSolution(req, res) {
  try {
    const { roomCode } = req.params;
    const { questionId, code, language } = req.body;
    const userId = req.userId;

    if (
      typeof roomCode !== "string" ||
      !/^[A-Z0-9]{6}$/i.test(roomCode) ||
      typeof questionId !== "string" ||
      !/^[a-f\d]{24}$/i.test(questionId) ||
      typeof code !== "string" ||
      !code.trim() ||
      code.length > 50_000
    ) {
      return res
        .status(400)
        .json({ error: "A valid room code, question ID, and Java source (up to 50000 characters) are required." });
    }

    const room = await BattleRoom.findOne(
      { roomCode: roomCode.toUpperCase(), isActive: true, isDeleted: false },
      {
        roomCode: 1,
        createdBy: 1,
        status: 1,
        isDeleted: 1,
        startTime: 1,
        endTime: 1,
        questions: 1,
      },
    ).lean();
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    const isCreator = room.createdBy?.toString() === userId?.toString();
    if (
      !isCreator &&
      !(await BattleRoomSubmission.exists({ roomId: room._id, userId }))
    ) {
      return res.status(403).json({
        error:
          "Join this Battle Room with its key before running code.",
        code: "ROOM_JOIN_REQUIRED",
      });
    }

    // Server-authoritative window check. Blocks runs before the start time and
    // after the end time even if the client clock or payload is manipulated.
    if (!isCodeExecutionAllowed(room)) {
      const win = getRoomWindowState(room);
      return res.status(403).json({
        error:
          win.state === ROOM_WINDOW_STATE.NOT_STARTED
            ? "Challenge has not started yet."
            : "Time is up! The battle has ended.",
        windowState: win.state,
        serverTime: win.now.toISOString(),
        msUntilStart: Math.max(0, win.msUntilStart || 0),
      });
    }

    const lang = String(language || "java").toLowerCase();
    if (!isValidLanguage(lang)) {
      return res.status(400).json({
        error: "Only Java is supported in battle rooms.",
      });
    }

    const question = room.questions.find(
      (q) => q._id.toString() === questionId,
    );
    if (!question) {
      return res
        .status(404)
        .json({ error: "Question not found in this room." });
    }

    const visibleTestCases = (question.visibleTestCases || [])
      .filter((tc) => tc.input !== undefined && tc.input !== null)
      .map((tc) => ({
        ...(tc._id ? { _id: tc._id } : {}),
        input: tc.input,
        expectedOutput: tc.expectedOutput ?? "",
        description: tc.description || "",
      }));

    if (visibleTestCases.length === 0) {
      return res
        .status(400)
        .json({ error: "No visible test cases available for this question." });
    }

    let executionResult;
    if (question.signature && question.signature.name) {
      executionResult = await executeComposedQuestion(
        question,
        code,
        lang,
        visibleTestCases,
      );
    } else {
      executionResult = await executionService.execute(
        code,
        visibleTestCases,
        lang,
        {
          timeLimit: 5000,
          memoryLimit: 131072,
        },
      );
    }

    if (!isCodeExecutionAllowed(room)) {
      const win = getRoomWindowState(room);
      return res.status(403).json({
        error: "The scheduled battle window ended while your code was running.",
        windowState: win.state,
        serverTime: win.now.toISOString(),
      });
    }

    const runResults = (executionResult.results || []).map((r, index) => ({
      ...(r.testCaseId ? { testCaseId: r.testCaseId } : {}),
      testCase: r.testCase ?? index + 1,
      input: r.input ?? visibleTestCases[index]?.input ?? "",
      status: r.status,
      executionTime: r.executionTime ?? 0,
      memoryUsed: r.memoryUsed ?? 0,
      output: r.output ?? "",
      expectedOutput: r.expectedOutput ?? "",
      error: r.error ?? "",
      isHidden: false,
    }));
    const visiblePassed = runResults.length
      ? runResults.filter(
      (r) => r.status === "PASSED" || r.status === "ACCEPTED",
        ).length
      : Math.min(visibleTestCases.length, executionResult.passed || 0);
    const visibleFailed = runResults.length
      ? runResults.filter(
      (r) => r.status !== "PASSED" && r.status !== "ACCEPTED",
        ).length
      : Math.min(visibleTestCases.length - visiblePassed, executionResult.failed || 0);

    return res.status(200).json({
      status: executionResult.status,
      passed: executionResult.passed || 0,
      failed: executionResult.failed || 0,
      total: executionResult.total || visibleTestCases.length,
      output: executionResult.output ?? "",
      error: executionResult.error ?? "",
      executionTime: executionResult.executionTime ?? 0,
      memoryUsed: executionResult.memoryUsed ?? 0,
      visiblePassed,
      visibleFailed,
      results: runResults,
    });
  } catch (error) {
    const message =
      error?.message ||
      "Secure Code Engine is currently unavailable. Please try again in a few moments.";
    console.error("Run question solution error:", message);
    return res.status(502).json({ error: message });
  }
}

/**
 * LIGHTWEIGHT SUBMIT
 * POST /api/battle-rooms/:roomCode/submit
 * - Persists source and server-only test snapshots before acknowledging verification.
 * - Official scores are written only by the asynchronous server verification worker.
 */
export async function submitQuestionSolution(req, res) {
  let nonceClaim = null;
  try {
    const { roomCode } = req.params;
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({ error: "A valid submission request is required." });
    }
    if (Object.hasOwn(req.body, "localExecution")) {
      return res.status(400).json({
        error: "Client-reported execution results are not accepted.",
      });
    }
    const {
      questionId,
      code,
      language,
      desktopNonce,
    } = req.body || {};
    const userId = req.userId;

    if (
      typeof roomCode !== "string" ||
      !/^[A-Z0-9]{6}$/i.test(roomCode) ||
      typeof questionId !== "string" ||
      !/^[a-f\d]{24}$/i.test(questionId) ||
      typeof code !== "string" ||
      !code.trim() ||
      code.length > 50_000
    ) {
      return res
        .status(400)
        .json({ error: "A valid room code, question ID, and Java source (up to 50000 characters) are required." });
    }

    const room = await BattleRoom.findOne(
      { roomCode: roomCode.toUpperCase(), isActive: true, isDeleted: false },
      {
        roomCode: 1,
        status: 1,
        isDeleted: 1,
        startTime: 1,
        endTime: 1,
        questions: 1,
      },
    ).lean();
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    const lang = String(language || "java").toLowerCase();
    if (!isValidLanguage(lang)) {
      return res.status(400).json({
        error: "Only Java is supported in battle rooms.",
      });
    }

    // Read-only snapshot of the submission for validation + position lookup.
    const submission = await BattleRoomSubmission.findOne(
      { roomId: room._id, userId },
      {
        status: 1,
        totalScore: 1,
        totalPassed: 1,
        totalFailed: 1,
        totalQuestions: 1,
        startTime: 1,
        questionResults: 1,
        codingBehavior: 1,
      },
    ).lean();
    if (!submission) {
      return res
        .status(400)
        .json({ error: "You haven't joined this battle yet." });
    }
    if (submission.status === "DISQUALIFIED") {
      return res
        .status(400)
        .json({ error: "You have been disqualified. Your score is 0." });
    }

    const question = room.questions.find(
      (q) => q._id.toString() === questionId,
    );
    if (!question) {
      return res
        .status(404)
        .json({ error: "Question not found in this room." });
    }

    const qrIndex = submission.questionResults.findIndex(
      (qr) => qr.questionId.toString() === questionId,
    );
    if (qrIndex === -1) {
      return res
        .status(400)
        .json({ error: "Question not found in your submission." });
    }

    const existingQuestionResult = submission.questionResults[qrIndex];
    if (
      desktopNonce === undefined &&
      existingQuestionResult.code === code &&
      (["PENDING_VERIFICATION", "VERIFYING", "VERIFIED"].includes(
        existingQuestionResult.verificationStatus,
      ) ||
        (!existingQuestionResult.verificationStatus &&
          !["PENDING", "PROCESSING", "ERROR"].includes(
            existingQuestionResult.status,
          )))
    ) {
      return res.status(200).json(
        buildParticipantSubmissionResponse(
          existingQuestionResult,
          submission,
          question.visibleTestCases.length,
          question.hiddenTestCases.length,
        ),
      );
    }
    if (submission.status === "COMPLETED" && desktopNonce === undefined) {
      return res.status(400).json({
        error:
          "You have already completed this battle and cannot attempt again.",
      });
    }

    const timeToSolve = Math.floor((new Date() - submission.startTime) / 1000);

    const visibleTestCases = (question.visibleTestCases || []).map((tc) => ({
      ...(tc._id ? { _id: tc._id } : {}),
      input: tc.input,
      expectedOutput: tc.expectedOutput ?? "",
    }));
    const hiddenTestCases = (question.hiddenTestCases || []).map((tc) => ({
      ...(tc._id ? { _id: tc._id } : {}),
      input: tc.input,
      expectedOutput: tc.expectedOutput ?? "",
    }));
    const allTestCases = [
      ...visibleTestCases,
      ...hiddenTestCases,
    ];
    if (
      allTestCases.length === 0 ||
      allTestCases.length > 50 ||
      allTestCases.some(
        (testCase) =>
          typeof testCase.input !== "string" ||
          testCase.input.length > 5_000 ||
          typeof testCase.expectedOutput !== "string" ||
          testCase.expectedOutput.length > 100_000,
      )
    ) {
      return res.status(422).json({
        error: "The configured test cases exceed the supported execution limits.",
      });
    }

    const nonceResource = desktopNonce === undefined
      ? null
      : `${room._id}:${submission._id}:${questionId}:${createHash("sha256")
          .update(code, "utf8")
          .digest("hex")}`;

    if (desktopNonce !== undefined) {
      if (typeof desktopNonce !== "string" || !/^[a-f\d]{64}$/i.test(desktopNonce)) {
        return res.status(400).json({ error: "A valid desktop execution authorization is required." });
      }
      nonceClaim = await Nonce.claimDesktopSubmission(
        userId,
        desktopNonce,
        nonceResource,
      );
      if (!nonceClaim.nonce) {
        return res.status(409).json({
          error: "The desktop execution authorization is invalid, expired, or already used.",
        });
      }
      if (
        !nonceClaim.claimed &&
        nonceClaim.nonce.state === "PROCESSING"
      ) {
        if (
          existingQuestionResult.code === code &&
          ["PENDING_VERIFICATION", "VERIFYING", "VERIFIED"].includes(
            existingQuestionResult.verificationStatus,
          )
        ) {
          return res.status(202).json(
            buildParticipantSubmissionResponse(
              existingQuestionResult,
              submission,
              question.visibleTestCases.length,
              question.hiddenTestCases.length,
            ),
          );
        }
        return res.status(409).json({
          error: "This submission is still being verified. Refresh shortly to retrieve its status.",
          code: "SUBMISSION_IN_PROGRESS",
          retryable: true,
        });
      }
      if (
        !nonceClaim.claimed &&
        nonceClaim.nonce.state !== "COMPLETED"
      ) {
        return res.status(409).json({
          error: "The desktop execution authorization is invalid or expired.",
        });
      }

      const currentSubmission = await BattleRoomSubmission.findOne(
        { _id: submission._id, roomId: room._id, userId },
        {
          status: 1,
          totalScore: 1,
          totalPassed: 1,
          totalFailed: 1,
          questionResults: 1,
        },
      )
        .select("+questionResults.executionGrantNonce")
        .lean();
      const persistedCandidateResult = currentSubmission?.questionResults?.find(
        (result) =>
          result.questionId.toString() === questionId &&
          result.code === code &&
          (["PENDING_VERIFICATION", "VERIFYING", "VERIFIED"].includes(
            result.verificationStatus,
          ) ||
            (!result.verificationStatus &&
              !["PENDING", "PROCESSING", "ERROR"].includes(result.status))),
      );
      const persistedQuestionResult =
        persistedCandidateResult &&
        (persistedCandidateResult.executionGrantNonce === desktopNonce ||
          nonceClaim.claimed)
          ? persistedCandidateResult
          : null;
      if (persistedQuestionResult) {
        if (nonceClaim.claimed) {
          const completedNonce = await Nonce.completeDesktopSubmission(
            nonceClaim.nonce._id,
            nonceClaim.claimId,
          );
          if (!completedNonce) {
            throw new Error(
              "The submission result was saved but grant finalization failed.",
            );
          }
          nonceClaim = null;
        }
        return res
          .status(200)
          .json(
            buildParticipantSubmissionResponse(
              persistedQuestionResult,
              currentSubmission,
              visibleTestCases.length,
              hiddenTestCases.length,
            ),
          );
      }
      if (!nonceClaim.claimed) {
        return res.status(409).json({
          error: "The completed authorization has no matching saved result.",
        });
      }
    }

    if (submission.status === "COMPLETED") {
      if (nonceClaim?.claimed) {
        await Nonce.releaseDesktopSubmission(
          nonceClaim.nonce._id,
          nonceClaim.claimId,
        );
        nonceClaim = null;
      }
      return res.status(409).json({
        error: "This battle is complete and has no saved result for this source.",
      });
    }

    if (!isCodeExecutionAllowed(room)) {
      if (nonceClaim?.claimed) {
        await Nonce.releaseDesktopSubmission(
          nonceClaim.nonce._id,
          nonceClaim.claimId,
        );
        nonceClaim = null;
      }
      const win = getRoomWindowState(room);
      return res.status(403).json({
        error:
          win.state === ROOM_WINDOW_STATE.NOT_STARTED
            ? "Challenge has not started yet."
            : "Time is up! The battle has ended.",
        windowState: win.state,
        serverTime: win.now.toISOString(),
        msUntilStart: Math.max(0, win.msUntilStart || 0),
      });
    }

    const visibleCount = question.visibleTestCases.length;
    const hiddenCount = question.hiddenTestCases.length;
    const totalCount = visibleCount + hiddenCount;
    const previousQuestionResult = submission.questionResults[qrIndex];
    const submittedAt = new Date();
    const qr = {
      questionId: question._id,
      questionTitle: question.title,
      revision: (previousQuestionResult.revision || 0) + 1,
      ...(desktopNonce ? { executionGrantNonce: desktopNonce } : {}),
      code,
      language: lang,
      status: "PROCESSING",
      verificationStatus: "PENDING_VERIFICATION",
      verificationSubmittedAt: submittedAt,
      verificationStartedAt: null,
      verificationCompletedAt: null,
      verificationLeaseExpiresAt: null,
      verificationLeaseId: null,
      verificationAttempts: 0,
      verificationError: "",
      verificationTestCases: allTestCases.map((testCase, index) => ({
        testCaseId: testCase._id ? String(testCase._id) : "",
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        isHidden: index >= visibleCount,
      })),
      verificationSignature: question.signature || null,
      verificationPoints: Number(question.points) || 0,
      score: 0,
      passed: 0,
      failed: 0,
      total: totalCount,
      executionTime: 0,
      memoryUsed: 0,
      timeToSolve,
      output: "",
      error: "",
      results: [],
    };

    const lines = code.split("\n").length;
    const update = {
      $set: {
        [`questionResults.${qrIndex}`]: qr,
        status: "PROCESSING",
      },
      $inc: {
        totalScore: -(previousQuestionResult.score || 0),
        totalPassed: -(previousQuestionResult.passed || 0),
        totalFailed: -(previousQuestionResult.failed || 0),
        "codingBehavior.totalLinesWritten": lines,
        "codingBehavior.totalEdits": 1,
      },
    };

    const result = await BattleRoomSubmission.updateOne(
      {
        _id: submission._id,
        status: { $in: ["PENDING", "PROCESSING"] },
        [`questionResults.${qrIndex}.status`]: previousQuestionResult.status,
        [`questionResults.${qrIndex}.verificationStatus`]:
          previousQuestionResult.verificationStatus ?? null,
        [`questionResults.${qrIndex}.revision`]: previousQuestionResult.revision || 0,
        [`questionResults.${qrIndex}.score`]: previousQuestionResult.score || 0,
        [`questionResults.${qrIndex}.passed`]: previousQuestionResult.passed || 0,
        [`questionResults.${qrIndex}.failed`]: previousQuestionResult.failed || 0,
        [`questionResults.${qrIndex}.code`]: previousQuestionResult.code || "",
      },
      update,
    );

    if (result.matchedCount === 0) {
      const current = await BattleRoomSubmission.findById(submission._id).lean();
      if (nonceClaim?.claimed) {
        await Nonce.releaseDesktopSubmission(
          nonceClaim.nonce._id,
          nonceClaim.claimId,
        );
        nonceClaim = null;
      }
      const currentQuestionResult = current?.questionResults?.find(
        (result) => result.questionId.toString() === questionId,
      );
      if (
        currentQuestionResult?.code === code &&
        ["PENDING_VERIFICATION", "VERIFYING"].includes(
          currentQuestionResult.verificationStatus,
        )
      ) {
        return res.status(202).json(
          buildParticipantSubmissionResponse(
            currentQuestionResult,
            current,
            visibleCount,
            hiddenCount,
          ),
        );
      }
      return res.status(409).json({
        error:
          current && current.status === "DISQUALIFIED"
            ? "You have been disqualified. Your score is 0."
            : "Your submission was modified concurrently. Refresh to see your current status.",
        status: current?.status || "CONFLICT",
        totalScore: current?.totalScore || 0,
      });
    }

    if (nonceClaim?.claimed) {
      const completedNonce = await Nonce.completeDesktopSubmission(
        nonceClaim.nonce._id,
        nonceClaim.claimId,
      );
      if (!completedNonce) {
        throw new Error("The submission result was saved but grant finalization failed.");
      }
      nonceClaim = null;
    }

    const currentSubmission = await BattleRoomSubmission.findById(
      submission._id,
    ).lean();
    if (!currentSubmission) {
      return res.status(404).json({ error: "Submission no longer exists." });
    }
    logBattleRoomSubmissionEvent("submission_received", {
      submissionId: String(submission._id),
      questionId,
      userId: String(userId),
      requestId: req.requestId || "",
    });
    wakeBattleRoomVerificationWorker();
    return res.status(202).json(
      buildParticipantSubmissionResponse(
        qr,
        currentSubmission,
        visibleCount,
        hiddenCount,
      ),
    );
  } catch (error) {
    if (nonceClaim?.claimed && nonceClaim.nonce) {
      try {
        await Nonce.releaseDesktopSubmission(
          nonceClaim.nonce._id,
          nonceClaim.claimId,
        );
      } catch (releaseError) {
        console.error(
          "Failed to release a retryable desktop submission grant:",
          releaseError.message,
        );
      }
    }
    console.error("Submit question solution error:", error?.message || error);
    if (!req.body?.desktopNonce) {
      return res.status(502).json({
        error:
          error?.message ||
          "Secure Code Engine is currently unavailable. Please try again in a few moments.",
      });
    }
    return res.status(503).json({
      error: "Authoritative judging is temporarily unavailable. Please retry this submission.",
      code: "SUBMISSION_RETRYABLE",
      retryable: true,
    });
  }
}

/**
 * ATOMIC DISQUALIFY
 * POST /api/battle-rooms/:roomCode/disqualify
 * - Uses updateOne with $set (no .save(), no version check).
 * - Idempotent: re-disqualifying an already disqual/completed submission is a no-op.
 * - Merges cleanly with a concurrently running submit (submit's filter will not
 *   overwrite a DISQUALIFIED status).
 */
export async function disqualifyRoomSubmission(req, res) {
  try {
    const { roomCode } = req.params;
    const { reason } = req.body;
    const userId = req.userId;

    const room = await BattleRoom.findOne(
      { roomCode: roomCode.toUpperCase(), isActive: true, isDeleted: false },
      { roomCode: 1, status: 1, questions: 1 },
    ).lean();
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    if (room.status !== "ACTIVE") {
      return res.status(400).json({ error: "Battle is not active." });
    }

    // Ensure a submission exists for the user (idempotent join-like upsert).
    let submission = await BattleRoomSubmission.findOne({
      roomId: room._id,
      userId,
    }).lean();
    if (!submission) {
      const created = new BattleRoomSubmission({
        roomId: room._id,
        userId,
        questionResults: room.questions.map((q) => ({
          questionId: q._id,
          questionTitle: q.title,
          status: "PENDING",
          score: 0,
          passed: 0,
          failed: 0,
          total: q.visibleTestCases.length + q.hiddenTestCases.length,
        })),
        totalQuestions: room.questions.length,
        status: "PENDING",
        startTime: new Date(),
      });
      await created.save();
      submission = created.toObject();
      await BattleRoom.updateOne(
        { _id: room._id },
        { $inc: { participantCount: 1 } },
      );
    }

    if (
      submission.status === "DISQUALIFIED" ||
      submission.status === "COMPLETED"
    ) {
      return res.status(200).json({
        message: "Submission already finalized.",
        status: submission.status,
        totalScore: submission.totalScore || 0,
      });
    }

    // Recompute questionResults for the atomic update (PENDING -> REJECTED, score 0).
    const questionResults = (submission.questionResults || []).map((qr) => ({
      ...qr,
      status: qr.status === "PENDING" ? "REJECTED" : qr.status,
      score: 0,
      results: [],
    }));

    const now = new Date();
    await BattleRoomSubmission.updateOne(
      { _id: submission._id, status: { $in: ["PENDING", "PROCESSING"] } },
      {
        $set: {
          status: "DISQUALIFIED",
          submittedAt: now,
          totalScore: 0,
          totalPassed: 0,
          totalFailed: 0,
          disqualifyReason: reason || "Proctoring violation detected",
          questionResults,
          "codingBehavior.completedEarly": false,
          "resultDelivery.status": "SKIPPED",
          "resultDelivery.error": "Disqualified submissions do not receive result emails.",
        },
      },
    );

    return res.status(200).json({
      message: "Submission disqualified. Score set to 0.",
      status: "DISQUALIFIED",
      totalScore: 0,
    });
  } catch (error) {
    console.error("Disqualify room submission error:", error.message);
    return res.status(500).json({ error: "Failed to disqualify submission." });
  }
}

/**
 * END TEST
 * POST /api/battle-rooms/:roomCode/end-test
 * - Finalizes the user's submission (marks COMPLETED if not already final),
 *   recomputes the total score, and returns the final result.
 * - Safe to call multiple times (idempotent).
 */
export async function endTest(req, res) {
  try {
    const { roomCode } = req.params;
    const userId = req.userId;

    const room = await BattleRoom.findOne(
      { roomCode: roomCode.toUpperCase(), isActive: true, isDeleted: false },
      { roomCode: 1, status: 1, endTime: 1, questions: 1 },
    ).lean();
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    const submission = await BattleRoomSubmission.findOne({
      roomId: room._id,
      userId,
    }).lean();
    if (!submission) {
      return res
        .status(400)
        .json({ error: "You haven't joined this battle yet." });
    }

    if (
      submission.status === "COMPLETED" ||
      submission.status === "DISQUALIFIED"
    ) {
      return res.status(200).json({
        message: "Test already finalized.",
        status: submission.status,
        totalScore: submission.totalScore || 0,
        totalPassed: submission.totalPassed || 0,
        totalFailed: submission.totalFailed || 0,
      });
    }

    const totalTime = Math.max(
      1,
      Math.floor((new Date() - submission.startTime) / 1000),
    );
    const totalEdits = submission.codingBehavior?.totalEdits || 0;
    await BattleRoomSubmission.updateOne(
      { _id: submission._id, status: { $in: ["PENDING", "PROCESSING"] } },
      {
        $set: {
          status: "PROCESSING",
          endRequestedAt: new Date(),
          "codingBehavior.timePerQuestion":
            submission.totalQuestions > 0
              ? totalTime / submission.totalQuestions
              : 0,
          "codingBehavior.editFrequency": totalEdits / (totalTime / 60),
          "codingBehavior.completedEarly": !!(
            room.endTime && new Date() < room.endTime
          ),
        },
      },
    );
    await finalizeBattleRoomSubmission(submission._id);
    wakeBattleRoomVerificationWorker();
    const current = await BattleRoomSubmission.findById(
      submission._id,
      { status: 1, totalScore: 1, totalPassed: 1, totalFailed: 1 },
    ).lean();
    if (!current) {
      return res.status(404).json({ error: "Submission no longer exists." });
    }
    const isFinal = ["COMPLETED", "DISQUALIFIED"].includes(current.status);
    return res.status(isFinal ? 200 : 202).json({
      message: isFinal
        ? "Test ended. Your verified score has been finalized."
        : "Your submitted solutions are still being verified.",
      status: current.status,
      totalScore: current.totalScore || 0,
      totalPassed: current.totalPassed || 0,
      totalFailed: current.totalFailed || 0,
    });
  } catch (error) {
    console.error("End test error:", error.message);
    return res.status(500).json({ error: "Failed to end the test." });
  }
}

export async function getRoomLeaderboard(req, res) {
  try {
    const { roomCode } = req.params;
    const userId = req.userId;

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    });
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    const isCreator = room.createdBy.toString() === userId.toString();
    if (
      !isCreator &&
      !(await BattleRoomSubmission.exists({ roomId: room._id, userId }))
    ) {
      return res.status(403).json({
        error: "Join this battle to view its leaderboard.",
      });
    }
    const submissions = await BattleRoomSubmission.find({
      roomId: room._id,
      status: { $in: RANKED_SUBMISSION_STATUSES },
    })
      .populate(
        "userId",
        isCreator ? "name email organization" : "name organization",
      )
      .lean();
    sortRoomSubmissions(submissions);

    const totalTestCases = countRoomTestCases(room.questions);
    const leaderboard = submissions.map((sub, index) => {
      const totalTime = getRoomSubmissionTime(sub);
      const submissionUserId = sub.userId?._id || sub.userId;
      const isCurrentUser =
        submissionUserId?.toString() === userId.toString();
      return {
        rank: index + 1,
        userId: submissionUserId,
        name: sub.participantName || sub.userId?.name || "Unknown",
        organization:
          sub.participantOrganization || sub.userId?.organization || "Unknown",
        totalScore: sub.totalScore,
        totalPassed: sub.totalPassed,
        totalFailed: sub.totalFailed,
        totalQuestions: sub.totalQuestions,
        totalTestCases,
        status: sub.status,
        submittedAt: sub.submittedAt,
        timeToSolve: totalTime,
        isCurrentUser,
        ...(isCreator
          ? {
              email: sub.userId?.email || "",
              disqualifyReason: sub.disqualifyReason || null,
              moderationFlags: sub.moderationFlags || [],
              flagCount: (sub.moderationFlags || []).length,
              completedEarly: sub.codingBehavior?.completedEarly || false,
            }
          : {}),
      };
    });

    return res.status(200).json({
      room: room.toLeaderboardJSON(),
      leaderboard,
      isCreator,
      isActive: room.status === "ACTIVE",
      hasEnded: room.status === "CLOSED",
    });
  } catch (error) {
    console.error("Get battle room leaderboard error:", error.message);
    return res.status(500).json({ error: "Failed to get leaderboard." });
  }
}

export async function getUserResult(req, res) {
  try {
    const { roomCode } = req.params;
    const userId = req.userId;

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    });
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    const isCreator = room.createdBy.toString() === userId.toString();
    if (room.status === "CLOSED" && !isCreator) {
      return res.status(403).json({
        error: "This battle has ended and only the creator can view it.",
      });
    }

    const submission = await BattleRoomSubmission.findOne({
      roomId: room._id,
      userId,
    }).populate("userId", "name email organization");
    if (!submission) {
      return res
        .status(404)
        .json({ error: "No submission found for you in this room." });
    }

    const allSubmissions = await BattleRoomSubmission.find({
      roomId: room._id,
      status: { $in: RANKED_SUBMISSION_STATUSES },
    }).lean();
    sortRoomSubmissions(allSubmissions);

    const rank =
      allSubmissions.findIndex(
        (s) => s.userId.toString() === userId.toString(),
      ) + 1;
    const visibleTestCaseCounts = Object.fromEntries(
      room.questions.map((question) => [
        question._id.toString(),
        (question.visibleTestCases || []).length,
      ]),
    );

    return res.status(200).json({
      room: {
        title: room.title,
        roomCode: room.roomCode,
        status: room.status,
        startTime: room.startTime,
        endTime: room.endTime,
        timeLimit: room.timeLimit,
        timeLimitUnit: room.timeLimitUnit,
        questionCount: room.questions.length,
      },
      submission: submission.toPublicJSON({ visibleTestCaseCounts }),
      rank,
      totalParticipants: allSubmissions.length,
    });
  } catch (error) {
    console.error("Get user result error:", error.message);
    return res.status(500).json({ error: "Failed to get user result." });
  }
}

export async function closeRoom(req, res) {
  try {
    const { roomCode } = req.params;
    const userId = req.userId;

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    });
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    if (room.createdBy.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "Only the room creator can close the battle." });
    }

    if (room.status === "CLOSED") {
      return res.status(400).json({ error: "Battle room is already closed." });
    }

    const result = await closeBattleRoomAndNotify(room._id);
    if (!result.closed) {
      return res.status(409).json({ error: "Battle room is already closed." });
    }

    return res.status(200).json({
      message:
        result.emailFailures > 0
          ? "Battle room closed. Some result emails could not be delivered."
          : "Battle room closed! Results have been sent to participants via email.",
      totalParticipants: result.totalParticipants,
      emailsSent: result.emailsSent,
      emailFailures: result.emailFailures,
    });
  } catch (error) {
    console.error("Close battle room error:", error.message);
    return res.status(500).json({ error: "Failed to close battle room." });
  }
}

export async function getRoomResultDelivery(req, res) {
  try {
    const room = await BattleRoom.findOne({
      roomCode: req.params.roomCode.toUpperCase(),
      createdBy: req.userId,
      isActive: true,
      isDeleted: false,
    }).select("_id status");
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    const submissions = await BattleRoomSubmission.find({
      roomId: room._id,
      status: "COMPLETED",
    })
      .select("participantName resultDelivery.status resultDelivery.attempts resultDelivery.attemptedAt resultDelivery.sentAt resultDelivery.error")
      .sort({ totalScore: -1, totalPassed: -1, submittedAt: 1, _id: 1 })
      .lean();
    const participants = submissions.map((submission) => ({
      name: submission.participantName,
      status: submission.resultDelivery?.status || "PENDING",
      attempts: submission.resultDelivery?.attempts || 0,
      attemptedAt: submission.resultDelivery?.attemptedAt || null,
      sentAt: submission.resultDelivery?.sentAt || null,
      error: submission.resultDelivery?.error || "",
    }));
    const counts = participants.reduce(
      (summary, participant) => {
        summary[participant.status] = (summary[participant.status] || 0) + 1;
        return summary;
      },
      {},
    );

    return res.status(200).json({
      roomStatus: room.status,
      totalParticipants: participants.length,
      counts,
      participants,
    });
  } catch (error) {
    console.error("Get result delivery status error:", error.message);
    return res.status(500).json({ error: "Failed to get result delivery status." });
  }
}

export async function retryRoomResultDelivery(req, res) {
  try {
    const room = await BattleRoom.findOne({
      roomCode: req.params.roomCode.toUpperCase(),
      createdBy: req.userId,
      isActive: true,
      isDeleted: false,
    }).select("_id status");
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }
    if (room.status !== "CLOSED") {
      return res.status(409).json({
        error: "Results can be delivered only after the room is closed.",
      });
    }

    const result = await retryBattleRoomResultDelivery(room._id);
    return res.status(200).json({
      message:
        result.emailFailures > 0
          ? "Delivery retry finished; some participant emails still failed."
          : "Delivery retry finished.",
      ...result,
    });
  } catch (error) {
    console.error("Retry result delivery error:", error.message);
    return res.status(500).json({ error: "Failed to retry result delivery." });
  }
}

export async function getLeaderboardByRoomCodePublic(req, res) {
  try {
    const { roomCode } = req.params;
    const userId = req.userId;

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    });
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    if (room.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        error: "Only the room creator can view the full leaderboard.",
      });
    }

    const submissions = await BattleRoomSubmission.find({
      roomId: room._id,
      status: { $in: ["COMPLETED", "DISQUALIFIED"] },
    })
      .populate("userId", "name organization")
      .lean();

    submissions.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.totalPassed !== a.totalPassed) return b.totalPassed - a.totalPassed;
      if (a.totalFailed !== b.totalFailed) return a.totalFailed - b.totalFailed;
      const aTime = a.questionResults.reduce(
        (s, q) => s + (q.timeToSolve || 0),
        0,
      );
      const bTime = b.questionResults.reduce(
        (s, q) => s + (q.timeToSolve || 0),
        0,
      );
      const timeDifference = aTime - bTime;
      if (timeDifference !== 0) return timeDifference;
      return (a.participantName || a.userId?.name || "").localeCompare(
        b.participantName || b.userId?.name || "",
        undefined,
        { sensitivity: "base" },
      );
    });

    const leaderboard = submissions.map((sub, index) => ({
      rank: index + 1,
      name: sub.participantName || sub.userId?.name || "Unknown",
      organization: sub.participantOrganization || sub.userId?.organization || "Unknown",
      totalScore: sub.totalScore,
      totalPassed: sub.totalPassed,
      totalFailed: sub.totalFailed,
      totalQuestions: sub.totalQuestions,
      status: sub.status,
      submittedAt: sub.submittedAt,
      timeToSolve: sub.questionResults.reduce(
        (s, q) => s + (q.timeToSolve || 0),
        0,
      ),
    }));

    return res.status(200).json({
      room: room.toLeaderboardJSON(),
      leaderboard,
      isActive: room.status === "ACTIVE",
      hasEnded: room.status === "CLOSED",
    });
  } catch (error) {
    console.error("Get public leaderboard error:", error.message);
    return res.status(500).json({ error: "Failed to get leaderboard." });
  }
}

export async function getMyRooms(req, res) {
  try {
    const userId = req.userId;
    const now = new Date();

    const rooms = await BattleRoom.find({
      createdBy: userId,
      isActive: true,
      isDeleted: false,
      $or: [
        { endDate: { $gt: now } },
        {
          endDate: null,
          endTime: { $gt: now },
        },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const roomsWithStats = await Promise.all(
      rooms.map(async (room) => {
        const participantCount = await BattleRoomSubmission.countDocuments({
          roomId: room._id,
        });
        return {
          ...room,
          participantCount: participantCount || room.participantCount,
        };
      }),
    );

    return res.status(200).json({
      rooms: roomsWithStats.map((r) => ({
        id: r._id,
        roomCode: r.roomCode,
        title: r.title,
        status: r.status,
        timeLimit: r.timeLimit,
        timeLimitUnit: r.timeLimitUnit,
        questionCount: r.questions?.length || 0,
        participantCount: r.participantCount,
        startDate: r.startDate || r.startTime,
        endDate: r.endDate || r.endTime,
        startTime: r.startTime,
        endTime: r.endTime,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get my rooms error:", error.message);
    return res.status(500).json({ error: "Failed to get your rooms." });
  }
}

export async function getJoinedRooms(req, res) {
  try {
    const userId = req.userId;
    const now = new Date();

    const submissions = await BattleRoomSubmission.find({ userId })
      .populate(
        "roomId",
        "title roomCode status timeLimit timeLimitUnit startDate endDate startTime endTime",
      )
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const rooms = submissions
      .filter((s) => {
        const roomEndDate = s.roomId?.endDate || s.roomId?.endTime;
        return (
          s.roomId &&
          !s.roomId.isDeleted &&
          roomEndDate &&
          new Date(roomEndDate) > now
        );
      })
      .map((s) => ({
        id: s.roomId._id,
        roomCode: s.roomId.roomCode,
        title: s.roomId.title,
        status: s.roomId.status,
        timeLimit: s.roomId.timeLimit,
        timeLimitUnit: s.roomId.timeLimitUnit,
        startDate: s.roomId.startDate || s.roomId.startTime,
        endDate: s.roomId.endDate || s.roomId.endTime,
        startTime: s.roomId.startTime,
        endTime: s.roomId.endTime,
        totalScore: s.totalScore,
        totalPassed: s.totalPassed,
        totalQuestions: s.totalQuestions,
        submissionStatus: s.status,
        submittedAt: s.submittedAt,
      }));

    return res.status(200).json({ rooms });
  } catch (error) {
    console.error("Get joined rooms error:", error.message);
    return res.status(500).json({ error: "Failed to get joined rooms." });
  }
}

export async function deleteRoom(req, res) {
  try {
    return res
      .status(403)
      .json({ error: "Battle rooms are permanent and cannot be deleted." });
    const { roomCode } = req.params;
    const userId = req.userId;

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    });
    if (!room) {
      return res
        .status(404)
        .json({ error: "Battle room not found or already deleted." });
    }

    if (room.createdBy.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "Only the room creator can delete this battle room." });
    }

    room.isDeleted = true;
    room.deletedAt = new Date();
    await room.save();

    return res.status(200).json({
      message: "Battle room deleted successfully.",
      roomCode: room.roomCode,
    });
  } catch (error) {
    console.error("Delete battle room error:", error.message);
    return res.status(500).json({ error: "Failed to delete battle room." });
  }
}

export async function shareKey(req, res) {
  try {
    const { roomCode } = req.params;
    const userId = req.userId;

    const room = await BattleRoom.findOne({
      roomCode: roomCode.toUpperCase(),
      isActive: true,
      isDeleted: false,
    });
    if (!room) {
      return res.status(404).json({ error: "Battle room not found." });
    }

    if (room.createdBy.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "Only the room creator can share the key." });
    }

    return res.status(200).json({
      message: "Room key retrieved.",
      roomKey: room.roomCode,
      room: room.toCreatorJSON(),
    });
  } catch (error) {
    console.error("Share key error:", error.message);
    return res.status(500).json({ error: "Failed to get room key." });
  }
}

/**
 * GET /api/battle-rooms/:roomCode/report
 * Creator-only structured JSON report. Authorization (room ownership) is
 * enforced inside reportService.getRoomReportData to prevent IDOR.
 */
export async function getRoomReport(req, res) {
  try {
    const data = await getRoomReportData(req.params.roomCode, req.userId);
    return res.status(200).json(data);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error("Get room report error:", error.message);
    return res
      .status(status)
      .json({ error: error.message || "Failed to generate room report." });
  }
}

/**
 * GET /api/battle-rooms/:roomCode/report/pdf
 * Creator-only complete room report PDF, streamed to avoid blocking.
 */
export async function downloadRoomReportPDF(req, res) {
  try {
    await streamCompleteRoomPDF(req.params.roomCode, req.userId, res);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error("Room report PDF error:", error.message);
    if (res.headersSent) return res.end();
    return res
      .status(status)
      .json({ error: error.message || "Failed to generate room report." });
  }
}

/**
 * GET /api/battle-rooms/:roomCode/report/excel
 * Creator-only room results workbook.
 */
export async function downloadRoomResultsExcel(req, res) {
  try {
    await streamRoomResultsExcel(req.params.roomCode, req.userId, res);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error("Room results Excel error:", error.message);
    if (res.headersSent) return res.end();
    return res
      .status(status)
      .json({ error: error.message || "Failed to generate room results." });
  }
}

/**
 * GET /api/battle-rooms/:roomCode/report/participant/:participantId/pdf
 * Creator-only individual participant report PDF, streamed.
 */
export async function downloadParticipantReportPDF(req, res) {
  try {
    await streamParticipantReportPDF(
      req.params.roomCode,
      req.params.participantId,
      req.userId,
      res,
    );
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500)
      console.error("Participant report PDF error:", error.message);
    if (res.headersSent) return res.end();
    return res.status(status).json({
      error: error.message || "Failed to generate participant report.",
    });
  }
}
