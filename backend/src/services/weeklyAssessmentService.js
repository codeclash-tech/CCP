import { createHash, randomUUID } from "node:crypto";
import cron from "node-cron";
import mongoose from "mongoose";
import { performance } from "node:perf_hooks";
import Challenge from "../models/Challenge.js";
import GlobalChallenge from "../models/GlobalChallenge.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import OrganizationProfile from "../models/OrganizationProfile.js";
import User from "../models/User.js";
import WeeklyCertificate from "../models/WeeklyCertificate.js";
import WeeklyCycle from "../models/WeeklyCycle.js";
import WeeklyRosterEntry from "../models/WeeklyRosterEntry.js";
import WeeklySubmission from "../models/WeeklySubmission.js";
import Nonce from "../models/Nonce.js";
import { getChallengeTestCases } from "./challengeTestCases.js";
import { convertParameterValuesToInput } from "./parameterConverter.js";
import { executionService } from "./executionService.js";
import { composeProgram } from "./wrapperGenerator.js";
import { generateStarterCodeForChallenge } from "./challengeAuthoringService.js";
import {
  calculateWeeklyRankings,
  getWeeklyCycleBounds,
  getWeeklyDayIndex,
  getRecurringCycleBounds,
  getWeeklyRecoveryDeadline,
  shouldWaitForWeeklyRecovery,
  takeNextQueuedQuestion,
  WEEKLY_SHRINKAGE_K,
  isWeeklyParticipationEligible,
  resolveWeeklyOrganization,
  summarizeWeeklySubmissions,
} from "../utils/weeklyAssessment.js";
import {
  LOCAL_EXECUTION_PROTOCOL_VERSION,
  validateLocalExecutionTranscript,
} from "./localExecutionProtocol.js";
import { dispatchWeeklyCompletionEmail } from "./completionNotificationService.js";

const RETRY_LEASE_MS = 6 * 60 * 1000;
const DAILY_POINTS = 100;
const DESKTOP_CLIENT_VERSION = process.env.CODECLASH_DESKTOP_VERSION || "1.0.0";
const DESKTOP_ENGINE_VERSION = process.env.CODECLASH_ENGINE_VERSION || "1.0.0";
let weeklyVerificationWorkerStarted = false;

function logWeeklyVerification(event, details = {}) {
  if (process.env.BATTLE_ROOM_PERF_LOGS !== "true") return;
  console.info(
    "[ExecutionPerf] " +
      JSON.stringify({
        event: `daily_${event}`,
        timestamp: new Date().toISOString(),
        ...details,
      }),
  );
}

function weeklySubmissionAcknowledgement(submission) {
  return {
    submissionId: String(submission._id),
    status: submission.status,
    message: "Submission received. CodeClash is verifying your solution.",
  };
}

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function initializeEligibilityHistory() {
  const users = await User.find({
    $or: [
      { eligibilityHistory: { $exists: false } },
      { eligibilityHistory: { $size: 0 } },
    ],
  }).select("name role creatorType isVerified isActive");
  const baselineAt = new Date();
  for (let offset = 0; offset < users.length; offset += 500) {
    await User.bulkWrite(users.slice(offset, offset + 500).map((user) => ({
      updateOne: {
        filter: {
          _id: user._id,
          $or: [
            { eligibilityHistory: { $exists: false } },
            { eligibilityHistory: { $size: 0 } },
          ],
        },
        update: {
          $set: {
            eligibilityHistory: [{
              effectiveAt: baselineAt,
              name: user.name,
              role: user.role,
              creatorType: user.creatorType,
              isVerified: user.isVerified,
              isActive: user.isActive,
            }],
          },
        },
      },
    })), { ordered: false });
  }
  const organizations = await OrganizationProfile.find({
    $or: [
      { history: { $exists: false } },
      { history: { $size: 0 } },
    ],
  }).select("name status");
  for (let offset = 0; offset < organizations.length; offset += 500) {
    await OrganizationProfile.bulkWrite(organizations.slice(offset, offset + 500).map((organization) => ({
      updateOne: {
        filter: {
          _id: organization._id,
          $or: [
            { history: { $exists: false } },
            { history: { $size: 0 } },
          ],
        },
        update: {
          $set: {
            history: [{
              effectiveAt: baselineAt,
              name: organization.name,
              status: organization.status,
            }],
          },
        },
      },
    })), { ordered: false });
  }
  const cyclesWithoutRecoveryDeadline = await WeeklyCycle.find({
    recoveryUntilAt: null,
  }).select("_id endAt");
  for (let offset = 0; offset < cyclesWithoutRecoveryDeadline.length; offset += 500) {
    await WeeklyCycle.bulkWrite(
      cyclesWithoutRecoveryDeadline.slice(offset, offset + 500).map((cycle) => ({
        updateOne: {
          filter: { _id: cycle._id, recoveryUntilAt: null },
          update: {
            $set: { recoveryUntilAt: getWeeklyRecoveryDeadline(cycle.endAt) },
          },
        },
      })),
      { ordered: false },
    );
  }
  return users.length + organizations.length + cyclesWithoutRecoveryDeadline.length;
}

export async function createOrganizationProfile({ name, ownerUserId }) {
  const normalizedName = String(name || "").trim().replace(/\s+/g, " ");
  if (normalizedName.length < 2 || normalizedName.length > 120) {
    throw requestError("Organization name must be between 2 and 120 characters.");
  }
  const owner = await User.findById(ownerUserId);
  if (!owner || owner.role !== "USER" || owner.creatorType !== "ORGANIZATION" || !owner.isVerified) {
    throw requestError("A verified organization account is required as the profile owner.", 403);
  }
  return OrganizationProfile.create({
    name: normalizedName,
    normalizedName: normalizedName.toLocaleLowerCase("en-US"),
    ownerUserId,
  });
}

export async function assignCandidateOrganization({ userId, organizationId, assignedBy }) {
  const [user, organization] = await Promise.all([
    User.findById(userId),
    OrganizationProfile.findOne({ _id: organizationId, status: "ACTIVE" }),
  ]);
  if (!user || user.role !== "USER" || user.creatorType === "ORGANIZATION") {
    throw requestError("A candidate account is required.");
  }
  if (!organization) throw requestError("Active organization not found.", 404);

  const now = new Date();
  await OrganizationMembership.updateOne(
    { userId, status: "ACTIVE" },
    { $set: { status: "ENDED", validTo: now } },
  );
  try {
    const membership = await OrganizationMembership.create({
      userId,
      organizationId,
      status: "ACTIVE",
      validFrom: now,
      assignedBy,
    });
    user.organizationId = organization._id;
    user.organization = organization.name;
    await user.save();
    const activeCycles = await WeeklyCycle.find({ status: "ACTIVE" })
      .select("_id")
      .lean();
    if (activeCycles.length) {
      await WeeklyRosterEntry.updateMany(
        {
          cycleId: { $in: activeCycles.map((cycle) => cycle._id) },
          candidateId: userId,
        },
        {
          $set: {
            organizationId: organization._id,
            organizationNameSnapshot: organization.name,
          },
        },
      );
    }
    return membership;
  } catch (error) {
    if (error?.code === 11000) {
      throw requestError("Candidate organization assignment changed concurrently; reload and retry.", 409);
    }
    throw error;
  }
}

export async function removeCandidateOrganization({ userId }) {
  const now = new Date();
  const membership = await OrganizationMembership.findOneAndUpdate(
    { userId, status: "ACTIVE" },
    {
      $set: {
        status: "ENDED",
        validTo: now,
      },
    },
    { new: true },
  );
  if (membership) {
    await User.updateOne(
      { _id: userId, organizationId: membership.organizationId },
      { $set: { organizationId: null, organization: "Unspecified" } },
    );
    const activeCycles = await WeeklyCycle.find({ status: "ACTIVE" })
      .select("_id")
      .lean();
    if (activeCycles.length) {
      await WeeklyRosterEntry.updateMany(
        {
          cycleId: { $in: activeCycles.map((cycle) => cycle._id) },
          candidateId: userId,
        },
        {
          $set: {
            organizationId: null,
            organizationNameSnapshot: "",
          },
        },
      );
    }
  }
  return membership;
}

function dailyBoundsFromKey(cycleKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(cycleKey || ""))) {
    throw requestError("Challenge date must be YYYY-MM-DD in Asia/Kolkata.");
  }
  const [year, month, day] = cycleKey.split("-").map(Number);
  const localMidnight = Date.UTC(year, month - 1, day);
  const startAt = new Date(localMidnight - 330 * 60 * 1000);
  const bounds = getWeeklyCycleBounds(startAt);
  if (bounds.cycleKey !== cycleKey || bounds.startAt.getTime() !== startAt.getTime()) {
    throw requestError("Challenge date must be a valid date in Asia/Kolkata.");
  }
  return bounds;
}

export function createQuestionAssignment(challenge, dayIndex) {
  const testCases = getChallengeTestCases(challenge);
  const source = challenge.toObject ? challenge.toObject() : challenge;
  const toPlainMap = (value) => value instanceof Map
    ? Object.fromEntries(value)
    : value && typeof value === "object"
      ? { ...value }
      : {};
  return {
    dayIndex,
    challengeId: challenge._id,
    questionTitleSnapshot: challenge.title,
    questionSnapshot: {
      title: challenge.title,
      description: challenge.description,
      difficulty: challenge.difficulty,
      category: challenge.category,
      examples: challenge.examples || [],
      constraints: challenge.constraints || "",
      signature: challenge.signature || null,
      functionSignatures: toPlainMap(source.functionSignatures),
      starterCodes: challenge.signature?.name
        ? generateStarterCodeForChallenge(challenge)
        : toPlainMap(source.starterCodes),
      testCases,
    },
  };
}

export function resolveDailyQuestion(assignment) {
  if (!assignment?.questionSnapshot || !assignment.challengeId) {
    throw requestError("The assigned daily question snapshot is unavailable.", 503);
  }
  const question = { ...assignment.questionSnapshot };
  if (!question.title || !question.description) {
    throw requestError("The assigned daily question snapshot is incomplete.", 503);
  }
  question.id = String(assignment.challengeId);
  question.testCases = getChallengeTestCases(question);
  delete question.visibleTestCases;
  delete question.hiddenTestCases;
  return question;
}

export async function createWeeklyCycle({ cycleKey, name, questionIds }) {
  const bounds = dailyBoundsFromKey(cycleKey);
  if (bounds.endAt <= new Date()) {
    throw requestError("Daily challenge dates must be today or in the future.", 409);
  }
  if (!Array.isArray(questionIds) || questionIds.length !== 1 ||
    new Set(questionIds.map(String)).size !== 1) {
    throw requestError("Select exactly one saved question for the daily challenge.");
  }
  const questions = await Challenge.find({
    _id: { $in: questionIds },
    isActive: true,
  });
  const byId = new Map(questions.map((question) => [String(question._id), question]));
  if (byId.size !== 1) {
    throw requestError("The selected question must be an active saved challenge.");
  }
  const questionAssignments = questionIds.map((challengeId, dayIndex) =>
    createQuestionAssignment(byId.get(String(challengeId)), dayIndex),
  );
  return WeeklyCycle.create({
    cycleKey,
    name: String(name || "").trim() || `Global Challenge ${cycleKey}`,
    isGlobalChallenge: true,
    startAt: bounds.startAt,
    endAt: bounds.endAt,
    recoveryUntilAt: getWeeklyRecoveryDeadline(bounds.endAt),
    questionAssignments,
    shrinkageK: WEEKLY_SHRINKAGE_K,
  });
}

export async function getGlobalChallengeConfiguration() {
  const configuration = await GlobalChallenge.findOne({ key: "global" })
    .populate("questionIds", "title difficulty isActive")
    .populate("activeQuestionId", "title difficulty isActive")
    .populate("draft.questionIds", "title difficulty isActive")
    .lean();
  if (!configuration) return null;
  const published = Boolean(configuration.name && configuration.startAt);
  const status = !published
    ? "DRAFT"
    : configuration.status === "COMPLETED"
      ? "COMPLETED"
      : new Date(configuration.startAt) > new Date()
        ? "SCHEDULED"
        : "ACTIVE";
  return { ...configuration, published, status };
}

export async function saveGlobalChallengeConfiguration({
  name,
  startAt,
  questionIds,
  now = new Date(),
}) {
  const existing = await GlobalChallenge.findOne({ key: "global" });
  const hasPublishedConfiguration = Boolean(existing?.name && existing?.startAt);
  const parsedStartAt = startAt ? new Date(startAt) : null;
  if (startAt && !Number.isFinite(parsedStartAt.getTime())) {
    throw requestError("Choose a valid global challenge start date and time.");
  }
  if (!Array.isArray(questionIds)) {
    throw requestError("The question rotation must be a list of saved question IDs.");
  }
  const normalizedIds = questionIds.map(String);
  if (new Set(normalizedIds).size !== normalizedIds.length ||
    normalizedIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw requestError("Global challenge questions must be unique saved question IDs.");
  }
  if (
    hasPublishedConfiguration &&
    existing.startAt <= now &&
    parsedStartAt &&
    parsedStartAt.getTime() !== existing.startAt.getTime()
  ) {
    throw requestError("The global challenge start time cannot be changed after it begins.", 409);
  }
  if (
    !hasPublishedConfiguration &&
    parsedStartAt &&
    parsedStartAt <= now
  ) {
    throw requestError("The initial global challenge start must be in the future.", 409);
  }
  if (
    hasPublishedConfiguration &&
    existing.startAt > now &&
    parsedStartAt &&
    parsedStartAt <= now
  ) {
    throw requestError("The global challenge start must be in the future.", 409);
  }
  if (normalizedIds.length) {
    const questions = await Challenge.find({
      _id: { $in: normalizedIds },
      isActive: true,
    }).select("_id");
    if (questions.length !== normalizedIds.length) {
      throw requestError("Every selected question must be an active saved challenge.");
    }
  }

  if (hasPublishedConfiguration) {
    if (
      existing.activeQuestionId &&
      normalizedIds.includes(String(existing.activeQuestionId))
    ) {
      throw requestError("Today's assigned question cannot be added to the upcoming queue.", 409);
    }
    const updated = await GlobalChallenge.findOneAndUpdate(
      {
        key: "global",
        lastScheduledCycleKey: existing.lastScheduledCycleKey ?? null,
        activeQuestionId: existing.activeQuestionId ?? null,
        questionIds: existing.questionIds || [],
      },
      {
        $set: {
          questionIds: normalizedIds,
          status: existing.startAt > now ? "SCHEDULED" : "ACTIVE",
        },
        $unset: { draft: "" },
      },
      { new: true, runValidators: true },
    )
      .populate("questionIds", "title difficulty isActive")
      .populate("activeQuestionId", "title difficulty isActive");
    if (!updated) {
      throw requestError("The daily queue changed before it was saved. Reload and try again.", 409);
    }
    return updated;
  }

  const draft = {
    name: String(name || "").trim(),
    timezone: "Asia/Kolkata",
    startAt: parsedStartAt,
    questionIds: normalizedIds,
    updatedAt: now,
  };
  return GlobalChallenge.findOneAndUpdate(
    { key: "global" },
    {
      $set: {
        draft,
        ...(!hasPublishedConfiguration ? { status: "DRAFT" } : {}),
      },
      $setOnInsert: { key: "global" },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )
    .populate("questionIds", "title difficulty isActive")
    .populate("activeQuestionId", "title difficulty isActive")
    .populate("draft.questionIds", "title difficulty isActive");
}

export async function publishGlobalChallengeConfiguration({ now = new Date() } = {}) {
  const existing = await GlobalChallenge.findOne({ key: "global" });
  const draft = existing?.draft;
  if (!draft) {
    throw requestError("Save a draft before publishing the global challenge.", 409);
  }
  const name = String(draft.name || "").trim();
  if (!name) throw requestError("Enter a challenge name before publishing.");
  if (!draft.startAt || !Number.isFinite(new Date(draft.startAt).getTime())) {
    throw requestError("Choose a valid global challenge start date and time.");
  }
  if (!Array.isArray(draft.questionIds) || draft.questionIds.length === 0) {
    throw requestError("Add at least one active question before publishing.");
  }
  const questionIds = draft.questionIds.map(String);
  if (
    new Set(questionIds).size !== questionIds.length ||
    questionIds.some((id) => !mongoose.Types.ObjectId.isValid(id))
  ) {
    throw requestError("The question rotation must contain unique saved question IDs.");
  }
  const questions = await Challenge.find({
    _id: { $in: questionIds },
    isActive: true,
  }).select("_id");
  if (questions.length !== questionIds.length) {
    throw requestError("Every selected question must still be active before publishing.");
  }

  const hasPublishedConfiguration = Boolean(existing.name && existing.startAt);
  const startAt = new Date(draft.startAt);
  if (!hasPublishedConfiguration && startAt <= now) {
    throw requestError("The initial global challenge start must be in the future.", 409);
  }
  if (
    hasPublishedConfiguration &&
    existing.startAt <= now &&
    startAt.getTime() !== existing.startAt.getTime()
  ) {
    throw requestError("The global challenge start time cannot be changed after it begins.", 409);
  }
  if (hasPublishedConfiguration && existing.startAt > now && startAt <= now) {
    throw requestError("The global challenge start must be in the future.", 409);
  }
  if (
    hasPublishedConfiguration &&
    existing.startAt <= now &&
    existing.activeQuestionId &&
    questionIds.includes(String(existing.activeQuestionId))
  ) {
    throw requestError("The current question cannot be added back into the upcoming rotation.", 409);
  }

  const updated = await GlobalChallenge.findOneAndUpdate(
    {
      key: "global",
      "draft.updatedAt": draft.updatedAt,
      lastScheduledCycleKey: existing.lastScheduledCycleKey ?? null,
      activeQuestionId: existing.activeQuestionId ?? null,
    },
    {
      $set: {
        name,
        timezone: "Asia/Kolkata",
        startAt,
        questionIds,
        status: startAt > now ? "SCHEDULED" : "ACTIVE",
      },
      $unset: { draft: "" },
      $setOnInsert: { key: "global" },
    },
    { new: true, runValidators: true },
  )
    .populate("questionIds", "title difficulty isActive")
    .populate("activeQuestionId", "title difficulty isActive");
  if (!updated) {
    throw requestError("The saved draft changed before publishing. Reload and try again.", 409);
  }
  return updated;
}

export async function freezeWeeklyRoster(cycleId) {
  const cycle = await WeeklyCycle.findById(cycleId);
  if (!cycle) throw requestError("Weekly cycle not found.", 404);
  if (cycle.status === "FINALIZED" || cycle.rosterFrozenAt) return cycle;
  const now = new Date();
  if (now < cycle.startAt) throw requestError("The roster cannot be frozen before the cycle starts.", 409);

  const candidates = await User.find({
    role: { $in: ["USER", "ADMIN"] },
    isActive: { $ne: false },
    isVerified: true,
  })
    .select("name role organizationId organization")
    .lean();
  const memberships = await OrganizationMembership.find({
    status: "ACTIVE",
    validFrom: { $lte: now },
    $or: [{ validTo: null }, { validTo: { $gt: now } }],
  }).lean();
  const membershipByUser = new Map(
    memberships.map((membership) => [String(membership.userId), membership]),
  );
  const organizations = await OrganizationProfile.find({ status: "ACTIVE" }).lean();
  const organizationById = new Map(organizations.map((organization) => [String(organization._id), organization]));
  const organizationByName = new Map(
    organizations.map((organization) => [
      String(organization.normalizedName || organization.name)
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("en-US"),
      organization,
    ]),
  );
  const entries = [];
  for (const user of candidates) {
    const membership = membershipByUser.get(String(user._id));
    const eligibleOrganization = resolveWeeklyOrganization(
      user,
      membership,
      organizationById,
      organizationByName,
    );
    entries.push({
      updateOne: {
        filter: { cycleId: cycle._id, candidateId: user._id },
        update: {
          $setOnInsert: {
            cycleId: cycle._id,
            candidateId: user._id,
            candidateNameSnapshot: user.name,
            organizationId: eligibleOrganization?._id || null,
            organizationNameSnapshot: eligibleOrganization?.name || "",
            eligibilityStatus: "ELIGIBLE",
            participationStatus: "NOT_STARTED",
            score: 0,
            completedDays: [],
          },
        },
        upsert: true,
      },
    });
  }
  if (entries.length) await WeeklyRosterEntry.bulkWrite(entries, { ordered: false });
  await WeeklyCycle.updateOne(
    { _id: cycle._id, status: { $in: ["SCHEDULED", "ACTIVE"] } },
    { $set: { status: "ACTIVE", rosterFrozenAt: now } },
  );
  return WeeklyCycle.findById(cycle._id);
}

async function ensureDailyRosterEntry(cycle, candidateId, now) {
  const existing = await WeeklyRosterEntry.findOne({
    cycleId: cycle._id,
    candidateId,
  });
  if (existing) return existing;

  const candidate = await User.findOne({
    _id: candidateId,
    role: { $in: ["USER", "ADMIN"] },
    isActive: { $ne: false },
    isVerified: true,
  }).select("name");
  if (!candidate) throw requestError("An active verified account is required.", 403);

  const membership = await OrganizationMembership.findOne({
    userId: candidateId,
    status: "ACTIVE",
    validFrom: { $lte: now },
    $or: [{ validTo: null }, { validTo: { $gt: now } }],
  }).lean();
  const organization = membership
    ? await OrganizationProfile.findOne({
        _id: membership.organizationId,
        status: "ACTIVE",
      }).select("name")
    : null;
  try {
    return await WeeklyRosterEntry.create({
      cycleId: cycle._id,
      candidateId,
      candidateNameSnapshot: candidate.name,
      organizationId: organization?._id || null,
      organizationNameSnapshot: organization?.name || "",
      eligibilityStatus: "ELIGIBLE",
      participationStatus: "NOT_STARTED",
      score: 0,
      completedDays: [],
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return WeeklyRosterEntry.findOne({ cycleId: cycle._id, candidateId });
  }
}

export function getCurrentDayIndex(cycle, now = new Date()) {
  return getWeeklyDayIndex(now, cycle.startAt);
}

export async function reserveQuestionForCycle(globalChallenge, bounds, existingCycle = null) {
  const scheduledForDay = await GlobalChallenge.findOne({
    key: "global",
    lastScheduledCycleKey: bounds.cycleKey,
  }).select("activeQuestionId").lean();
  if (scheduledForDay?.activeQuestionId) return scheduledForDay.activeQuestionId;

  let queue = globalChallenge.questionIds || [];
  let nextQuestionId;
  let remainingQuestionIds;

  if (existingCycle) {
    nextQuestionId = existingCycle.questionAssignments[0]?.challengeId || null;
    const assignedIndex = queue.findIndex(
      (questionId) => String(questionId) === String(nextQuestionId),
    );
    remainingQuestionIds = assignedIndex < 0
      ? queue
      : queue.slice(assignedIndex + 1);
  } else {
    ({ questionId: nextQuestionId, remainingQuestionIds } =
      takeNextQueuedQuestion(queue));
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reserved = await GlobalChallenge.findOneAndUpdate(
      {
        key: "global",
        $or: [
          { lastScheduledCycleKey: { $ne: bounds.cycleKey } },
          {
            lastScheduledCycleKey: bounds.cycleKey,
            activeQuestionId: null,
          },
        ],
        questionIds: queue,
      },
      {
        $set: {
          lastScheduledCycleKey: bounds.cycleKey,
          activeQuestionId: nextQuestionId,
          questionIds: remainingQuestionIds,
        },
      },
      { new: true },
    ).select("activeQuestionId").lean();
    if (reserved) return reserved.activeQuestionId;

    const concurrentReservation = await GlobalChallenge.findOne({
      key: "global",
      lastScheduledCycleKey: bounds.cycleKey,
    }).select("activeQuestionId").lean();
    if (concurrentReservation) return concurrentReservation.activeQuestionId;

    globalChallenge = await GlobalChallenge.findOne({ key: "global" }).lean();
    if (!globalChallenge) {
      throw requestError("Global challenge configuration is unavailable.", 503);
    }
    const updatedQueue = globalChallenge.questionIds || [];
    if (existingCycle) {
      nextQuestionId = existingCycle.questionAssignments[0]?.challengeId || null;
      const assignedIndex = updatedQueue.findIndex(
        (questionId) => String(questionId) === String(nextQuestionId),
      );
      remainingQuestionIds = assignedIndex < 0
        ? updatedQueue
        : updatedQueue.slice(assignedIndex + 1);
    } else {
      ({ questionId: nextQuestionId, remainingQuestionIds } =
        takeNextQueuedQuestion(updatedQueue));
    }
    queue = updatedQueue;
  }

  throw requestError("Could not reserve the next daily challenge question; retry shortly.", 503);
}

function findGlobalCycleForDay(cycleKey, challengeName) {
  const legacyNames = [
    `${challengeName} · ${cycleKey}`,
    `Global Challenge ${cycleKey}`,
  ];
  return WeeklyCycle.findOne({
    cycleKey,
    $or: [
      { isGlobalChallenge: true },
      {
        isGlobalChallenge: { $exists: false },
        $or: [
          { name: { $in: legacyNames } },
          { name: { $regex: ` · ${cycleKey}$` } },
        ],
      },
    ],
  });
}

async function getOrCreateCurrentDailyCycle(now) {
  let globalChallenge = await GlobalChallenge.findOne({ key: "global" }).lean();
  if (
    !globalChallenge?.startAt ||
    !globalChallenge.name ||
    (globalChallenge.status && globalChallenge.status === "DRAFT") ||
    now < globalChallenge.startAt
  ) return null;

  const bounds = getRecurringCycleBounds(globalChallenge.startAt, now);
  const existing = await findGlobalCycleForDay(bounds.cycleKey, globalChallenge.name);
  if (existing) {
    await reserveQuestionForCycle(globalChallenge, bounds, existing);
    return existing;
  }
  const conflictingCycle = await WeeklyCycle.findOne({
    cycleKey: bounds.cycleKey,
  });
  if (conflictingCycle) {
    throw requestError(
      "A different daily cycle already uses the configured global challenge date.",
      503,
    );
  }

  const questionId = await reserveQuestionForCycle(globalChallenge, bounds);
  if (!questionId) {
    await GlobalChallenge.updateOne(
      { key: "global", lastScheduledCycleKey: bounds.cycleKey },
      { $set: { status: "COMPLETED" } },
    );
    return null;
  }
  const question = await Challenge.findOne({ _id: questionId, isActive: true });
  if (!question) {
    throw requestError("A scheduled global challenge question is no longer active.", 503);
  }
  try {
    const cycle = await WeeklyCycle.create({
      cycleKey: bounds.cycleKey,
      name: `${globalChallenge.name} · ${bounds.cycleKey}`,
      isGlobalChallenge: true,
      timezone: "Asia/Kolkata",
      startAt: bounds.startAt,
      endAt: bounds.endAt,
      recoveryUntilAt: getWeeklyRecoveryDeadline(bounds.endAt),
      questionAssignments: [createQuestionAssignment(question, 0)],
      shrinkageK: WEEKLY_SHRINKAGE_K,
    });
    await GlobalChallenge.updateOne(
      { key: "global", lastScheduledCycleKey: bounds.cycleKey },
      { $set: { status: "ACTIVE" } },
    );
    return cycle;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const concurrentGlobalCycle = await findGlobalCycleForDay(
      bounds.cycleKey,
      globalChallenge.name,
    );
    if (concurrentGlobalCycle) return concurrentGlobalCycle;
    throw requestError(
      "A different daily cycle already uses the configured global challenge date.",
      503,
    );
  }
}

export async function ensureCurrentGlobalCycle(now = new Date()) {
  return getOrCreateCurrentDailyCycle(now);
}

export async function getCandidateWeeklyState(candidateId, now = new Date()) {
  const globalConfiguration = await GlobalChallenge.findOne({ key: "global" })
    .select("name startAt status")
    .lean();
  let cycle;
  if (globalConfiguration) {
    if (
      !globalConfiguration.name ||
      !globalConfiguration.startAt ||
      globalConfiguration.status === "DRAFT"
    ) {
      return null;
    }
    cycle = await getOrCreateCurrentDailyCycle(now);
  } else {
    cycle = await WeeklyCycle.findOne({
      startAt: { $lte: now },
      endAt: { $gt: now },
      status: { $in: ["SCHEDULED", "ACTIVE"] },
    }).sort({ startAt: -1 });
  }
  if (!cycle) return null;
  if (!["SCHEDULED", "ACTIVE"].includes(cycle.status) || now < cycle.startAt || now >= cycle.endAt) {
    return null;
  }
  if (!cycle.rosterFrozenAt) await freezeWeeklyRoster(cycle._id);
  const roster = await ensureDailyRosterEntry(cycle, candidateId, now);
  if (!roster) {
    throw requestError("Candidate was not in the frozen eligible roster.", 403);
  }
  const dayIndex = getCurrentDayIndex(cycle, now);
  const assignment = cycle.questionAssignments.find((item) => item.dayIndex === dayIndex);
  const [submission] = await Promise.all([
    WeeklySubmission.findOne({ cycleId: cycle._id, candidateId, dayIndex }),
  ]);
  const question = resolveDailyQuestion(assignment);
  return {
    cycle: {
      id: cycle._id,
      cycleKey: cycle.cycleKey,
      name: cycle.name,
      startAt: cycle.startAt,
      endAt: cycle.endAt,
      timezone: cycle.timezone,
    },
    dayIndex,
    dayNumber: dayIndex + 1,
    roster: {
      participationStatus: roster.participationStatus,
      score: roster.score,
      completedQuestions: roster.completedDays.length,
      completedDays: roster.completedDays,
    },
    question,
    submission: submission ? {
      id: submission._id,
      status: submission.status,
      executionMode: submission.executionMode,
      resultStatus: submission.resultStatus,
      score: submission.score,
      passed: submission.passed,
      total: submission.total,
      executionTime: submission.executionTime,
      finalizedAt: submission.finalizedAt,
      verificationStartedAt: submission.verificationStartedAt,
      verificationCompletedAt: submission.verificationCompletedAt,
      verificationError: submission.verificationError,
    } : null,
  };
}

function sourceHash(code) {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function hashVersion(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function weeklyLocalExecutionVersions(cycle, assignment) {
  const question = assignment?.questionSnapshot;
  if (!question) throw requestError("The assigned daily question is unavailable.", 503);
  const testCases = getChallengeTestCases(question).map((testCase) => ({
    input: String(
      testCase.parameterValues &&
        typeof testCase.parameterValues === "object" &&
        question.signature?.name
        ? convertParameterValuesToInput(question.signature, testCase.parameterValues)
        : testCase.input ?? "",
    ),
    expectedOutput: String(testCase.expectedOutput ?? ""),
  }));
  return {
    testCases,
    testSetVersion: hashVersion(testCases),
    challengeVersion: hashVersion({
      cycleId: String(cycle._id),
      challengeId: String(assignment.challengeId),
      dayIndex: assignment.dayIndex,
      title: question.title || "",
      description: question.description || "",
      signature: question.signature || null,
      points: Number(question.points) || 0,
      testSetVersion: hashVersion(testCases),
    }),
  };
}

function weeklyLocalGrantResource({
  cycleId,
  candidateId,
  submissionId,
  dayIndex,
  challengeId,
  sourceHash: hash,
  executionId,
  challengeVersion,
  testSetVersion,
  clientVersion,
  engineVersion,
}) {
  return [
    cycleId,
    candidateId,
    submissionId,
    dayIndex,
    challengeId,
    hash,
    executionId,
    challengeVersion,
    testSetVersion,
    clientVersion,
    engineVersion,
  ].join(":");
}

async function getCurrentDailyExecutionContext(candidateId, now) {
  const globalConfiguration = await GlobalChallenge.findOne({ key: "global" })
    .select("name startAt status")
    .lean();
  let cycle;
  if (globalConfiguration) {
    if (
      !globalConfiguration.name ||
      !globalConfiguration.startAt ||
      globalConfiguration.status === "DRAFT"
    ) {
      throw requestError("No open daily challenge submission window.", 403);
    }
    cycle = await getOrCreateCurrentDailyCycle(now);
  } else {
    cycle = await WeeklyCycle.findOne({
      startAt: { $lte: now },
      endAt: { $gt: now },
      status: { $in: ["SCHEDULED", "ACTIVE"] },
    }).sort({ startAt: -1 });
  }
  if (!cycle) throw requestError("No open daily challenge submission window.", 403);
  if (!cycle.rosterFrozenAt) await freezeWeeklyRoster(cycle._id);
  const roster = await ensureDailyRosterEntry(cycle, candidateId, now);
  if (!roster) {
    throw requestError("Candidate was not in the frozen eligible roster.", 403);
  }
  if (roster.participationStatus === "DISQUALIFIED") {
    throw requestError("Disqualified candidates cannot submit.", 403);
  }
  const dayIndex = getCurrentDayIndex(cycle, now);
  const assignment = cycle.questionAssignments.find(
    (item) => item.dayIndex === dayIndex,
  );
  if (!assignment?.questionSnapshot) {
    throw requestError("The assigned daily question is unavailable.", 503);
  }
  return { cycle, roster, dayIndex, assignment };
}

export async function createWeeklyLocalExecutionGrant({
  candidateId,
  cycleId,
  questionId,
  sourceHash: hash,
  executionId,
  clientVersion,
  engineVersion,
  executionProtocolVersion,
  now = new Date(),
}) {
  if (
    !mongoose.Types.ObjectId.isValid(cycleId) ||
    !mongoose.Types.ObjectId.isValid(questionId) ||
    !/^[a-f\d]{64}$/i.test(hash || "") ||
    !/^[a-f\d-]{36}$/i.test(executionId || "") ||
    clientVersion !== DESKTOP_CLIENT_VERSION ||
    engineVersion !== DESKTOP_ENGINE_VERSION ||
    executionProtocolVersion !== LOCAL_EXECUTION_PROTOCOL_VERSION
  ) {
    throw requestError("The Desktop execution grant request is invalid or unsupported.", 400);
  }

  const { cycle, roster, dayIndex, assignment } =
    await getCurrentDailyExecutionContext(candidateId, now);
  if (String(cycle._id) !== cycleId) {
    throw requestError("The Daily Challenge session is no longer current.", 409);
  }
  if (String(assignment.challengeId) !== questionId) {
    throw requestError("The requested question is not assigned to this Daily Challenge.", 409);
  }
  const versions = weeklyLocalExecutionVersions(cycle, assignment);
  if (
    versions.testCases.length === 0 ||
    versions.testCases.length > 50
  ) {
    throw requestError("The assigned question has an invalid test-case set.", 503);
  }

  const existingSubmission = await WeeklySubmission.findOne({
    cycleId: cycle._id,
    candidateId,
    dayIndex,
  }).select("+sourceHash");
  if (existingSubmission?.status === "FINALIZED") {
    throw requestError("Only one finalized submission is allowed per assessment day.", 409);
  }
  if (existingSubmission && existingSubmission.sourceHash !== hash.toLowerCase()) {
    throw requestError("Retry must use the identical source submitted for this assessment day.", 409);
  }
  if (existingSubmission && existingSubmission.executionMode !== "DESKTOP_LOCAL") {
    throw requestError("A submission is already in progress using another execution mode.", 409);
  }

  let reservation = existingSubmission;
  if (!reservation) {
    const reservationId = new mongoose.Types.ObjectId();
    try {
      reservation = await WeeklySubmission.create({
        _id: reservationId,
        cycleId: cycle._id,
        candidateId,
        rosterEntryId: roster._id,
        dayIndex,
        challengeId: assignment.challengeId,
        sourceHash: hash.toLowerCase(),
        sourceCode: "",
        executionMode: "DESKTOP_LOCAL",
        status: "AUTHORIZED",
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      reservation = await WeeklySubmission.findOne({
        cycleId: cycle._id,
        candidateId,
        dayIndex,
      }).select("+sourceHash");
      if (!reservation) throw error;
      if (reservation.sourceHash !== hash.toLowerCase()) {
        throw requestError("A different source is already reserved for this assessment day.", 409);
      }
      if (
        reservation.executionMode !== "DESKTOP_LOCAL" ||
        !["AUTHORIZED", "RETRYABLE"].includes(reservation.status)
      ) {
        throw requestError("A submission is already in progress using another execution mode.", 409);
      }
    }
  }
  const submissionId = String(reservation._id);
  const resourceId = weeklyLocalGrantResource({
    cycleId: String(cycle._id),
    candidateId: String(candidateId),
    submissionId,
    dayIndex,
    challengeId: String(assignment.challengeId),
    sourceHash: hash.toLowerCase(),
    executionId,
    challengeVersion: versions.challengeVersion,
    testSetVersion: versions.testSetVersion,
    clientVersion,
    engineVersion,
  });
  const existingGrant = await Nonce.findOne({
    userId: candidateId,
    action: "SUBMIT",
    resourceId,
    recoveryExpiresAt: { $gt: now },
    $or: [
      { state: "AVAILABLE", authorizationExpiresAt: { $gt: now } },
      { state: { $in: ["PROCESSING", "RETRYABLE"] } },
    ],
  }).lean();
  const nonce =
    existingGrant?.nonce ||
    (await Nonce.generate(candidateId, "SUBMIT", resourceId, 5 * 60 * 1000));
  const savedGrant = await Nonce.findOne({ userId: candidateId, nonce }).lean();

  return {
    nonce,
    executionId,
    submissionId,
    assessmentId: String(cycle._id),
    challengeId: String(assignment.challengeId),
    challengeVersion: versions.challengeVersion,
    testSetVersion: versions.testSetVersion,
    clientVersion,
    engineVersion,
    executionProtocolVersion: LOCAL_EXECUTION_PROTOCOL_VERSION,
    testCount: versions.testCases.length,
    expiresAt: savedGrant?.authorizationExpiresAt || null,
  };
}

export async function finalizeWeeklyLocalExecution({
  candidateId,
  transcript,
  transcriptHash,
  now = new Date(),
}) {
  if (!transcript || typeof transcript !== "object" || Array.isArray(transcript)) {
    throw requestError("A local execution transcript is required.", 400);
  }
  const { cycle, roster, dayIndex, assignment } =
    await getCurrentDailyExecutionContext(candidateId, now);
  if (String(cycle._id) !== String(transcript.assessmentId)) {
    throw requestError("The execution transcript belongs to a different assessment.", 409);
  }
  const versions = weeklyLocalExecutionVersions(cycle, assignment);
  const validation = validateLocalExecutionTranscript({
    transcript,
    transcriptHash,
    expected: {
      executionId: transcript.executionId,
      submissionId: transcript.submissionId,
      assessmentId: String(cycle._id),
      challengeId: String(assignment.challengeId),
      challengeVersion: versions.challengeVersion,
      sourceHash: transcript.sourceHash,
      nonce: transcript.nonce,
      clientVersion: DESKTOP_CLIENT_VERSION,
      engineVersion: DESKTOP_ENGINE_VERSION,
      testSetVersion: versions.testSetVersion,
      testCount: versions.testCases.length,
      allowedClientVersion: DESKTOP_CLIENT_VERSION,
      allowedEngineVersion: DESKTOP_ENGINE_VERSION,
    },
    now: now.getTime(),
  });
  const resourceId = weeklyLocalGrantResource({
    cycleId: String(cycle._id),
    candidateId: String(candidateId),
    submissionId: String(transcript.submissionId),
    dayIndex,
    challengeId: String(assignment.challengeId),
    sourceHash: transcript.sourceHash,
    executionId: transcript.executionId,
    challengeVersion: versions.challengeVersion,
    testSetVersion: versions.testSetVersion,
    clientVersion: DESKTOP_CLIENT_VERSION,
    engineVersion: DESKTOP_ENGINE_VERSION,
  });
  const nonceClaim = await Nonce.claimDesktopSubmission(
    candidateId,
    transcript.nonce,
    resourceId,
  );
  if (!nonceClaim.nonce || !nonceClaim.claimed) {
    throw requestError("The local execution grant is invalid, expired, or already used.", 409);
  }

  try {
    const score =
      Math.round((DAILY_POINTS * validation.passed / validation.total) * 100) / 100;
    const finalizedAt = new Date(now);
    const update = {
      cycleId: cycle._id,
      candidateId,
      rosterEntryId: roster._id,
      dayIndex,
      challengeId: assignment.challengeId,
      sourceHash: transcript.sourceHash,
      sourceCode: "",
      executionId: transcript.executionId,
      executionMode: "DESKTOP_LOCAL",
      transcriptHash: transcriptHash.toLowerCase(),
      clientVersion: transcript.clientVersion,
      engineVersion: transcript.engineVersion,
      executionProtocolVersion: transcript.executionProtocolVersion,
      riskSignals: validation.riskSignals,
      riskScore: validation.riskScore,
      riskLevel: validation.riskLevel,
      executionTranscript: transcript,
      status: "FINALIZED",
      resultStatus: validation.status,
      verificationAttempts: 0,
      verificationStartedAt: new Date(transcript.startTime),
      verificationCompletedAt: new Date(transcript.endTime),
      verificationError: "",
      score,
      passed: validation.passed,
      total: validation.total,
      executionTime: validation.durationMs,
      finalizedAt,
      judgeLeaseAt: finalizedAt,
    };
    const finalizedSubmission = await WeeklySubmission.findOneAndUpdate(
      {
        cycleId: cycle._id,
        candidateId,
        dayIndex,
        status: { $in: ["AUTHORIZED", "RETRYABLE"] },
        sourceHash: transcript.sourceHash,
        executionMode: "DESKTOP_LOCAL",
      },
      { $set: update },
      { new: true },
    ).select("+sourceHash");
    if (!finalizedSubmission || String(finalizedSubmission._id) !== transcript.submissionId) {
      throw requestError("The authorized Daily Challenge submission is no longer available.", 409);
    }
    const completedGrant = await Nonce.completeDesktopSubmission(
      nonceClaim.nonce._id,
      nonceClaim.claimId,
    );
    if (!completedGrant) {
      console.error("[DailyLocalSubmission] Result saved but the grant could not be finalized.", {
        executionId: transcript.executionId,
        submissionId: String(finalizedSubmission._id),
      });
    }
    await synchronizeRosterScore(roster._id);
    void dispatchWeeklyCompletionEmail(finalizedSubmission._id).catch((error) => {
      console.error("[CompletionEmail] Daily Challenge notification failed:", {
        submissionId: String(finalizedSubmission._id),
        error: error.message,
      });
    });
    return {
      submissionId: String(finalizedSubmission._id),
      status: "FINALIZED",
      resultStatus: validation.status,
      score,
      passed: validation.passed,
      total: validation.total,
      executionTime: validation.durationMs,
      executionMode: "DESKTOP_LOCAL",
      riskSignals: validation.riskSignals,
    };
  } catch (error) {
    await Nonce.releaseDesktopSubmission(nonceClaim.nonce._id, nonceClaim.claimId);
    if (error?.code === 11000) {
      throw requestError("A submission for this assessment day has already been finalized.", 409);
    }
    throw error;
  }
}

function isRetryableJudgeFailure(result) {
  return ["SYSTEM_ERROR", "PENDING", "PROCESSING"].includes(result?.status);
}

function sanitizedResult(result, score) {
  return {
    status: result.status,
    accepted: result.accepted,
    passed: result.passed,
    total: result.total,
    score,
    executionTime: result.executionTime,
  };
}

async function claimWeeklySubmission(submission, now) {
  const claimed = await WeeklySubmission.findOneAndUpdate(
    { _id: submission._id, status: "RETRYABLE" },
    {
      $set: {
        status: "PENDING_VERIFICATION",
        verificationError: "",
        verificationCompletedAt: null,
      },
    },
    { new: true },
  ).select("+sourceHash +sourceCode");
  if (!claimed) {
    const current = await WeeklySubmission.findById(submission._id)
      .select("+sourceHash +sourceCode");
    if (current && ["PENDING_VERIFICATION", "VERIFYING"].includes(current.status)) {
      return current;
    }
    throw requestError("Submission retry lease could not be acquired.", 409);
  }
  return claimed;
}

async function judgeWeeklySubmission({ submission, roster, assignment, code }) {
  const startedAt = performance.now();
  const startedDate = new Date();
  logWeeklyVerification("verification_started", {
    submissionId: String(submission._id),
    queueWaitMs: Math.max(0, startedDate.getTime() - new Date(submission.createdAt || startedDate).getTime()),
  });
  await WeeklySubmission.updateOne(
    {
      _id: submission._id,
      status: "VERIFYING",
      judgeLeaseAt: submission.judgeLeaseAt,
    },
    { $set: { verificationStartedAt: startedDate } },
  );
  const challenge = assignment?.questionSnapshot;
  if (!challenge) throw requestError("The assigned daily question is unavailable.", 503);
  const cases = getChallengeTestCases(challenge);
  if (!cases.length || cases.length > 50) {
    await WeeklySubmission.updateOne(
      {
        _id: submission._id,
        status: "VERIFYING",
        judgeLeaseAt: submission.judgeLeaseAt,
      },
      {
        $set: {
          status: "RETRYABLE",
          verificationCompletedAt: new Date(),
          verificationError: "Assigned question has an invalid test-case configuration.",
        },
      },
    );
    const error = requestError("Assigned question has an invalid test-case configuration.", 503);
    error.submissionId = String(submission._id);
    throw error;
  }

  let result;
  try {
    const program = composeProgram(challenge, code, "java");
    const executionStartedAt = performance.now();
    logWeeklyVerification("execution_started", {
      submissionId: String(submission._id),
    });
    result = await executionService.execute(program, cases, "java", {
      timeLimit: 2000,
      memoryLimit: 65536,
    });
    logWeeklyVerification("execution_completed", {
      submissionId: String(submission._id),
      status: result.status,
      durationMs: Number((performance.now() - executionStartedAt).toFixed(3)),
    });
  } catch (error) {
    result = {
      status: "SYSTEM_ERROR",
      accepted: false,
      passed: 0,
      total: cases.length,
      executionTime: 0,
      error: error.message,
    };
  }

  if (isRetryableJudgeFailure(result)) {
    await WeeklySubmission.updateOne(
      {
        _id: submission._id,
        status: "VERIFYING",
        judgeLeaseAt: submission.judgeLeaseAt,
      },
      {
        $set: {
          status: "RETRYABLE",
          resultStatus: result.status,
          verificationCompletedAt: new Date(),
          verificationError: "The authoritative judge could not complete verification.",
        },
      },
    );
    const error = requestError(
      "The authoritative judge is temporarily unavailable; retry the identical code.",
      503,
    );
    error.submissionId = String(submission._id);
    throw error;
  }
  const score = Math.round(
    (DAILY_POINTS * (Number(result.passed) || 0) / (Number(result.total) || 1)) * 100,
  ) / 100;
  const databaseStartedAt = performance.now();
  const finalized = await WeeklySubmission.findOneAndUpdate(
    {
      _id: submission._id,
      status: "VERIFYING",
      judgeLeaseAt: submission.judgeLeaseAt,
    },
    {
      $set: {
        status: "FINALIZED",
        resultStatus: String(result.status || "SYSTEM_ERROR"),
        score,
        passed: Number(result.passed) || 0,
        total: Number(result.total) || cases.length,
        executionTime: Number(result.executionTime) || 0,
        finalizedAt: new Date(),
        verificationCompletedAt: new Date(),
        verificationError: "",
      },
    },
    { new: true },
  );
  if (!finalized) {
    const error = requestError("This judge request lost its submission lease; use the saved-source recovery flow.", 409);
    error.submissionId = String(submission._id);
    throw error;
  }
  logWeeklyVerification("database_update", {
    submissionId: String(submission._id),
    status: "FINALIZED",
    durationMs: Number((performance.now() - databaseStartedAt).toFixed(3)),
  });
  await synchronizeRosterScore(roster._id);
  void dispatchWeeklyCompletionEmail(finalized._id).catch((error) => {
    console.error("[CompletionEmail] Daily Challenge notification failed:", {
      submissionId: String(finalized._id),
      error: error.message,
    });
  });
  logWeeklyVerification("verification_completed", {
    submissionId: String(submission._id),
    durationMs: Number((performance.now() - startedAt).toFixed(3)),
  });
  return sanitizedResult(result, score);
}

async function claimNextWeeklyVerification(now = new Date()) {
  const staleBefore = new Date(now.getTime() - RETRY_LEASE_MS);
  return WeeklySubmission.findOneAndUpdate(
    {
      $or: [
        { status: "PENDING_VERIFICATION" },
        {
          status: { $in: ["VERIFYING", "JUDGING"] },
          judgeLeaseAt: { $lte: staleBefore },
        },
      ],
    },
    {
      $set: {
        status: "VERIFYING",
        judgeLeaseAt: now,
        verificationStartedAt: now,
      },
      $inc: { verificationAttempts: 1 },
    },
    { new: true, sort: { createdAt: 1 } },
  ).select("+sourceHash +sourceCode");
}

let weeklyWorkerRunning = false;

async function drainWeeklyVerificationQueue() {
  if (mongoose.connection.readyState !== 1) return;
  if (weeklyWorkerRunning) return;
  weeklyWorkerRunning = true;
  try {
    let submission;
    while ((submission = await claimNextWeeklyVerification())) {
      const id = String(submission._id);
      try {
        if (!submission.sourceCode) {
          await WeeklySubmission.updateOne(
            { _id: submission._id, status: "VERIFYING", judgeLeaseAt: submission.judgeLeaseAt },
            {
              $set: {
                status: "RETRYABLE",
                resultStatus: "RECOVERY_REQUIRED",
                verificationError: "Saved source is unavailable; restore the original source to retry.",
                verificationCompletedAt: new Date(),
              },
            },
          );
          continue;
        }
        const [cycle, roster] = await Promise.all([
          WeeklyCycle.findById(submission.cycleId),
          WeeklyRosterEntry.findOne({
            _id: submission.rosterEntryId,
            cycleId: submission.cycleId,
            candidateId: submission.candidateId,
            participationStatus: { $ne: "DISQUALIFIED" },
          }),
        ]);
        const assignment = cycle?.questionAssignments.find(
          (item) =>
            item.dayIndex === submission.dayIndex &&
            String(item.challengeId) === String(submission.challengeId),
        );
        if (!cycle || !roster || !assignment) {
          await WeeklySubmission.updateOne(
            { _id: submission._id, status: "VERIFYING", judgeLeaseAt: submission.judgeLeaseAt },
            {
              $set: {
                status: "RETRYABLE",
                resultStatus: "RECOVERY_REQUIRED",
                verificationError: "The saved assessment assignment could not be verified.",
                verificationCompletedAt: new Date(),
              },
            },
          );
          continue;
        }
        await judgeWeeklySubmission({
          submission,
          roster,
          assignment,
          code: submission.sourceCode,
        });
      } catch (error) {
        console.error(
          `[WeeklyAssessment] Verification worker failed for ${id}:`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.error("[WeeklyAssessment] Verification queue polling failed:", error.message);
  } finally {
    weeklyWorkerRunning = false;
  }
}

export function wakeWeeklyVerificationWorker() {
  setImmediate(() => {
    drainWeeklyVerificationQueue().catch((error) => {
      console.error("[WeeklyAssessment] Verification worker wake failed:", error.message);
    });
  });
}

export function startWeeklyVerificationWorker() {
  if (weeklyVerificationWorkerStarted) return;
  weeklyVerificationWorkerStarted = true;
  cron.schedule("*/5 * * * * *", wakeWeeklyVerificationWorker);
  wakeWeeklyVerificationWorker();
}

async function synchronizeRosterScore(rosterEntryId) {
  const submissions = await WeeklySubmission.find({
    rosterEntryId,
    status: "FINALIZED",
  }).select("dayIndex score passed total finalizedAt");
  const result = summarizeWeeklySubmissions(submissions);
  await WeeklyRosterEntry.updateOne(
    { _id: rosterEntryId, participationStatus: { $ne: "DISQUALIFIED" } },
    {
      $set: {
        ...result,
        lastSubmittedAt: result.resultFinalizedAt,
      },
    },
  );
}

async function refreshCycleRosterScores(cycleId) {
  const [roster, aggregates] = await Promise.all([
    WeeklyRosterEntry.find({ cycleId }).select("_id participationStatus").lean(),
    WeeklySubmission.aggregate([
      { $match: { cycleId: new mongoose.Types.ObjectId(cycleId), status: "FINALIZED" } },
      {
        $group: {
          _id: "$rosterEntryId",
          score: { $sum: "$score" },
          passedTestCases: { $sum: "$passed" },
          totalTestCases: { $sum: "$total" },
          completedDays: { $addToSet: "$dayIndex" },
          lastSubmittedAt: { $max: "$finalizedAt" },
        },
      },
    ]),
  ]);
  const byRosterId = new Map(aggregates.map((row) => [String(row._id), row]));
  const updates = roster
    .filter((entry) => entry.participationStatus !== "DISQUALIFIED")
    .map((entry) => {
      const aggregate = byRosterId.get(String(entry._id));
      const completedDays = (aggregate?.completedDays || []).sort((left, right) => left - right);
      return {
        updateOne: {
          filter: { _id: entry._id, participationStatus: { $ne: "DISQUALIFIED" } },
          update: {
            $set: {
              score: Math.round((Number(aggregate?.score) || 0) * 100) / 100,
              completedDays,
              passedTestCases: Number(aggregate?.passedTestCases) || 0,
              totalTestCases: Number(aggregate?.totalTestCases) || 0,
              resultFinalizedAt: aggregate?.lastSubmittedAt || null,
              participationStatus: completedDays.length ? "PARTICIPATED" : "NOT_STARTED",
              lastSubmittedAt: aggregate?.lastSubmittedAt || null,
            },
          },
        },
      };
    });
  for (let offset = 0; offset < updates.length; offset += 500) {
    await WeeklyRosterEntry.bulkWrite(updates.slice(offset, offset + 500), { ordered: false });
  }
}

export async function submitWeeklyAnswer({ candidateId, code, now = new Date() }) {
  if (typeof code !== "string" || code.trim().length === 0 || code.length > 50000) {
    const error = new Error("Code is required and must not exceed 50000 characters.");
    error.statusCode = 400;
    throw error;
  }
  let cycle = await WeeklyCycle.findOne({
    startAt: { $lte: now },
    endAt: { $gt: now },
    status: { $in: ["SCHEDULED", "ACTIVE"] },
  }).sort({ startAt: -1 });
  if (!cycle) cycle = await getOrCreateCurrentDailyCycle(now);
  if (!cycle) {
    throw requestError("No open weekly assessment submission window.", 403);
  }
  if (!cycle.rosterFrozenAt) await freezeWeeklyRoster(cycle._id);
  const roster = await ensureDailyRosterEntry(cycle, candidateId, now);
  if (!roster) {
    throw requestError("Candidate was not in the frozen eligible roster.", 403);
  }
  if (roster.participationStatus === "DISQUALIFIED") {
    throw requestError("Disqualified candidates cannot submit.", 403);
  }
  const dayIndex = getCurrentDayIndex(cycle, now);
  const assignment = cycle.questionAssignments.find((item) => item.dayIndex === dayIndex);
  const challenge = assignment.questionSnapshot;
  if (!challenge) {
    throw requestError("The assigned daily question is unavailable.", 503);
  }

  const hash = sourceHash(code);
  let submission = await WeeklySubmission.findOne({ cycleId: cycle._id, candidateId, dayIndex })
    .select("+sourceHash +sourceCode");
  if (submission) {
    if (submission.status === "FINALIZED") {
      const error = new Error("Only one finalized submission is allowed per assessment day.");
      error.statusCode = 409;
      throw error;
    }
    if (submission.executionMode === "DESKTOP_LOCAL") {
      throw requestError("This submission is reserved for Desktop local execution.", 409);
    }
    if (submission.sourceHash !== hash) {
      throw requestError("Retry must use the identical source submitted for this assessment day.", 409);
    }
    if (["PENDING_VERIFICATION", "VERIFYING"].includes(submission.status)) {
      wakeWeeklyVerificationWorker();
      return weeklySubmissionAcknowledgement(submission);
    }
    if (submission.status === "JUDGING") {
      wakeWeeklyVerificationWorker();
      return weeklySubmissionAcknowledgement(submission);
    }
    submission = await claimWeeklySubmission(submission, now);
  } else {
    try {
      submission = await WeeklySubmission.create({
        cycleId: cycle._id,
        candidateId,
        rosterEntryId: roster._id,
        dayIndex,
        challengeId: assignment.challengeId,
        sourceHash: hash,
        sourceCode: code,
        status: "PENDING_VERIFICATION",
        judgeLeaseAt: now,
      });
    } catch (error) {
      if (error?.code === 11000) {
        submission = await WeeklySubmission.findOne({
          cycleId: cycle._id,
          candidateId,
          dayIndex,
        }).select("+sourceHash +sourceCode");
        if (!submission || submission.sourceHash !== hash) {
          throw requestError("A different submission already exists for this assessment day.", 409);
        }
        if (submission.status === "FINALIZED") {
          throw requestError("Only one finalized submission is allowed per assessment day.", 409);
        }
      }
      if (!submission) throw error;
    }
  }

  logWeeklyVerification("submission_received", {
    submissionId: String(submission._id),
    candidateId: String(candidateId),
  });
  wakeWeeklyVerificationWorker();
  return weeklySubmissionAcknowledgement(submission);
}

export async function retryWeeklyAnswer({ candidateId, submissionId, code, now = new Date() }) {
  if (typeof code !== "string" || code.trim().length === 0 || code.length > 50000) {
    throw requestError("Code is required and must not exceed 50000 characters.");
  }
  if (!mongoose.Types.ObjectId.isValid(submissionId)) {
    throw requestError("Invalid weekly submission ID.");
  }
  const submission = await WeeklySubmission.findOne({
    _id: submissionId,
    candidateId,
  }).select("+sourceHash +sourceCode");
  if (!submission) throw requestError("Recoverable weekly submission not found.", 404);
  if (submission.executionMode === "DESKTOP_LOCAL") {
    throw requestError("Desktop-local submissions must be recovered through the Desktop execution flow.", 409);
  }
  if (submission.status === "FINALIZED") {
    throw requestError("Finalized weekly submissions cannot be replayed.", 409);
  }
  if (submission.sourceHash !== sourceHash(code)) {
    throw requestError("Recovery must use the exact source bound to the original submission.", 409);
  }
  if (["PENDING_VERIFICATION", "VERIFYING"].includes(submission.status)) {
    wakeWeeklyVerificationWorker();
    return weeklySubmissionAcknowledgement(submission);
  }
  if (submission.status === "JUDGING") {
    wakeWeeklyVerificationWorker();
    return weeklySubmissionAcknowledgement(submission);
  }
  const cycle = await WeeklyCycle.findOne({
    _id: submission.cycleId,
    status: "ACTIVE",
    recoveryUntilAt: { $gt: now },
  });
  if (!cycle) {
    throw requestError("This weekly cycle's 24-hour submission recovery window has closed.", 403);
  }
  const roster = await WeeklyRosterEntry.findOne({
    _id: submission.rosterEntryId,
    cycleId: cycle._id,
    candidateId,
    participationStatus: { $ne: "DISQUALIFIED" },
  });
  if (!roster) throw requestError("Candidate is not authorized to recover this submission.", 403);
  const assignment = cycle.questionAssignments.find(
    (item) => item.dayIndex === submission.dayIndex,
  );
  if (!assignment || String(assignment.challengeId) !== String(submission.challengeId)) {
    throw requestError("Submission no longer matches the saved weekly question assignment.", 409);
  }
  const claimed = await claimWeeklySubmission(submission, now);
  await WeeklySubmission.updateOne(
    { _id: claimed._id, status: "PENDING_VERIFICATION" },
    { $set: { sourceCode: code } },
  );
  wakeWeeklyVerificationWorker();
  return weeklySubmissionAcknowledgement(claimed);
}

export async function listRecoverableWeeklySubmissions(candidateId, now = new Date()) {
  const recentFinalizedAfter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cycles = await WeeklyCycle.find({
    startAt: { $lte: now },
    $or: [
      {
        status: "ACTIVE",
        $or: [
          { recoveryUntilAt: { $gt: now } },
          { recoveryUntilAt: null, endAt: { $gt: now } },
        ],
      },
      {
        status: "FINALIZED",
        finalizedAt: { $gte: recentFinalizedAfter },
      },
    ],
  }).select("questionAssignments endAt recoveryUntilAt finalizedAt");
  if (!cycles.length) return [];
  const submissions = await WeeklySubmission.find({
    cycleId: { $in: cycles.map((cycle) => cycle._id) },
    candidateId,
    status: {
      $in: ["PENDING_VERIFICATION", "VERIFYING", "JUDGING", "RETRYABLE", "FINALIZED"],
    },
  }).select(
    "cycleId dayIndex status executionMode resultStatus score passed total verificationCompletedAt judgeLeaseAt createdAt",
  ).sort({ cycleId: 1, dayIndex: 1 });
  const cycleById = new Map(cycles.map((cycle) => [String(cycle._id), cycle]));
  return submissions
    .map((submission) => {
      const cycle = cycleById.get(String(submission.cycleId));
      const canRetry =
        submission.executionMode !== "DESKTOP_LOCAL" &&
        (submission.status === "RETRYABLE" ||
          (["JUDGING", "VERIFYING", "PENDING_VERIFICATION"].includes(
            submission.status,
          ) &&
            now - (submission.judgeLeaseAt || submission.createdAt) >=
              RETRY_LEASE_MS));
      return {
        id: submission._id,
        cycleId: submission.cycleId,
        dayIndex: submission.dayIndex,
        dayNumber: submission.dayIndex + 1,
        recoveryUntilAt: cycle
          ? cycle.recoveryUntilAt || getWeeklyRecoveryDeadline(cycle.endAt)
          : null,
        questionTitle:
          cycle?.questionAssignments.find((item) => item.dayIndex === submission.dayIndex)
            ?.questionTitleSnapshot || "Weekly question",
        status: submission.status,
        executionMode: submission.executionMode,
        canRetry,
        createdAt: submission.createdAt,
        ...(submission.status === "FINALIZED"
          ? {
              resultStatus: submission.resultStatus,
              score: submission.score,
              passed: submission.passed,
              total: submission.total,
              verificationCompletedAt: submission.verificationCompletedAt,
            }
          : {}),
      };
    });
}

export function getWeeklyCertificateCategory(rank, type = "INDIVIDUAL") {
  if (rank === 1) return type === "ORGANIZATION" ? "ORGANIZATION_WINNER" : "WINNER";
  if (rank === 2) return type === "ORGANIZATION" ? "ORGANIZATION_RUNNER_UP" : "RUNNER_UP";
  if (rank === 3) return type === "ORGANIZATION"
    ? "ORGANIZATION_SECOND_RUNNER_UP"
    : "SECOND_RUNNER_UP";
  return type === "INDIVIDUAL" ? "PARTICIPATION" : null;
}

async function persistWeeklyCertificates(cycle, rankings, roster) {
  const issuedAt = new Date();
  const rosterById = new Map(roster.map((entry) => [String(entry.candidateId), entry]));
  const rankedById = new Map(
    rankings.individualRankings.map((ranking) => [
      String(ranking.candidateId),
      ranking,
    ]),
  );
  for (const [candidateId, rosterEntry] of rosterById) {
    if (!isWeeklyParticipationEligible(rosterEntry)) continue;
    const ranking = rankedById.get(candidateId);
    const category = ranking
      ? getWeeklyCertificateCategory(ranking.rank)
      : "PARTICIPATION";
    await WeeklyCertificate.updateOne(
      { cycleId: cycle._id, userId: rosterEntry.candidateId, type: "INDIVIDUAL" },
      {
        $setOnInsert: {
          certificateId: `DLY-${cycle.cycleKey.replaceAll("-", "")}-I-${randomUUID().toUpperCase()}`,
          cycleId: cycle._id,
          type: "INDIVIDUAL",
          category,
          userId: rosterEntry.candidateId,
          snapshot: {
            subjectName: rosterEntry.candidateNameSnapshot,
            organizationName: rosterEntry.organizationNameSnapshot,
            assessmentName: cycle.name,
            cycleKey: cycle.cycleKey,
            score: rosterEntry.score,
            rank: ranking?.rank ?? null,
            issuedAt,
          },
        },
      },
      { upsert: true },
    );
  }

  for (const ranking of rankings.organizationRankings.slice(0, 3)) {
    if (ranking.eligibleCandidates === 0) continue;
    const category = getWeeklyCertificateCategory(ranking.rank, "ORGANIZATION");
    await WeeklyCertificate.updateOne(
      { cycleId: cycle._id, organizationId: ranking.organizationId, type: "ORGANIZATION" },
      {
        $setOnInsert: {
          certificateId: `DLY-${cycle.cycleKey.replaceAll("-", "")}-O-${randomUUID().toUpperCase()}`,
          cycleId: cycle._id,
          type: "ORGANIZATION",
          category,
          organizationId: ranking.organizationId,
          snapshot: {
            subjectName: ranking.organizationNameSnapshot,
            organizationName: ranking.organizationNameSnapshot,
            assessmentName: cycle.name,
            cycleKey: cycle.cycleKey,
            score: ranking.finalScore,
            rank: ranking.rank,
            issuedAt,
          },
        },
      },
      { upsert: true },
    );
  }
}

export async function finalizeWeeklyCycle(cycleId, now = new Date()) {
  let cycle = await WeeklyCycle.findById(cycleId);
  if (!cycle) throw new Error("Weekly cycle not found.");
  if (cycle.status === "FINALIZED" && cycle.certificatesIssuedAt) return cycle;
  if (cycle.status === "FINALIZED") {
    const roster = await WeeklyRosterEntry.find({ cycleId: cycle._id }).lean();
    const rankings = {
      individualRankings: cycle.individualRankings,
      organizationRankings: cycle.organizationRankings,
    };
    await persistWeeklyCertificates(cycle, rankings, roster);
    await WeeklyCycle.updateOne(
      { _id: cycle._id, status: "FINALIZED", certificatesIssuedAt: null },
      { $set: { certificatesIssuedAt: new Date() } },
    );
    return WeeklyCycle.findById(cycle._id);
  }
  if (now < cycle.endAt) throw new Error("A weekly cycle cannot be finalized before its end.");
  if (!cycle.rosterFrozenAt) {
    await WeeklyCycle.updateOne({ _id: cycle._id }, { $set: { status: "ROSTER_MISSED" } });
    throw new Error("Weekly roster was not frozen; finalization is blocked.");
  }
  if (cycle.status === "ACTIVE") {
    cycle = await WeeklyCycle.findOneAndUpdate(
      { _id: cycle._id, status: "ACTIVE" },
      { $set: { status: "FINALIZING" } },
      { new: true },
    );
  }
  if (!cycle || !["FINALIZING", "FINALIZED"].includes(cycle.status)) {
    const latest = await WeeklyCycle.findById(cycleId);
    if (latest?.status === "FINALIZED") return latest;
    throw new Error("Weekly cycle is not ready for finalization.");
  }
  if (cycle.status === "FINALIZED") return cycle;
  const inFlight = await WeeklySubmission.exists({
    cycleId: cycle._id,
    status: { $in: ["PENDING_VERIFICATION", "VERIFYING", "JUDGING"] },
    $or: [
      { status: "PENDING_VERIFICATION" },
      { judgeLeaseAt: { $gt: new Date(now.getTime() - RETRY_LEASE_MS) } },
    ],
  });
  if (inFlight) {
    await WeeklyCycle.updateOne(
      { _id: cycle._id, status: "FINALIZING" },
      { $set: { status: "ACTIVE" } },
    );
    throw requestError("Finalization is waiting for an in-flight authoritative judge request.", 409);
  }
  await WeeklySubmission.updateMany(
    {
      cycleId: cycle._id,
      status: { $in: ["VERIFYING", "JUDGING"] },
      judgeLeaseAt: { $lte: new Date(now.getTime() - RETRY_LEASE_MS) },
    },
    { $set: { status: "RETRYABLE", resultStatus: "RECOVERY_REQUIRED" } },
  );
  const hasRecoverableSubmissions = Boolean(await WeeklySubmission.exists({
    cycleId: cycle._id,
    status: "RETRYABLE",
  }));
  if (shouldWaitForWeeklyRecovery({
    endAt: cycle.endAt,
    recoveryUntilAt: cycle.recoveryUntilAt,
    hasRecoverableSubmissions,
    now,
  })) {
    await WeeklyCycle.updateOne(
      { _id: cycle._id, status: "FINALIZING" },
      {
        $set: {
          status: "ACTIVE",
          recoveryUntilAt: cycle.recoveryUntilAt || getWeeklyRecoveryDeadline(cycle.endAt),
        },
      },
    );
    throw requestError("Cycle finalization is waiting for pending source-bound retries; the recovery window closes 24 hours after cycle end.", 409);
  }
  await refreshCycleRosterScores(cycle._id);
  const roster = await WeeklyRosterEntry.find({ cycleId: cycle._id }).lean();
  const rankings = calculateWeeklyRankings(roster, cycle.shrinkageK);
  let finalized = await WeeklyCycle.findOneAndUpdate(
    { _id: cycle._id, status: "FINALIZING" },
    {
      $set: {
        status: "FINALIZED",
        finalizedAt: now,
        individualRankings: rankings.individualRankings,
        organizationRankings: rankings.organizationRankings,
      },
    },
    { new: true },
  );
  if (!finalized) {
    finalized = await WeeklyCycle.findById(cycle._id);
    if (finalized?.status !== "FINALIZED") {
      throw new Error("Weekly cycle finalization could not be persisted.");
    }
  }
  await persistWeeklyCertificates(finalized, {
    individualRankings: finalized.individualRankings,
    organizationRankings: finalized.organizationRankings,
  }, roster);
  await WeeklyCycle.updateOne(
    { _id: finalized._id, status: "FINALIZED", certificatesIssuedAt: null },
    { $set: { certificatesIssuedAt: new Date() } },
  );
  return WeeklyCycle.findById(finalized._id);
}

export async function getWeeklyCycleResults(cycleId) {
  const cycle = await WeeklyCycle.findById(cycleId);
  if (!cycle) return null;
  const roster = await WeeklyRosterEntry.find({ cycleId }).lean();
  return {
    cycle: cycle.toObject(),
    ...calculateWeeklyRankings(roster, cycle.shrinkageK),
  };
}

export async function disqualifyWeeklyCandidate({ cycleId, candidateId, reason }) {
  const cycle = await WeeklyCycle.findById(cycleId);
  if (!cycle || cycle.status !== "ACTIVE" || new Date() >= cycle.endAt) {
    throw requestError("Only open weekly cycles can be disqualified.", 409);
  }
  const roster = await WeeklyRosterEntry.findOneAndUpdate(
    { cycleId, candidateId, participationStatus: { $ne: "DISQUALIFIED" } },
    {
      $set: {
        participationStatus: "DISQUALIFIED",
        score: 0,
        disqualifiedAt: new Date(),
        disqualificationReason: String(reason || "").trim().slice(0, 500),
      },
    },
    { new: true },
  );
  if (!roster) throw requestError("Eligible roster candidate not found or already disqualified.", 404);
  return roster;
}
