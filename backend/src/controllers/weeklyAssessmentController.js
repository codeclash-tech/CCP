import mongoose from "mongoose";
import Challenge from "../models/Challenge.js";
import OrganizationProfile from "../models/OrganizationProfile.js";
import User from "../models/User.js";
import WeeklyCertificate from "../models/WeeklyCertificate.js";
import WeeklyCycle from "../models/WeeklyCycle.js";
import WeeklyRosterEntry from "../models/WeeklyRosterEntry.js";
import WeeklySubmission from "../models/WeeklySubmission.js";
import AssessmentIntegritySession from "../models/AssessmentIntegritySession.js";
import { getAssessmentRole } from "../models/User.js";
import {
  assignCandidateOrganization,
  createQuestionAssignment,
  createOrganizationProfile,
  createWeeklyCycle,
  disqualifyWeeklyCandidate,
  finalizeWeeklyCycle,
  getCandidateWeeklyState,
  getGlobalChallengeConfiguration,
  getWeeklyCycleResults,
  listRecoverableWeeklySubmissions,
  removeCandidateOrganization,
  retryWeeklyAnswer,
  submitWeeklyAnswer,
  ensureCurrentGlobalCycle,
  createWeeklyLocalExecutionGrant,
  finalizeWeeklyLocalExecution,
  saveGlobalChallengeConfiguration,
  publishGlobalChallengeConfiguration,
} from "../services/weeklyAssessmentService.js";
import { streamWeeklyCertificate } from "../services/weeklyCertificateService.js";
import { calculateIntegrityRisk } from "../services/assessmentIntegrityService.js";
import {
  isWeeklyParticipationEligible,
  isWeeklyRankedEligible,
} from "../utils/weeklyAssessment.js";

function sendFailure(res, error, fallback = "Weekly assessment request failed.", additional = {}) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) console.error("[WeeklyAssessment]", error?.message || fallback);
  return res.status(status).json({
    error: status >= 500 ? fallback : error.message,
    ...additional,
  });
}

function validId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function updateActiveOrganizationRoster(organization, candidateId) {
  const activeCycles = await WeeklyCycle.find({ status: "ACTIVE" })
    .select("_id")
    .lean();
  if (!activeCycles.length) return;

  const rosterFilter = {
    cycleId: { $in: activeCycles.map((cycle) => cycle._id) },
    $or: [
      { organizationId: organization._id },
      ...(candidateId ? [{ candidateId }] : []),
    ],
  };
  await WeeklyRosterEntry.updateMany(rosterFilter, {
    $set: {
      organizationId: organization._id,
      organizationNameSnapshot: organization.name,
    },
  });
}

export async function getCurrentWeeklyAssessment(req, res) {
  try {
    const state = await getCandidateWeeklyState(req.userId);
    if (!state) {
      return res.json({
        assessment: null,
        message: "No daily challenge is available right now.",
      });
    }
    return res.json(state);
  } catch (error) {
    return sendFailure(res, error, "Could not load the active daily challenge.");
  }
}

export async function submitCurrentWeeklyAnswer(req, res) {
  try {
    const result = await submitWeeklyAnswer({
      candidateId: req.userId,
      code: req.body?.code,
    });
    return res.status(202).json({ submission: result });
  } catch (error) {
    return sendFailure(res, error, "Authoritative daily challenge judging failed.", {
      ...(error.submissionId ? { submissionId: error.submissionId } : {}),
    });
  }
}

export async function createDesktopWeeklyExecutionGrant(req, res) {
  try {
    const grant = await createWeeklyLocalExecutionGrant({
      candidateId: req.userId,
      ...req.body,
    });
    return res.status(200).json(grant);
  } catch (error) {
    if (Number(error?.statusCode) >= 500 || !error?.statusCode) {
      console.error("[DailyLocalSubmission] Grant authorization failed.", {
        requestId: req.requestId || null,
        error: error?.stack || error?.message || String(error),
      });
    }
    return sendFailure(
      res,
      error,
      "Could not authorize local Daily Challenge execution.",
      { ...(req.requestId ? { requestId: req.requestId } : {}) },
    );
  }
}

export async function finalizeDesktopWeeklyExecution(req, res) {
  try {
    const submission = await finalizeWeeklyLocalExecution({
      candidateId: req.userId,
      transcript: req.body?.transcript,
      transcriptHash: req.body?.transcriptHash,
    });
    try {
      await AssessmentIntegritySession.updateMany(
        {
          assessmentType: "DAILY_CHALLENGE",
          assessmentId: req.body?.transcript?.assessmentId,
          userId: req.userId,
          finalizedAt: null,
        },
        { $set: { finalizedAt: new Date() } },
      );
    } catch (error) {
      console.error(
        "[AssessmentIntegrity] Could not finalize Daily Challenge event sessions:",
        { message: error.message, submissionId: submission.submissionId },
      );
    }
    return res.status(201).json({ submission });
  } catch (error) {
    return sendFailure(res, error, "Could not finalize local Daily Challenge execution.");
  }
}

export async function retryWeeklyAnswerHandler(req, res) {
  try {
    const result = await retryWeeklyAnswer({
      candidateId: req.userId,
      submissionId: req.params.submissionId,
      code: req.body?.code,
    });
    return res.status(202).json({ submission: result });
  } catch (error) {
    return sendFailure(res, error, "Authoritative daily challenge retry failed.", {
      ...(error.submissionId ? { submissionId: error.submissionId } : {}),
    });
  }
}

export async function listRecoverableWeeklySubmissionsHandler(req, res) {
  try {
    const submissions = await listRecoverableWeeklySubmissions(req.userId);
    return res.json({ submissions });
  } catch (error) {
    return sendFailure(res, error, "Could not load recoverable weekly submissions.");
  }
}

export async function listMyWeeklyHistory(req, res) {
  try {
    const rosterEntries = await WeeklyRosterEntry.find({ candidateId: req.userId })
      .sort({ createdAt: -1 })
      .lean();
    const cycleIds = rosterEntries.map((entry) => entry.cycleId);
    const cycles = await WeeklyCycle.find({ _id: { $in: cycleIds } })
      .select("cycleKey name startAt endAt status finalizedAt individualRankings organizationRankings")
      .lean();
    const cycleById = new Map(cycles.map((cycle) => [String(cycle._id), cycle]));
    const history = rosterEntries.map((entry) => {
      const cycle = cycleById.get(String(entry.cycleId));
      const ranking = cycle?.individualRankings?.find(
        (item) => String(item.candidateId) === String(req.userId),
      );
      return {
        cycle: cycle ? {
          id: cycle._id,
          cycleKey: cycle.cycleKey,
          name: cycle.name,
          startAt: cycle.startAt,
          endAt: cycle.endAt,
          status: cycle.status,
          finalizedAt: cycle.finalizedAt,
        } : null,
        organizationName: entry.organizationNameSnapshot,
        score: ranking?.score ?? entry.score,
        rank: ranking?.rank ?? null,
        completedQuestions: ranking?.completedQuestions ?? entry.completedDays.length,
        status: ranking?.status ?? entry.participationStatus,
      };
    });
    return res.json({ history });
  } catch (error) {
    return sendFailure(res, error, "Could not load weekly assessment history.");
  }
}

export async function listOrganizationWeeklyHistory(req, res) {
  try {
    const organization = await OrganizationProfile.findOne({ ownerUserId: req.userId }).select("_id name");
    if (!organization) return res.json({ history: [] });
    const roster = await WeeklyRosterEntry.find({ organizationId: organization._id })
      .sort({ createdAt: -1 })
      .select("cycleId organizationNameSnapshot score completedDays participationStatus")
      .lean();
    const cycles = await WeeklyCycle.find({ _id: { $in: roster.map((entry) => entry.cycleId) } })
      .select("cycleKey name startAt endAt status finalizedAt organizationRankings")
      .lean();
    const cycleById = new Map(cycles.map((cycle) => [String(cycle._id), cycle]));
    const historyByCycle = new Map();
    for (const entry of roster) {
      const cycle = cycleById.get(String(entry.cycleId));
      if (!cycle || historyByCycle.has(String(cycle._id))) continue;
      const results = await getWeeklyCycleResults(cycle._id);
      const ranking = results.organizationRankings.find(
        (item) => String(item.organizationId) === String(organization._id),
      );
      historyByCycle.set(String(cycle._id), {
        cycle: {
          id: cycle._id,
          cycleKey: cycle.cycleKey,
          name: cycle.name,
          startAt: cycle.startAt,
          endAt: cycle.endAt,
          status: cycle.status,
          finalizedAt: cycle.finalizedAt,
        },
        organizationId: organization._id,
        organizationName: ranking?.organizationNameSnapshot || entry.organizationNameSnapshot,
        score: ranking?.finalScore ?? null,
        organizationMean: ranking?.organizationMean ?? null,
        rank: ranking?.rank ?? null,
        eligibleCandidates: ranking?.eligibleCandidates ?? null,
        completedEligibleCandidates: ranking?.completedEligibleCandidates ?? null,
        completionRate: ranking?.completionRate ?? null,
      });
    }
    return res.json({ history: [...historyByCycle.values()] });
  } catch (error) {
    return sendFailure(res, error, "Could not load organization weekly history.");
  }
}

export async function getWeeklyRankings(req, res) {
  try {
    if (!validId(req.params.cycleId)) return res.status(400).json({ error: "Invalid weekly cycle ID." });
    const cycle = await WeeklyCycle.findById(req.params.cycleId);
    if (!cycle) return res.status(404).json({ error: "Weekly cycle not found." });
    if (getAssessmentRole(req.user) === "CANDIDATE") {
      const rosterEntry = await WeeklyRosterEntry.findOne({
        cycleId: cycle._id,
        candidateId: req.userId,
      }).select("_id");
      if (!rosterEntry) return res.status(403).json({ error: "Weekly results are available only to eligible roster candidates." });
    }
    const results = await getWeeklyCycleResults(cycle._id);
    const individualRankings = results.individualRankings.map((ranking) => ({
      ...ranking,
      candidateNameSnapshot:
        ranking.completedQuestions > 0 ? ranking.candidateNameSnapshot : null,
    }));
    return res.json({
      cycle: {
        id: cycle._id,
        cycleKey: cycle.cycleKey,
        name: cycle.name,
        startAt: cycle.startAt,
        endAt: cycle.endAt,
        status: cycle.status,
        finalizedAt: cycle.finalizedAt,
      },
      individualRankings,
      organizationRankings: results.organizationRankings,
    });
  } catch (error) {
    return sendFailure(res, error, "Could not load weekly rankings.");
  }
}

export async function createWeeklyCycleHandler(req, res) {
  try {
    const cycle = await createWeeklyCycle({
      cycleKey: req.body?.cycleKey,
      name: req.body?.name,
      questionIds: req.body?.questionIds,
    });
    return res.status(201).json({
      cycle: {
        id: cycle._id,
        cycleKey: cycle.cycleKey,
        name: cycle.name,
        startAt: cycle.startAt,
        endAt: cycle.endAt,
        status: cycle.status,
        questionAssignments: cycle.questionAssignments,
      },
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "A daily challenge already exists for that date." });
    return sendFailure(res, error, "Could not schedule the daily challenge.");
  }
}

export async function getAdminGlobalChallenge(req, res) {
  try {
    const currentCycle = await ensureCurrentGlobalCycle();
    const globalChallenge = await getGlobalChallengeConfiguration();
    return res.json({ globalChallenge, currentCycle });
  } catch (error) {
    return sendFailure(res, error, "Could not load the global challenge.");
  }
}

export async function saveAdminGlobalChallenge(req, res) {
  try {
    const globalChallenge = await saveGlobalChallengeConfiguration({
      name: req.body?.name,
      startAt: req.body?.startAt,
      questionIds: req.body?.questionIds,
    });
    return res.json({ globalChallenge });
  } catch (error) {
    return sendFailure(res, error, "Could not save the global challenge.");
  }
}

export async function publishAdminGlobalChallenge(req, res) {
  try {
    const globalChallenge = await publishGlobalChallengeConfiguration();
    return res.json({ globalChallenge });
  } catch (error) {
    return sendFailure(res, error, "Could not publish the global challenge.");
  }
}

export async function listAdminWeeklyCycles(req, res) {
  try {
    const cycles = await WeeklyCycle.find({
      $or: [
        { isGlobalChallenge: true },
        {
          isGlobalChallenge: { $exists: false },
          name: {
            $regex: "^(?:.+ · \\d{4}-\\d{2}-\\d{2}|Global Challenge \\d{4}-\\d{2}-\\d{2})$",
          },
        },
      ],
    })
      .sort({ startAt: -1 })
      .select("cycleKey name startAt endAt recoveryUntilAt status rosterFrozenAt finalizedAt isGlobalChallenge questionAssignments")
      .lean();
    return res.json({
      cycles: cycles.map((cycle) => ({ ...cycle, isGlobalChallenge: true })),
    });
  } catch (error) {
    return sendFailure(res, error, "Could not load weekly cycles.");
  }
}

export async function updateWeeklyQuestions(req, res) {
  try {
    if (!validId(req.params.cycleId)) return res.status(400).json({ error: "Invalid weekly cycle ID." });
    const cycle = await WeeklyCycle.findById(req.params.cycleId);
    if (!cycle) return res.status(404).json({ error: "Weekly cycle not found." });
    if (cycle.status !== "SCHEDULED" || cycle.startAt <= new Date()) {
      return res.status(409).json({ error: "Question assignments can be changed only before the cycle begins." });
    }
    const questionIds = req.body?.questionIds;
    if (!Array.isArray(questionIds) || questionIds.length !== 1 ||
      new Set(questionIds.map(String)).size !== 1) {
      return res.status(400).json({ error: "Select exactly one saved question for the daily challenge." });
    }
    const questions = await Challenge.find({ _id: { $in: questionIds }, isActive: true });
    const questionById = new Map(questions.map((question) => [String(question._id), question]));
    if (questionById.size !== 1) return res.status(400).json({ error: "The selected question must be an active saved challenge." });
    cycle.questionAssignments = [
      createQuestionAssignment(questionById.get(String(questionIds[0])), 0),
    ];
    await cycle.save();
    return res.json({ questionAssignments: cycle.questionAssignments });
  } catch (error) {
    return sendFailure(res, error, "Could not update weekly question assignments.");
  }
}

export async function getAdminWeeklyRoster(req, res) {
  try {
    if (!validId(req.params.cycleId)) return res.status(400).json({ error: "Invalid weekly cycle ID." });
    const cycle = await WeeklyCycle.findById(req.params.cycleId)
      .select("cycleKey name status startAt endAt rosterFrozenAt");
    if (!cycle) return res.status(404).json({ error: "Weekly cycle not found." });
    const roster = await WeeklyRosterEntry.find({ cycleId: cycle._id })
      .sort({ organizationNameSnapshot: 1, candidateNameSnapshot: 1 })
      .select("candidateId candidateNameSnapshot organizationId organizationNameSnapshot eligibilityStatus participationStatus score completedDays disqualifiedAt disqualificationReason")
      .lean();
    const submissions = await WeeklySubmission.find({ cycleId: cycle._id })
      .select(
        "candidateId rosterEntryId dayIndex challengeId status resultStatus score passed total executionMode executionId sourceHash transcriptHash clientVersion engineVersion executionProtocolVersion riskSignals riskScore riskLevel finalizedAt +sourceHash +executionTranscript",
      )
      .lean();
    const integritySessions = await AssessmentIntegritySession.find({
      assessmentType: "DAILY_CHALLENGE",
      assessmentId: cycle._id,
    }).lean();
    const submissionByRoster = new Map(
      submissions.map((submission) => [
        String(submission.rosterEntryId),
        submission,
      ]),
    );
    const sourceHashGroups = new Map();
    for (const submission of submissions) {
      if (
        submission.status !== "FINALIZED" ||
        submission.executionMode !== "DESKTOP_LOCAL" ||
        !submission.sourceHash
      ) {
        continue;
      }
      const key = `${submission.challengeId}:${submission.sourceHash}`;
      const matching = sourceHashGroups.get(key) || [];
      matching.push(submission);
      sourceHashGroups.set(key, matching);
    }
    const rosterNameByCandidate = new Map(
      roster.map((entry) => [
        String(entry.candidateId),
        entry.candidateNameSnapshot,
      ]),
    );
    const sessionsByCandidate = new Map();
    for (const session of integritySessions) {
      const candidateKey = String(session.userId);
      const candidateSessions = sessionsByCandidate.get(candidateKey) || [];
      candidateSessions.push(session);
      sessionsByCandidate.set(candidateKey, candidateSessions);
    }
    const securityReport = (submission, candidateId) => {
      const transcript = submission?.executionTranscript;
      const sessions = sessionsByCandidate.get(String(candidateId)) || [];
      if (!submission && sessions.length === 0) return null;
      const exactSourceMatches =
        submission?.executionMode === "DESKTOP_LOCAL" && submission.sourceHash
          ? (sourceHashGroups.get(
              `${submission.challengeId}:${submission.sourceHash}`,
            ) || [])
              .filter((match) => String(match.candidateId) !== String(candidateId))
              .map((match) => ({
                submissionId: String(match._id),
                candidateId: String(match.candidateId),
                candidateName:
                  rosterNameByCandidate.get(String(match.candidateId)) ||
                  "Unknown participant",
              }))
          : [];
      const integrityRisk = calculateIntegrityRisk(
        sessions.flatMap((session) => session.events),
      );
      const riskScore = Math.min(
        100,
        (submission?.riskScore || 0) +
          integrityRisk.riskScore +
          (exactSourceMatches.length ? 40 : 0),
      );
      return {
        ...(submission
          ? {
              submissionId: String(submission._id),
              dayIndex: submission.dayIndex,
              status: submission.status,
              executionMode: submission.executionMode,
              resultStatus: submission.resultStatus,
              score: submission.score,
              passed: submission.passed,
              total: submission.total,
              executionId: submission.executionId,
              sourceHash: submission.sourceHash,
              transcriptHash: submission.transcriptHash,
              clientVersion: submission.clientVersion,
              engineVersion: submission.engineVersion,
              executionProtocolVersion: submission.executionProtocolVersion,
              riskSignals: submission.riskSignals,
              finalizedAt: submission.finalizedAt,
            }
          : {}),
        riskScore,
        riskLevel:
          riskScore >= 60 ? "HIGH" : riskScore >= 25 ? "MEDIUM" : "LOW",
        similarityWarnings: exactSourceMatches.length
          ? ["EXACT_SOURCE_HASH_MATCH"]
          : [],
        exactSourceMatches,
        timeline: transcript
          ? {
              startTime: transcript.startTime,
              endTime: transcript.endTime,
              durationMs: transcript.durationMs,
              testOutcomes: (transcript.results || []).map((result) => ({
                testCase: result.testCase,
                status: result.status,
                executionTimeMs: result.executionTimeMs,
                memoryUsedKb: result.memoryUsedKb,
              })),
            }
          : null,
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
        evidenceOnly: true,
      };
    };
    return res.json({
      cycle,
      roster: roster.map((entry) => ({
        ...entry,
        securityReport: securityReport(
          submissionByRoster.get(String(entry._id)),
          entry.candidateId,
        ),
      })),
    });
  } catch (error) {
    return sendFailure(res, error, "Could not load the weekly roster.");
  }
}

export async function disqualifyWeeklyCandidateHandler(req, res) {
  try {
    if (!validId(req.params.cycleId) || !validId(req.params.candidateId)) {
      return res.status(400).json({ error: "Invalid weekly cycle or candidate ID." });
    }
    const rosterEntry = await disqualifyWeeklyCandidate({
      cycleId: req.params.cycleId,
      candidateId: req.params.candidateId,
      reason: req.body?.reason,
    });
    return res.json({ rosterEntry });
  } catch (error) {
    return sendFailure(res, error, "Could not disqualify the weekly candidate.");
  }
}

export async function disqualifyCurrentWeeklyCandidateHandler(req, res) {
  try {
    if (!validId(req.params.cycleId) || !validId(req.userId)) {
      return res.status(400).json({ error: "Invalid weekly cycle or candidate ID." });
    }
    const rosterEntry = await disqualifyWeeklyCandidate({
      cycleId: req.params.cycleId,
      candidateId: req.userId,
      reason: req.body?.reason,
    });
    return res.json({ rosterEntry });
  } catch (error) {
    return sendFailure(res, error, "Could not record the proctoring violation.");
  }
}

export async function finalizeWeeklyCycleHandler(req, res) {
  try {
    if (!validId(req.params.cycleId)) return res.status(400).json({ error: "Invalid weekly cycle ID." });
    const cycle = await finalizeWeeklyCycle(req.params.cycleId);
    return res.json({
      cycle: {
        id: cycle._id,
        cycleKey: cycle.cycleKey,
        status: cycle.status,
        finalizedAt: cycle.finalizedAt,
      },
      individualCount: cycle.individualRankings.length,
      organizationCount: cycle.organizationRankings.length,
    });
  } catch (error) {
    return sendFailure(res, error, "Could not finalize the weekly cycle.");
  }
}

export async function listAdminOrganizations(req, res) {
  try {
    const organizations = await OrganizationProfile.find({}).sort({ name: 1 }).lean();
    return res.json({ organizations });
  } catch (error) {
    return sendFailure(res, error, "Could not load organizations.");
  }
}

export async function listAdminCandidates(req, res) {
  try {
    const [candidates, organizationUsers] = await Promise.all([
      User.find({
        role: "USER",
        creatorType: { $ne: "ORGANIZATION" },
      })
        .sort({ name: 1 })
        .limit(1000)
        .select("name email isVerified isActive organization organizationId")
        .lean(),
      User.find({
        role: "USER",
        creatorType: "ORGANIZATION",
        isVerified: true,
        isActive: true,
      })
        .sort({ name: 1 })
        .limit(1000)
        .select("name email")
        .lean(),
    ]);
    return res.json({ candidates, organizationUsers });
  } catch (error) {
    return sendFailure(res, error, "Could not load candidate accounts.");
  }
}

export async function updateAdminCandidateStatus(req, res) {
  try {
    if (!validId(req.params.candidateId) || typeof req.body?.isActive !== "boolean") {
      return res.status(400).json({ error: "A valid candidate ID and boolean isActive value are required." });
    }
    const candidate = await User.findOne({
      _id: req.params.candidateId,
      role: "USER",
      creatorType: { $ne: "ORGANIZATION" },
    });
    if (!candidate) return res.status(404).json({ error: "Candidate account not found." });
    candidate.isActive = req.body.isActive;
    await candidate.save();
    return res.json({
      candidate: {
        id: candidate._id,
        name: candidate.name,
        email: candidate.email,
        isActive: candidate.isActive,
        isVerified: candidate.isVerified,
        organizationId: candidate.organizationId,
      },
    });
  } catch (error) {
    return sendFailure(res, error, "Could not update candidate account status.");
  }
}

export async function updateAdminOrganizationStatus(req, res) {
  try {
    if (!validId(req.params.organizationId) || !["ACTIVE", "INACTIVE"].includes(req.body?.status)) {
      return res.status(400).json({ error: "A valid organization ID and ACTIVE/INACTIVE status are required." });
    }
    const organization = await OrganizationProfile.findById(req.params.organizationId);
    if (!organization) return res.status(404).json({ error: "Organization not found." });
    organization.status = req.body.status;
    await organization.save();
    return res.json({ organization: organization.toPublicJSON() });
  } catch (error) {
    return sendFailure(res, error, "Could not update organization status.");
  }
}

export async function listAdminWeeklyCertificates(req, res) {
  try {
    if (!validId(req.params.cycleId)) return res.status(400).json({ error: "Invalid weekly cycle ID." });
    const cycle = await WeeklyCycle.findById(req.params.cycleId).select("status");
    if (!cycle) return res.status(404).json({ error: "Weekly cycle not found." });
    if (cycle.status !== "FINALIZED") return res.status(409).json({ error: "Certificates are available only after cycle finalization." });
    const certificates = await WeeklyCertificate.find({ cycleId: cycle._id })
      .sort({ type: 1, "snapshot.rank": 1 })
      .select("certificateId type category userId organizationId snapshot")
      .lean();
    return res.json({ certificates });
  } catch (error) {
    return sendFailure(res, error, "Could not load weekly certificates.");
  }
}

export async function createAdminOrganization(req, res) {
  try {
    if (!validId(req.body?.ownerUserId)) return res.status(400).json({ error: "A valid organization owner user ID is required." });
    const organization = await createOrganizationProfile({
      name: req.body?.name,
      ownerUserId: req.body.ownerUserId,
    });
    return res.status(201).json({ organization: organization.toPublicJSON() });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Organization name or owner is already registered." });
    return sendFailure(res, error, "Could not create organization.");
  }
}

export async function assignCandidateOrganizationHandler(req, res) {
  try {
    if (!validId(req.params.candidateId) || !validId(req.body?.organizationId)) {
      return res.status(400).json({ error: "Valid candidate and organization IDs are required." });
    }
    const membership = await assignCandidateOrganization({
      userId: req.params.candidateId,
      organizationId: req.body.organizationId,
      assignedBy: req.userId,
    });
    return res.status(201).json({ membership });
  } catch (error) {
    return sendFailure(res, error, "Could not assign the candidate to the organization.");
  }
}

export async function removeCandidateOrganizationHandler(req, res) {
  try {
    if (!validId(req.params.candidateId)) return res.status(400).json({ error: "Valid candidate ID is required." });
    const membership = await removeCandidateOrganization({
      userId: req.params.candidateId,
    });
    if (!membership) return res.status(404).json({ error: "Active candidate organization assignment not found." });
    return res.json({ membership });
  } catch (error) {
    return sendFailure(res, error, "Could not remove the candidate organization assignment.");
  }
}

export async function getOrganizationProfile(req, res) {
  try {
    const organization = await OrganizationProfile.findOne({ ownerUserId: req.userId });
    return res.json({ organization: organization?.toPublicJSON() || null });
  } catch (error) {
    return sendFailure(res, error, "Could not load the organization profile.");
  }
}

export async function createOwnOrganizationProfile(req, res) {
  try {
    if (getAssessmentRole(req.user) !== "ORGANIZATION_USER") {
      return res.status(403).json({ error: "An organization account is required." });
    }
    const organization = await createOrganizationProfile({
      name: req.body?.name,
      ownerUserId: req.userId,
    });
    req.user.organization = organization.name;
    req.user.organizationId = organization._id;
    await req.user.save();
    await updateActiveOrganizationRoster(organization, req.userId);
    return res.status(201).json({ organization: organization.toPublicJSON() });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "An organization name or profile already exists." });
    return sendFailure(res, error, "Could not create the organization profile.");
  }
}

export async function updateOwnOrganizationProfile(req, res) {
  try {
    const organization = await OrganizationProfile.findOne({ ownerUserId: req.userId });
    if (!organization) return res.status(404).json({ error: "Organization profile not found." });
    const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120) return res.status(400).json({ error: "Organization name must be between 2 and 120 characters." });
    organization.name = name;
    organization.normalizedName = name.toLocaleLowerCase("en-US");
    await organization.save();
    req.user.organization = organization.name;
    req.user.organizationId = organization._id;
    await req.user.save();
    await updateActiveOrganizationRoster(organization, req.userId);
    return res.json({ organization: organization.toPublicJSON() });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "An organization with this name already exists." });
    return sendFailure(res, error, "Could not update the organization profile.");
  }
}

export async function listMyWeeklyCertificates(req, res) {
  try {
    const storedCertificates = await WeeklyCertificate.find({ userId: req.userId })
      .sort({ "snapshot.issuedAt": -1 })
      .select("certificateId cycleId type category snapshot")
      .lean();
    const certificates = await filterCurrentlyEligibleCertificates(storedCertificates);
    return res.json({ certificates });
  } catch (error) {
    return sendFailure(res, error, "Could not load weekly certificates.");
  }
}

export async function listMyOrganizationCertificates(req, res) {
  try {
    const organization = await OrganizationProfile.findOne({ ownerUserId: req.userId }).select("_id");
    if (!organization) return res.json({ certificates: [] });
    const storedCertificates = await WeeklyCertificate.find({
      organizationId: organization._id,
      type: "ORGANIZATION",
    }).sort({ "snapshot.issuedAt": -1 }).select("certificateId cycleId type category snapshot").lean();
    const certificates = await filterCurrentlyEligibleCertificates(storedCertificates);
    return res.json({ certificates });
  } catch (error) {
    return sendFailure(res, error, "Could not load organization certificates.");
  }
}

export async function downloadWeeklyCertificate(req, res) {
  try {
    const certificate = await WeeklyCertificate.findOne({
      certificateId: req.params.certificateId,
    }).lean();
    if (!certificate) return res.status(404).json({ error: "Weekly certificate not found." });
    const isIndividualOwner =
      certificate.type === "INDIVIDUAL" &&
      String(certificate.userId) === String(req.userId);
    let isOrganizationOwner = false;
    if (certificate.type === "ORGANIZATION") {
      isOrganizationOwner = Boolean(await OrganizationProfile.exists({
        _id: certificate.organizationId,
        ownerUserId: req.userId,
      }));
    }
    if (req.user.role !== "ADMIN" && !isIndividualOwner && !isOrganizationOwner) {
      return res.status(403).json({ error: "You are not authorized to download this certificate." });
    }
    const [eligibleCertificate] = await filterCurrentlyEligibleCertificates([certificate]);
    if (!eligibleCertificate) {
      return res.status(404).json({ error: "Weekly certificate not found." });
    }
    return streamWeeklyCertificate(certificate, res);
  } catch (error) {
    return sendFailure(res, error, "Could not generate the weekly certificate.");
  }
}

async function filterCurrentlyEligibleCertificates(certificates) {
  const eligible = [];
  for (const certificate of certificates) {
    if (certificate.type === "INDIVIDUAL") {
      const rosterEntry = await WeeklyRosterEntry.findOne({
        cycleId: certificate.cycleId,
        candidateId: certificate.userId,
      })
        .select(
          "participationStatus disqualifiedAt passedTestCases totalTestCases resultFinalizedAt",
        )
        .lean();
      if (!isWeeklyParticipationEligible(rosterEntry)) continue;
      if (
        certificate.category !== "PARTICIPATION" &&
        !isWeeklyRankedEligible(rosterEntry)
      ) {
        continue;
      }
      eligible.push(certificate);
      continue;
    }

    if (certificate.type === "ORGANIZATION") {
      const cycle = await WeeklyCycle.findById(certificate.cycleId)
        .select("organizationRankings")
        .lean();
      const ranking = cycle?.organizationRankings?.find(
        (entry) => String(entry.organizationId) === String(certificate.organizationId),
      );
      if (ranking?.eligibleCandidates > 0) eligible.push(certificate);
    }
  }
  return eligible;
}
