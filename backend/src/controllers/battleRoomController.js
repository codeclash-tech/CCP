import BattleRoom from "../models/BattleRoom.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
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
  calculateQuestionScore,
  countRoomTestCases,
} from "../services/battleRoomScoring.js";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RANKED_SUBMISSION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "DISQUALIFIED",
];

function getRoomSubmissionTime(submission) {
  return (submission.questionResults || []).reduce(
    (seconds, question) => seconds + (question.timeToSolve || 0),
    0,
  );
}

function sortRoomSubmissions(submissions) {
  return submissions.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.totalPassed !== a.totalPassed) return b.totalPassed - a.totalPassed;
    if (a.totalFailed !== b.totalFailed) return a.totalFailed - b.totalFailed;
    const timeDifference =
      getRoomSubmissionTime(a) - getRoomSubmissionTime(b);
    if (timeDifference !== 0) return timeDifference;
    return (a.participantName || a.userId?.name || "").localeCompare(
      b.participantName || b.userId?.name || "",
      undefined,
      { sensitivity: "base" },
    );
  });
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
      moderationAction,
      allowLeaderboard,
      allowReuse,
      scheduledDate,
      scheduledStartTime,
      scheduledEndTime,
      timezone,
      // Legacy timestamp aliases remain accepted for existing clients.
      startDate: rawStartDate,
      endDate: rawEndDate,
      startTime: rawStartTime,
      endTime: rawEndTime,
    } = req.body;
    const userId = req.userId;

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
      timeLimit: tValue,
      timeLimitUnit: tUnit,
      status: "UPCOMING",
      isScheduled: true,
      maxParticipants: maxParticipants || 100,
      moderationAction:
        moderationAction === "DISQUALIFY" ? "DISQUALIFY" : "FLAG",
      allowLeaderboard: allowLeaderboard !== false,
      allowReuse: allowReuse !== false,
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
    const {
      timeLimit,
      timeLimitUnit,
      maxParticipants,
      moderationAction,
      allowLeaderboard,
      allowReuse,
    } = req.body;
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
      moderationAction:
        moderationAction === "DISQUALIFY" ? "DISQUALIFY" : "FLAG",
      allowLeaderboard: allowLeaderboard !== false,
      allowReuse: allowReuse !== false,
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
    const organization =
      typeof req.body?.organization === "string"
        ? req.body.organization.trim()
        : "";

    if (
      organization.length < 2 ||
      organization.length > 120 ||
      /[\u0000-\u001f\u007f]/.test(organization)
    ) {
      return res.status(400).json({
        error: "A valid organization (2-120 characters) is required to start.",
      });
    }

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

export async function getRoomByCode(req, res) {
  try {
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
        .select("status totalScore submittedAt")
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
              totalScore: userSubmission.totalScore,
              submittedAt: userSubmission.submittedAt,
            }
          : null,
      });
    }

    const userSubmission = await BattleRoomSubmission.findOne({
      roomId: room._id,
      userId,
    }).lean();
    const isParticipant = !!userSubmission;
    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        error:
          "Join from the Battle Room page and enter your organization before accessing this battle.",
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
        ? {
            status: userSubmission.status,
            totalScore: userSubmission.totalScore,
            submittedAt: userSubmission.submittedAt,
          }
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
    const organization =
      typeof req.body?.organization === "string"
        ? req.body.organization.trim()
        : "";
    const email = req.user?.email;

    if (!roomCode) {
      return res.status(400).json({ error: "Room key is required." });
    }
    if (organization.length < 2 || organization.length > 120) {
      return res.status(400).json({
        error: "Organization must be between 2 and 120 characters.",
      });
    }
    if (/[\u0000-\u001f\u007f]/.test(organization)) {
      return res.status(400).json({
        error: "Organization contains invalid characters.",
      });
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
    });
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

    if (!questionId || !code) {
      return res
        .status(400)
        .json({ error: "Question ID and code are required." });
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
          "Join from the Battle Room page and enter your organization before running code.",
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
 * - Never stores raw user code.
 * - Persists only competition metadata via atomic updateOne ($set / $inc / $addToSet).
 * - The version checker (__v) is bypassed entirely, so a concurrent proctoring
 *   disqualification merges cleanly without throwing a VersionError.
 */
export async function submitQuestionSolution(req, res) {
  try {
    const { roomCode } = req.params;
    const { questionId, code, language } = req.body;
    const userId = req.userId;

    if (!questionId || !code) {
      return res
        .status(400)
        .json({ error: "Question ID and code are required." });
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

    // Server-authoritative window check. Prevents submissions before the start
    // time and after the end time regardless of client clock or payload.
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
    if (submission.status === "COMPLETED") {
      return res.status(400).json({
        error:
          "You have already completed this battle and cannot attempt again.",
      });
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

    const timeToSolve = Math.floor((new Date() - submission.startTime) / 1000);

    const allTestCases = [
      ...question.visibleTestCases.map((tc) => ({
        ...(tc._id ? { _id: tc._id } : {}),
        input: tc.input,
        expectedOutput: tc.expectedOutput,
      })),
      ...question.hiddenTestCases.map((tc) => ({
        ...(tc._id ? { _id: tc._id } : {}),
        input: tc.input,
        expectedOutput: tc.expectedOutput,
      })),
    ];

    // Stateless execution (no DB writes during the engine call).
    let executionResult;
    if (question.signature && question.signature.name) {
      executionResult = await executeComposedQuestion(
        question,
        code,
        lang,
        allTestCases,
      );
    } else {
      executionResult = await executionService.execute(
        code,
        allTestCases,
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

    const visibleCount = question.visibleTestCases.length;
    const hiddenCount = question.hiddenTestCases.length;
    const totalCount = visibleCount + hiddenCount;

    const passedCount =
      executionResult.status === "SYSTEM_ERROR"
        ? 0
        : executionResult.results.filter(
            (r) => r.status === "PASSED" || r.status === "ACCEPTED",
          ).length;
    const failedCount = totalCount - passedCount;

    const questionScore = calculateQuestionScore(
      question.points,
      passedCount,
      totalCount,
    );

    // Keep the submitted source with the result so the room owner can audit
    // the complete battle record after the battle.
    const qr = {
      questionId: question._id,
      questionTitle: question.title,
      code,
      language: lang,
      status: executionResult.status,
      score: Math.round(questionScore * 100) / 100,
      passed: passedCount,
      failed: failedCount,
      total: totalCount,
      executionTime: executionResult.executionTime ?? 0,
      memoryUsed: executionResult.memoryUsed ?? 0,
      timeToSolve,
      output: executionResult.output ?? "",
      error: executionResult.error ?? "",
      results: executionResult.results.map((r, idx) => ({
        ...(r.testCaseId ? { testCaseId: r.testCaseId } : {}),
        testCase: r.testCase ?? idx + 1,
        input: r.input ?? allTestCases[idx]?.input ?? "",
        status: r.status,
        executionTime: r.executionTime ?? 0,
        memoryUsed: r.memoryUsed ?? 0,
        output: r.output ?? "",
        expectedOutput: idx < visibleCount
          ? (r.expectedOutput ?? allTestCases[idx]?.expectedOutput ?? "")
          : "",
        error: r.error ?? "",
        isHidden: idx >= visibleCount,
      })),
    };

    const hiddenResults = executionResult.results.slice(visibleCount);
    const visibleResults = executionResult.results.slice(0, visibleCount);
    const visiblePassedCount = visibleResults.length
      ? visibleResults.filter(
          (r) => r.status === "PASSED" || r.status === "ACCEPTED",
        ).length
      : Math.min(visibleCount, passedCount);
    const visibleFailedCount = visibleCount - visiblePassedCount;
    const hiddenPassed = hiddenResults.length
      ? hiddenResults.filter(
          (r) => r.status === "PASSED" || r.status === "ACCEPTED",
        ).length
      : Math.min(hiddenCount, Math.max(0, passedCount - visiblePassedCount));
    const hiddenFailed = hiddenResults.length
      ? hiddenResults.length - hiddenPassed
      : Math.min(hiddenCount, Math.max(0, failedCount - visibleFailedCount));

    // Compute deltas from the question snapshot; $inc preserves updates from
    // concurrent submissions to other questions in the same room.
    const qrResults = [...submission.questionResults];
    const previousQuestionResult = qrResults[qrIndex];
    qrResults[qrIndex] = qr;

    const lines = code.split("\n").length;

    // Build the atomic update operator.
    const update = {
      $set: {
        [`questionResults.${qrIndex}`]: qr,
      },
      $inc: {
        totalScore: qr.score - (previousQuestionResult.score || 0),
        totalPassed: qr.passed - (previousQuestionResult.passed || 0),
        totalFailed: qr.failed - (previousQuestionResult.failed || 0),
        "codingBehavior.totalLinesWritten": lines,
        "codingBehavior.totalEdits": 1,
      },
    };

    // Atomic merge.
    // If a proctoring event already set DISQUALIFIED (or the user completed),
    // this filter matches nothing and we return a clean conflict instead of
    // crashing with a VersionError.
    const result = await BattleRoomSubmission.updateOne(
      {
        _id: submission._id,
        status: { $in: ["PENDING", "PROCESSING"] },
        [`questionResults.${qrIndex}.status`]: previousQuestionResult.status,
        [`questionResults.${qrIndex}.score`]: previousQuestionResult.score || 0,
        [`questionResults.${qrIndex}.passed`]: previousQuestionResult.passed || 0,
        [`questionResults.${qrIndex}.failed`]: previousQuestionResult.failed || 0,
        [`questionResults.${qrIndex}.code`]: previousQuestionResult.code || "",
      },
      update,
    );

    if (result.matchedCount === 0) {
      const current = await BattleRoomSubmission.findOne(
        { _id: submission._id },
        { status: 1, totalScore: 1 },
      ).lean();
      return res.status(409).json({
        error:
          current && current.status === "DISQUALIFIED"
            ? "You have been disqualified. Your score is 0."
            : "Your submission was modified concurrently. Refresh to see your current status.",
        status: current?.status || "CONFLICT",
        totalScore: current?.totalScore || 0,
      });
    }

    let currentSubmission = await BattleRoomSubmission.findById(
      submission._id,
      {
        status: 1,
        totalScore: 1,
        totalPassed: 1,
        totalFailed: 1,
        questionResults: 1,
      },
    ).lean();
    if (!currentSubmission) {
      return res.status(404).json({ error: "Submission no longer exists." });
    }
    const allCompleted = currentSubmission.questionResults.every(
      (questionResult) =>
        !["PENDING", "PROCESSING"].includes(questionResult.status),
    );
    if (allCompleted) {
      await BattleRoomSubmission.updateOne(
        {
          _id: submission._id,
          status: { $in: ["PENDING", "PROCESSING"] },
          questionResults: {
            $not: {
              $elemMatch: { status: { $in: ["PENDING", "PROCESSING"] } },
            },
          },
        },
        { $set: { status: "COMPLETED", submittedAt: new Date() } },
      );
      currentSubmission = await BattleRoomSubmission.findById(
        submission._id,
        {
          status: 1,
          totalScore: 1,
          totalPassed: 1,
          totalFailed: 1,
          questionResults: 1,
        },
      ).lean();
    }
    if (!currentSubmission) {
      return res.status(404).json({ error: "Submission no longer exists." });
    }

    // SECURITY: never expose hidden test case inputs, expected outputs, or
    // actual outputs to the participant. Visible cases keep full detail; hidden
    // cases are reduced to pass/fail only. Top-level stdout is suppressed on
    // submit because it may contain output produced from hidden inputs. The
    // full record (including code and hidden results) remains persisted
    // server-side for the creator report.
    const safeResults = qr.results.map((r) =>
      r.isHidden
        ? {
            testCase: r.testCase,
            status: r.status,
            executionTime: r.executionTime,
            memoryUsed: r.memoryUsed,
            isHidden: true,
          }
        : r,
    );
    return res.status(200).json({
      message: "Solution submitted!",
      questionResult: {
        questionId: qr.questionId,
        questionTitle: qr.questionTitle,
        language: qr.language,
        status: qr.status,
        score: qr.score,
        passed: qr.passed,
        failed: qr.failed,
        total: qr.total,
        executionTime: qr.executionTime,
        memoryUsed: qr.memoryUsed,
        timeToSolve: qr.timeToSolve,
        // Compiler/runtime diagnostics are the participant's own code output
        // and are safe (and necessary) to surface.
        output: "",
        error: qr.error || "",
        visiblePassed: visiblePassedCount,
        visibleFailed: visibleCount - visiblePassedCount,
        hiddenCount,
        hiddenPassed,
        hiddenFailed,
        results: safeResults,
      },
      status: qr.status,
      score: qr.score,
      passed: qr.passed,
      failed: qr.failed,
      total: qr.total,
      executionTime: qr.executionTime,
      memoryUsed: qr.memoryUsed,
      hiddenPassed,
      hiddenFailed,
      totalScore: currentSubmission.totalScore,
      totalPassed: currentSubmission.totalPassed,
      totalFailed: currentSubmission.totalFailed,
      submissionStatus: currentSubmission.status,
      allCompleted,
    });
  } catch (error) {
    const message =
      error?.message ||
      "Secure Code Engine is currently unavailable. Please try again in a few moments.";
    console.error("Submit question solution error:", message);
    return res.status(502).json({ error: message });
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
    const { reason, code, language } = req.body;
    const userId = req.userId;

    const room = await BattleRoom.findOne(
      { roomCode: roomCode.toUpperCase(), isActive: true, isDeleted: false },
      { roomCode: 1, status: 1, questions: 1, moderationAction: 1 },
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

    if (room.moderationAction === "FLAG") {
      const flag = {
        reason: reason || "Owner-configured review flag",
        code: code || "",
        language: language || "",
        createdAt: new Date(),
      };
      await BattleRoomSubmission.updateOne(
        { _id: submission._id },
        { $push: { moderationFlags: flag } },
      );
      return res.status(200).json({
        message: "Activity flagged for owner review. Submission was preserved.",
        status: submission.status,
        flagged: true,
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

    const finalized = await BattleRoomSubmission.updateOne(
      { _id: submission._id, status: { $in: ["PENDING", "PROCESSING"] } },
      {
        $set: {
          status: "COMPLETED",
          submittedAt: new Date(),
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
    if (finalized.matchedCount === 0) {
      const current = await BattleRoomSubmission.findById(
        submission._id,
        { status: 1, totalScore: 1, totalPassed: 1, totalFailed: 1 },
      ).lean();
      if (
        !current ||
        !["COMPLETED", "DISQUALIFIED"].includes(current.status)
      ) {
        return res.status(409).json({
          error: "Your submission changed while the test was ending.",
        });
      }
      return res.status(200).json({
        message: "Test already finalized.",
        status: current.status,
        totalScore: current.totalScore || 0,
        totalPassed: current.totalPassed || 0,
        totalFailed: current.totalFailed || 0,
      });
    }

    const current = await BattleRoomSubmission.findById(
      submission._id,
      { status: 1, totalScore: 1, totalPassed: 1, totalFailed: 1 },
    ).lean();

    return res.status(200).json({
      message: "Test ended. Your score has been finalized.",
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
      submission: submission.toPublicJSON(),
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
