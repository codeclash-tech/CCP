import mongoose from "mongoose";
import Challenge from "../models/Challenge.js";
import OrganizationProfile from "../models/OrganizationProfile.js";
import User from "../models/User.js";
import WeeklyCertificate from "../models/WeeklyCertificate.js";
import WeeklyCycle from "../models/WeeklyCycle.js";
import WeeklyRosterEntry from "../models/WeeklyRosterEntry.js";
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
  saveGlobalChallengeConfiguration,
} from "../services/weeklyAssessmentService.js";
import { streamWeeklyCertificate } from "../services/weeklyCertificateService.js";

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
    const globalChallenge = await getGlobalChallengeConfiguration();
    return res.json({ globalChallenge });
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

export async function listAdminWeeklyCycles(req, res) {
  try {
    const cycles = await WeeklyCycle.find({})
      .sort({ startAt: -1 })
      .select("cycleKey name startAt endAt recoveryUntilAt status rosterFrozenAt finalizedAt questionAssignments")
      .lean();
    return res.json({ cycles });
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
    return res.json({ cycle, roster });
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
    await req.user.save();
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
    await req.user.save();
    return res.json({ organization: organization.toPublicJSON() });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "An organization with this name already exists." });
    return sendFailure(res, error, "Could not update the organization profile.");
  }
}

export async function listMyWeeklyCertificates(req, res) {
  try {
    const certificates = await WeeklyCertificate.find({ userId: req.userId })
      .sort({ "snapshot.issuedAt": -1 })
      .select("certificateId cycleId type category snapshot")
      .lean();
    return res.json({ certificates });
  } catch (error) {
    return sendFailure(res, error, "Could not load weekly certificates.");
  }
}

export async function listMyOrganizationCertificates(req, res) {
  try {
    const organization = await OrganizationProfile.findOne({ ownerUserId: req.userId }).select("_id");
    if (!organization) return res.json({ certificates: [] });
    const certificates = await WeeklyCertificate.find({
      organizationId: organization._id,
      type: "ORGANIZATION",
    }).sort({ "snapshot.issuedAt": -1 }).select("certificateId cycleId type category snapshot").lean();
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
    return streamWeeklyCertificate(certificate, res);
  } catch (error) {
    return sendFailure(res, error, "Could not generate the weekly certificate.");
  }
}
