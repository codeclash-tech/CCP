import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import User from "../models/User.js";
import WeeklyCertificate from "../models/WeeklyCertificate.js";
import WeeklyCycle from "../models/WeeklyCycle.js";
import WeeklySubmission from "../models/WeeklySubmission.js";
import { createCertificatePdfBuffer } from "./certificatePdfService.js";
import { sendChallengeCompletionEmail } from "./emailService.js";

const STALE_DELIVERY_MS = 10 * 60 * 1000;
const RETRY_DELIVERY_MS = 5 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 3;

async function dispatchCompletionEmail({
  Model,
  id,
  status = null,
  challengeType,
  emailPath = "completionEmail",
  eligibilityFilter = {},
  force = false,
  loadDetails,
}) {
  const eligiblePath = `${emailPath}.eligible`;
  const statusPath = `${emailPath}.status`;
  const attemptedAtPath = `${emailPath}.attemptedAt`;
  const attemptsPath = `${emailPath}.attempts`;
  const errorPath = `${emailPath}.error`;
  const sentAtPath = `${emailPath}.sentAt`;
  const statusFilter = status ? { status } : {};
  const eligible = await Model.updateOne(
    { _id: id, ...statusFilter, ...eligibilityFilter },
    { $set: { [eligiblePath]: true } },
  );
  if (!eligible.matchedCount) return false;

  const attemptedAt = new Date();
  const staleBefore = new Date(attemptedAt.getTime() - STALE_DELIVERY_MS);
  const retryBefore = new Date(attemptedAt.getTime() - RETRY_DELIVERY_MS);
  const claimed = await Model.findOneAndUpdate(
    {
      _id: id,
      ...statusFilter,
      [eligiblePath]: true,
      ...eligibilityFilter,
      $or: [
        { [statusPath]: { $in: ["PENDING", null] } },
        {
          [statusPath]: "FAILED",
          ...(force
            ? {}
            : { [attemptsPath]: { $lt: MAX_DELIVERY_ATTEMPTS } }),
          [attemptedAtPath]: { $lte: retryBefore },
        },
        {
          [statusPath]: "SENDING",
          [attemptedAtPath]: { $lte: staleBefore },
        },
      ],
    },
    {
      $set: {
        [statusPath]: "SENDING",
        [attemptedAtPath]: attemptedAt,
        [errorPath]: "",
      },
      $inc: { [attemptsPath]: 1 },
    },
    { new: true },
  ).lean();
  if (!claimed) return false;

  let delivery;
  try {
    delivery = await loadDetails(claimed);
    if (!delivery) {
      throw new Error("The completed challenge details are unavailable.");
    }
    delivery = await sendChallengeCompletionEmail({
      ...delivery,
      challengeType,
    });
  } catch (error) {
    delivery = { success: false, error: error.message || String(error) };
  }

  const update = delivery.success
    ? {
        [statusPath]: "SENT",
        [sentAtPath]: new Date(),
        [errorPath]: "",
      }
    : {
        [statusPath]: "FAILED",
        [errorPath]: String(delivery.error || "Email delivery failed.").slice(0, 500),
      };
  await Model.updateOne(
    {
      _id: id,
      ...statusFilter,
      [statusPath]: "SENDING",
      [attemptedAtPath]: attemptedAt,
    },
    { $set: update },
  );

  if (!delivery.success) {
    console.error("[CompletionEmail] Delivery failed.", {
      challengeType,
      submissionId: String(id),
      error: delivery.error,
    });
  }
  return Boolean(delivery.success);
}

export function dispatchWeeklyCompletionEmail(submissionId) {
  return dispatchCompletionEmail({
    Model: WeeklySubmission,
    id: submissionId,
    status: "FINALIZED",
    emailPath: "certificateEmail",
    challengeType: "DAILY_CHALLENGE",
    loadDetails: async (submission) => {
      const [candidate, cycle, certificate] = await Promise.all([
        User.findById(submission.candidateId).select("name email").lean(),
        WeeklyCycle.findById(submission.cycleId).select("name").lean(),
        WeeklyCertificate.findOne({
          cycleId: submission.cycleId,
          userId: submission.candidateId,
          type: "INDIVIDUAL",
        }).select("certificateId snapshot").lean(),
      ]);
      if (!candidate?.email || !certificate?.snapshot) return null;
      const certificatePdf = await createCertificatePdfBuffer({
        challengeType: "DAILY_CHALLENGE",
        participantName: certificate.snapshot.subjectName,
        challengeName: certificate.snapshot.assessmentName || cycle?.name || "Daily Challenge",
        score: certificate.snapshot.score,
        completedAt: certificate.snapshot.issuedAt,
      });
      return {
        email: candidate.email,
        userName: certificate.snapshot.subjectName || candidate.name,
        challengeName: cycle?.name || "Daily Challenge",
        certificateFilename: `${certificate.certificateId}.pdf`,
        certificatePdf,
      };
    },
  });
}

export function dispatchWeeklyRankingCertificateEmail(certificateId, options = {}) {
  return dispatchCompletionEmail({
    Model: WeeklyCertificate,
    id: certificateId,
    emailPath: "rankingEmail",
    challengeType: "DAILY_CHALLENGE_RANK",
    force: options.force,
    eligibilityFilter: {
      type: "INDIVIDUAL",
      category: { $in: ["WINNER", "RUNNER_UP", "SECOND_RUNNER_UP"] },
    },
    loadDetails: async (certificate) => {
      const [candidate, cycle] = await Promise.all([
        User.findById(certificate.userId).select("name email").lean(),
        WeeklyCycle.findById(certificate.cycleId)
          .select("name status individualRankings")
          .lean(),
      ]);
      if (!candidate?.email || cycle?.status !== "FINALIZED" || !certificate.snapshot?.rank) {
        return null;
      }
      const totalParticipants = cycle.individualRankings.filter(
        (ranking) => ranking.status === "PARTICIPATED",
      ).length;
      const certificatePdf = await createCertificatePdfBuffer({
        challengeType: "DAILY_CHALLENGE",
        participantName: certificate.snapshot.subjectName,
        challengeName: certificate.snapshot.assessmentName || cycle.name,
        score: certificate.snapshot.score,
        rank: certificate.snapshot.rank,
        totalParticipants,
        completedAt: certificate.snapshot.issuedAt,
      });
      return {
        email: candidate.email,
        userName: certificate.snapshot.subjectName || candidate.name,
        challengeName: cycle.name || "Daily Challenge",
        certificateFilename: `${certificate.certificateId}.pdf`,
        certificatePdf,
        certificateRank: certificate.snapshot.rank,
      };
    },
  });
}

export async function dispatchWeeklyRankingCertificates(cycleId) {
  const certificates = await WeeklyCertificate.find({
    cycleId,
    type: "INDIVIDUAL",
    "rankingEmail.eligible": true,
    category: { $in: ["WINNER", "RUNNER_UP", "SECOND_RUNNER_UP"] },
  }).select("_id").lean();
  return Promise.all(
    certificates.map(({ _id }) => dispatchWeeklyRankingCertificateEmail(_id)),
  );
}

export function dispatchBattleRoomCompletionEmail(submissionId, options = {}) {
  return dispatchCompletionEmail({
    Model: BattleRoomSubmission,
    id: submissionId,
    status: "COMPLETED",
    emailPath: "certificateEmail",
    challengeType: "BATTLE_ROOM",
    force: options.force,
    eligibilityFilter: {
      "certificateSnapshot.completedAt": { $ne: null },
    },
    loadDetails: async (submission) => {
      const candidate = await User.findById(submission.userId).select("name email").lean();
      const snapshot = submission.certificateSnapshot;
      if (!candidate?.email || !snapshot?.completedAt) return null;
      const certificatePdf = await createCertificatePdfBuffer({
        challengeType: "BATTLE_ROOM",
        participantName: submission.participantName || candidate.name,
        challengeName: snapshot.roomTitle,
        rank: snapshot.rank,
        totalParticipants: snapshot.totalParticipants,
        completedAt: snapshot.completedAt,
      });
      return {
        email: candidate.email,
        userName: submission.participantName || candidate.name,
        challengeName: snapshot.roomTitle,
        certificateFilename: `codeclash-${String(snapshot.roomCode)
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")}-certificate.pdf`,
        certificatePdf,
      };
    },
  });
}

export async function dispatchBattleRoomCompletionEmails(roomId) {
  const submissions = await BattleRoomSubmission.find({
    roomId,
    status: "COMPLETED",
    "certificateSnapshot.completedAt": { $ne: null },
  }).select("_id").lean();
  const results = await Promise.all(
    submissions.map(({ _id }) => dispatchBattleRoomCompletionEmail(_id)),
  );
  return {
    emailsSent: results.filter(Boolean).length,
    emailFailures: results.filter((success) => !success).length,
    totalParticipants: submissions.length,
  };
}

export async function retryPendingCompletionEmails() {
  const [weekly, battles] = await Promise.all([
    WeeklySubmission.find({
      status: "FINALIZED",
      "certificateEmail.eligible": true,
      "certificateEmail.status": { $in: ["PENDING", "FAILED", "SENDING"] },
    })
      .select("_id")
      .sort({ "certificateEmail.attemptedAt": 1 })
      .limit(100)
      .lean(),
    BattleRoomSubmission.find({
      status: "COMPLETED",
      "certificateEmail.eligible": true,
      "certificateEmail.status": { $in: ["PENDING", "FAILED", "SENDING"] },
      "certificateSnapshot.completedAt": { $ne: null },
    })
      .select("_id")
      .sort({ "certificateEmail.attemptedAt": 1 })
      .limit(100)
      .lean(),
  ]);

  await Promise.all([
    ...weekly.map(({ _id }) => dispatchWeeklyCompletionEmail(_id)),
    ...battles.map(({ _id }) => dispatchBattleRoomCompletionEmail(_id)),
  ]);

  const rankingCertificates = await WeeklyCertificate.find({
    "rankingEmail.eligible": true,
    "rankingEmail.status": { $in: ["PENDING", "FAILED", "SENDING"] },
    category: { $in: ["WINNER", "RUNNER_UP", "SECOND_RUNNER_UP"] },
  })
    .select("_id")
    .sort({ "rankingEmail.attemptedAt": 1 })
    .limit(100)
    .lean();
  await Promise.all(
    rankingCertificates.map(({ _id }) =>
      dispatchWeeklyRankingCertificateEmail(_id),
    ),
  );
}
