import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Challenge from "../models/Challenge.js";
import GlobalChallenge from "../models/GlobalChallenge.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import OrganizationProfile from "../models/OrganizationProfile.js";
import User from "../models/User.js";
import WeeklyCertificate from "../models/WeeklyCertificate.js";
import WeeklyCycle from "../models/WeeklyCycle.js";
import WeeklyRosterEntry from "../models/WeeklyRosterEntry.js";
import WeeklySubmission from "../models/WeeklySubmission.js";
import { getChallengeTestCaseGroups } from "./challengeTestCases.js";
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
  WEEKLY_SHRINKAGE_K,
} from "../utils/weeklyAssessment.js";

const RETRY_LEASE_MS = 6 * 60 * 1000;
const DAILY_POINTS = 100;

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
  const { visible, hidden } = getChallengeTestCaseGroups(challenge);
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
      visibleTestCases: visible,
      hiddenTestCases: hidden,
      testCases: visible,
    },
  };
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
    startAt: bounds.startAt,
    endAt: bounds.endAt,
    recoveryUntilAt: getWeeklyRecoveryDeadline(bounds.endAt),
    questionAssignments,
    shrinkageK: WEEKLY_SHRINKAGE_K,
  });
}

export async function getGlobalChallengeConfiguration() {
  return GlobalChallenge.findOne({ key: "global" })
    .populate("questionIds", "title difficulty isActive")
    .lean();
}

export async function saveGlobalChallengeConfiguration({
  name,
  startAt,
  questionIds,
  now = new Date(),
}) {
  const existing = await GlobalChallenge.findOne({ key: "global" });
  const parsedStartAt = new Date(startAt);
  if (!Number.isFinite(parsedStartAt.getTime())) {
    throw requestError("Choose a valid global challenge start date and time.");
  }
  if (!Array.isArray(questionIds) || questionIds.length === 0 || questionIds.length > 50) {
    throw requestError("Select between 1 and 50 questions for the global challenge.");
  }
  const normalizedIds = questionIds.map(String);
  if (new Set(normalizedIds).size !== normalizedIds.length ||
    normalizedIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw requestError("Global challenge questions must be unique saved question IDs.");
  }
  if (!existing && parsedStartAt <= now) {
    throw requestError("The initial global challenge start must be in the future.", 409);
  }
  if (
    existing &&
    existing.startAt <= now &&
    parsedStartAt.getTime() !== existing.startAt.getTime()
  ) {
    throw requestError("The global challenge start time cannot be changed after it begins.", 409);
  }
  if (parsedStartAt <= now && (!existing || existing.startAt > now)) {
    throw requestError("The global challenge start must be in the future.", 409);
  }

  const questions = await Challenge.find({
    _id: { $in: normalizedIds },
    isActive: true,
  }).select("_id");
  if (questions.length !== normalizedIds.length) {
    throw requestError("Every selected question must be an active saved challenge.");
  }

  return GlobalChallenge.findOneAndUpdate(
    { key: "global" },
    {
      $set: {
        name: String(name || "").trim() || "Global Challenge",
        timezone: "Asia/Kolkata",
        startAt: parsedStartAt,
        questionIds: normalizedIds,
      },
      $setOnInsert: { key: "global" },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).populate("questionIds", "title difficulty isActive");
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
    .select("name role organizationId")
    .lean();
  const memberships = await OrganizationMembership.find({
    status: "ACTIVE",
    validFrom: { $lte: now },
    $or: [{ validTo: null }, { validTo: { $gt: now } }],
  }).lean();
  const membershipByUser = new Map(
    memberships.map((membership) => [String(membership.userId), membership]),
  );
  const organizations = await OrganizationProfile.find({
    _id: { $in: memberships.map((membership) => membership.organizationId) },
  }).lean();
  const organizationById = new Map(organizations.map((organization) => [String(organization._id), organization]));
  const entries = [];
  for (const user of candidates) {
    const membership = membershipByUser.get(String(user._id));
    const organization = membership && organizationById.get(String(membership.organizationId));
    const eligibleOrganization = organization?.status === "ACTIVE" ? organization : null;
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

async function getOrCreateCurrentDailyCycle(now) {
  const globalChallenge = await GlobalChallenge.findOne({ key: "global" }).lean();
  if (!globalChallenge || now < globalChallenge.startAt || globalChallenge.questionIds.length === 0) {
    return null;
  }

  const bounds = getRecurringCycleBounds(globalChallenge.startAt, now);
  const existing = await WeeklyCycle.findOne({ cycleKey: bounds.cycleKey });
  if (existing) return existing;

  const questionId =
    globalChallenge.questionIds[bounds.cycleIndex % globalChallenge.questionIds.length];
  const question = await Challenge.findOne({ _id: questionId, isActive: true });
  if (!question) {
    throw requestError("A scheduled global challenge question is no longer active.", 503);
  }
  try {
    return await WeeklyCycle.create({
      cycleKey: bounds.cycleKey,
      name: `${globalChallenge.name} · ${bounds.cycleKey}`,
      timezone: "Asia/Kolkata",
      startAt: bounds.startAt,
      endAt: bounds.endAt,
      recoveryUntilAt: getWeeklyRecoveryDeadline(bounds.endAt),
      questionAssignments: [createQuestionAssignment(question, 0)],
      shrinkageK: WEEKLY_SHRINKAGE_K,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return WeeklyCycle.findOne({ cycleKey: bounds.cycleKey });
  }
}

export async function ensureCurrentGlobalCycle(now = new Date()) {
  return getOrCreateCurrentDailyCycle(now);
}

export async function getCandidateWeeklyState(candidateId, now = new Date()) {
  let cycle = await WeeklyCycle.findOne({
    startAt: { $lte: now },
    endAt: { $gt: now },
    status: { $in: ["SCHEDULED", "ACTIVE"] },
  }).sort({ startAt: -1 });
  if (!cycle) cycle = await getOrCreateCurrentDailyCycle(now);
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
  if (!assignment.questionSnapshot) throw requestError("Assigned weekly question snapshot is unavailable.", 503);
  const question = { ...assignment.questionSnapshot };
  question.id = String(assignment.challengeId);
  delete question.hiddenTestCases;
  delete question.testCases;
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
      status: submission.status,
      resultStatus: submission.resultStatus,
      score: submission.score,
      passed: submission.passed,
      total: submission.total,
      executionTime: submission.executionTime,
      finalizedAt: submission.finalizedAt,
    } : null,
  };
}

function sourceHash(code) {
  return createHash("sha256").update(code, "utf8").digest("hex");
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
  if (submission.status === "JUDGING" && now - submission.judgeLeaseAt < RETRY_LEASE_MS) {
    throw requestError("This submission is already being judged.", 409);
  }
  const claimed = await WeeklySubmission.findOneAndUpdate(
    {
      _id: submission._id,
      status: { $in: ["RETRYABLE", "JUDGING"] },
      $or: [
        { status: "RETRYABLE" },
        { judgeLeaseAt: { $lte: new Date(now.getTime() - RETRY_LEASE_MS) } },
      ],
    },
    { $set: { status: "JUDGING", judgeLeaseAt: now } },
    { new: true },
  ).select("+sourceHash");
  if (!claimed) throw requestError("Submission retry lease could not be acquired.", 409);
  return claimed;
}

async function judgeWeeklySubmission({ submission, roster, assignment, code }) {
  const challenge = assignment?.questionSnapshot;
  if (!challenge) throw requestError("The assigned daily question is unavailable.", 503);
  const { visible, hidden } = getChallengeTestCaseGroups(challenge);
  const cases = [...visible, ...hidden];
  if (!cases.length || cases.length > 50) {
    await WeeklySubmission.updateOne(
      {
        _id: submission._id,
        status: "JUDGING",
        judgeLeaseAt: submission.judgeLeaseAt,
      },
      { $set: { status: "RETRYABLE" } },
    );
    const error = requestError("Assigned question has an invalid test-case configuration.", 503);
    error.submissionId = String(submission._id);
    throw error;
  }

  let result;
  try {
    const program = composeProgram(challenge, code, "java");
    result = await executionService.execute(program, cases, "java", {
      timeLimit: 2000,
      memoryLimit: 65536,
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
        status: "JUDGING",
        judgeLeaseAt: submission.judgeLeaseAt,
      },
      { $set: { status: "RETRYABLE", resultStatus: result.status } },
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
  const finalized = await WeeklySubmission.findOneAndUpdate(
    {
      _id: submission._id,
      status: "JUDGING",
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
      },
    },
    { new: true },
  );
  if (!finalized) {
    const error = requestError("This judge request lost its submission lease; use the saved-source recovery flow.", 409);
    error.submissionId = String(submission._id);
    throw error;
  }
  await synchronizeRosterScore(roster._id);
  return sanitizedResult(result, score);
}

async function synchronizeRosterScore(rosterEntryId) {
  const submissions = await WeeklySubmission.find({
    rosterEntryId,
    status: "FINALIZED",
  }).select("dayIndex score finalizedAt");
  const score = submissions.reduce((total, submission) => total + submission.score, 0);
  const completedDays = [...new Set(submissions.map((submission) => submission.dayIndex))].sort();
  const lastSubmittedAt = submissions.reduce(
    (latest, submission) => submission.finalizedAt > latest ? submission.finalizedAt : latest,
    new Date(0),
  );
  await WeeklyRosterEntry.updateOne(
    { _id: rosterEntryId, participationStatus: { $ne: "DISQUALIFIED" } },
    {
      $set: {
        score: Math.round(score * 100) / 100,
        completedDays,
        participationStatus: completedDays.length ? "PARTICIPATED" : "NOT_STARTED",
        lastSubmittedAt: completedDays.length ? lastSubmittedAt : null,
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
    .select("+sourceHash");
  if (submission) {
    if (submission.status === "FINALIZED") {
      const error = new Error("Only one finalized submission is allowed per assessment day.");
      error.statusCode = 409;
      throw error;
    }
    if (submission.sourceHash !== hash) {
      throw requestError("Retry must use the identical source submitted for this assessment day.", 409);
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
        status: "JUDGING",
        judgeLeaseAt: now,
      });
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = new Error("A submission already exists for this assessment day.");
        duplicate.statusCode = 409;
        throw duplicate;
      }
      throw error;
    }
  }

  return judgeWeeklySubmission({ submission, roster, assignment, code });
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
  }).select("+sourceHash");
  if (!submission) throw requestError("Recoverable weekly submission not found.", 404);
  if (submission.status === "FINALIZED") {
    throw requestError("Finalized weekly submissions cannot be replayed.", 409);
  }
  if (submission.sourceHash !== sourceHash(code)) {
    throw requestError("Recovery must use the exact source bound to the original submission.", 409);
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
  return judgeWeeklySubmission({ submission: claimed, roster, assignment, code });
}

export async function listRecoverableWeeklySubmissions(candidateId, now = new Date()) {
  const cycles = await WeeklyCycle.find({
    startAt: { $lte: now },
    status: "ACTIVE",
    $or: [
      { recoveryUntilAt: { $gt: now } },
      { recoveryUntilAt: null, endAt: { $gt: now } },
    ],
  }).select("questionAssignments endAt recoveryUntilAt");
  if (!cycles.length) return [];
  const submissions = await WeeklySubmission.find({
    cycleId: { $in: cycles.map((cycle) => cycle._id) },
    candidateId,
    status: { $in: ["RETRYABLE", "JUDGING"] },
  }).select("cycleId dayIndex status judgeLeaseAt createdAt").sort({ cycleId: 1, dayIndex: 1 });
  const cycleById = new Map(cycles.map((cycle) => [String(cycle._id), cycle]));
  return submissions
    .filter((submission) =>
      submission.status === "RETRYABLE" ||
      now - submission.judgeLeaseAt >= RETRY_LEASE_MS,
    )
    .map((submission) => {
      const cycle = cycleById.get(String(submission.cycleId));
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
        createdAt: submission.createdAt,
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
  for (const ranking of rankings.individualRankings) {
    if (ranking.status === "MISSED" || ranking.status === "DISQUALIFIED") continue;
    const category = getWeeklyCertificateCategory(ranking.rank);
    await WeeklyCertificate.updateOne(
      { cycleId: cycle._id, userId: ranking.candidateId, type: "INDIVIDUAL" },
      {
        $setOnInsert: {
          certificateId: `DLY-${cycle.cycleKey.replaceAll("-", "")}-I-${randomUUID().toUpperCase()}`,
          cycleId: cycle._id,
          type: "INDIVIDUAL",
          category,
          userId: ranking.candidateId,
          snapshot: {
            subjectName: ranking.candidateNameSnapshot,
            organizationName: ranking.organizationNameSnapshot,
            assessmentName: cycle.name,
            cycleKey: cycle.cycleKey,
            score: ranking.score,
            rank: ranking.rank,
            issuedAt,
          },
        },
      },
      { upsert: true },
    );
    if (!rosterById.has(String(ranking.candidateId))) {
      throw new Error("Certificate ranking candidate is missing from the frozen roster.");
    }
  }

  for (const ranking of rankings.organizationRankings.slice(0, 3)) {
    if (ranking.participatingEligibleCandidates === 0) continue;
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
    status: "JUDGING",
    judgeLeaseAt: { $gt: new Date(now.getTime() - RETRY_LEASE_MS) },
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
      status: "JUDGING",
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
  if (cycle.status === "FINALIZED") {
    return {
      cycle: cycle.toObject(),
      individualRankings: cycle.individualRankings,
      organizationRankings: cycle.organizationRankings,
    };
  }

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
