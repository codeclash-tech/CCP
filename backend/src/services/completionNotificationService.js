import BattleRoom from "../models/BattleRoom.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import User from "../models/User.js";
import WeeklyCycle from "../models/WeeklyCycle.js";
import WeeklySubmission from "../models/WeeklySubmission.js";
import { sendChallengeCompletionEmail } from "./emailService.js";

const STALE_DELIVERY_MS = 10 * 60 * 1000;
const RETRY_DELIVERY_MS = 5 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 3;

async function dispatchCompletionEmail({
  Model,
  id,
  status,
  challengeType,
  eligibilityFilter = {},
  force = false,
  loadDetails,
}) {
  const eligible = await Model.updateOne(
    { _id: id, status, ...eligibilityFilter },
    { $set: { "completionEmail.eligible": true } },
  );
  if (!eligible.matchedCount) return false;

  const attemptedAt = new Date();
  const staleBefore = new Date(attemptedAt.getTime() - STALE_DELIVERY_MS);
  const retryBefore = new Date(attemptedAt.getTime() - RETRY_DELIVERY_MS);
  const claimed = await Model.findOneAndUpdate(
    {
      _id: id,
      status,
      "completionEmail.eligible": true,
      ...eligibilityFilter,
      $or: [
        { "completionEmail.status": { $in: ["PENDING", null] } },
        {
          "completionEmail.status": "FAILED",
          ...(force
            ? {}
            : { "completionEmail.attempts": { $lt: MAX_DELIVERY_ATTEMPTS } }),
          "completionEmail.attemptedAt": { $lte: retryBefore },
        },
        {
          "completionEmail.status": "SENDING",
          "completionEmail.attemptedAt": { $lte: staleBefore },
        },
      ],
    },
    {
      $set: {
        "completionEmail.status": "SENDING",
        "completionEmail.attemptedAt": attemptedAt,
        "completionEmail.error": "",
      },
      $inc: { "completionEmail.attempts": 1 },
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
        "completionEmail.status": "SENT",
        "completionEmail.sentAt": new Date(),
        "completionEmail.error": "",
      }
    : {
        "completionEmail.status": "FAILED",
        "completionEmail.error": String(delivery.error || "Email delivery failed.").slice(0, 500),
      };
  await Model.updateOne(
    {
      _id: id,
      "completionEmail.status": "SENDING",
      "completionEmail.attemptedAt": attemptedAt,
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
    challengeType: "DAILY_CHALLENGE",
    loadDetails: async (submission) => {
      const [candidate, cycle] = await Promise.all([
        User.findById(submission.candidateId).select("name email").lean(),
        WeeklyCycle.findById(submission.cycleId).select("name").lean(),
      ]);
      return candidate?.email
        ? {
            email: candidate.email,
            userName: candidate.name,
            challengeName: cycle?.name || "Daily Challenge",
          }
        : null;
    },
  });
}

export function dispatchBattleRoomCompletionEmail(submissionId, options = {}) {
  return dispatchCompletionEmail({
    Model: BattleRoomSubmission,
    id: submissionId,
    status: "COMPLETED",
    challengeType: "BATTLE_ROOM",
    force: options.force,
    eligibilityFilter: {
      questionResults: { $elemMatch: { verificationStatus: "VERIFIED" } },
    },
    loadDetails: async (submission) => {
      const [candidate, room] = await Promise.all([
        User.findById(submission.userId).select("name email").lean(),
        BattleRoom.findById(submission.roomId).select("title").lean(),
      ]);
      return candidate?.email && room?.title
        ? {
            email: candidate.email,
            userName: candidate.name,
            challengeName: room.title,
          }
        : null;
    },
  });
}

export async function retryPendingCompletionEmails() {
  const [weekly, battles] = await Promise.all([
    WeeklySubmission.find({
      status: "FINALIZED",
      "completionEmail.eligible": true,
      "completionEmail.status": { $in: ["PENDING", "FAILED", "SENDING"] },
    })
      .select("_id")
      .sort({ "completionEmail.attemptedAt": 1 })
      .limit(100)
      .lean(),
    BattleRoomSubmission.find({
      status: "COMPLETED",
      "completionEmail.eligible": true,
      "completionEmail.status": { $in: ["PENDING", "FAILED", "SENDING"] },
    })
      .select("_id")
      .sort({ "completionEmail.attemptedAt": 1 })
      .limit(100)
      .lean(),
  ]);

  await Promise.all([
    ...weekly.map(({ _id }) => dispatchWeeklyCompletionEmail(_id)),
    ...battles.map(({ _id }) => dispatchBattleRoomCompletionEmail(_id)),
  ]);
}
