import BattleRoom from "../models/BattleRoom.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import {
  countRoomTestCases,
  isBattleRoomCertificateEligible,
  isBattleRoomRankedEligible,
} from "./battleRoomScoring.js";
import {
  RANKED_SUBMISSION_STATUSES,
  sortRoomSubmissions,
} from "./battleRoomRanking.js";
import { sendBattleRoomResultEmail } from "./emailService.js";

const STALE_DELIVERY_MS = 5 * 60 * 1000;

async function finalizePendingSubmissions(room) {
  const pendingSubmissions = await BattleRoomSubmission.find({
    roomId: room._id,
    status: "PENDING",
  }).lean();

  for (const submission of pendingSubmissions) {
    const submittedAt = new Date();
    const totalTime = Math.max(
      1,
      Math.floor((submittedAt - new Date(submission.startTime)) / 1000),
    );
    await BattleRoomSubmission.updateOne(
      { _id: submission._id, status: "PENDING" },
      {
        $set: {
          status: "COMPLETED",
          submittedAt,
          "codingBehavior.timePerQuestion":
            submission.totalQuestions > 0
              ? totalTime / submission.totalQuestions
              : 0,
          "codingBehavior.editFrequency":
            (submission.codingBehavior?.totalEdits || 0) > 0
              ? (submission.codingBehavior.totalEdits || 0) /
                (totalTime / 60)
              : 0,
          "codingBehavior.completedEarly": false,
        },
      },
    );
  }
}

async function deliverRoomResults(room) {
  const submissions = await BattleRoomSubmission.find({
    roomId: room._id,
    status: { $in: RANKED_SUBMISSION_STATUSES },
  })
    .populate("userId", "name email")
    .lean();
  sortRoomSubmissions(submissions);
  const totalTestCases = countRoomTestCases(room.questions);
  const rankedSubmissions = submissions.filter((submission) =>
    isBattleRoomRankedEligible(submission, totalTestCases),
  );
  sortRoomSubmissions(rankedSubmissions);
  const rankedById = new Map(
    rankedSubmissions.map((submission, index) => [
      String(submission._id),
      index + 1,
    ]),
  );
  let emailsSent = 0;
  let emailFailures = 0;
  let emailsSkipped = 0;

  for (const [index, submission] of submissions.entries()) {
    if (submission.status !== "COMPLETED") continue;
    const user = submission.userId;
    const recipientEmail = submission.participantEmail || user?.email;
    const participantName =
      submission.participantName &&
      submission.participantName !== "Participant"
        ? submission.participantName
        : user?.name;
    const rankedPosition = rankedById.get(String(submission._id));
    if (isBattleRoomCertificateEligible(submission, totalTestCases)) {
      const certificateSnapshot = {
        roomCode: room.roomCode,
        roomTitle: room.title,
        rank: rankedPosition || null,
        totalParticipants: rankedSubmissions.length,
        totalTestCases,
        completedAt: submission.submittedAt,
      };
      await BattleRoomSubmission.updateOne(
        { _id: submission._id, roomId: room._id },
        { $set: { certificateSnapshot } },
      );
    }

    if (!recipientEmail || !participantName) {
      emailsSkipped += 1;
      await BattleRoomSubmission.updateOne(
        { _id: submission._id, roomId: room._id },
        {
          $set: {
            "resultDelivery.status": "SKIPPED",
            "resultDelivery.error": !recipientEmail
              ? "No participant email is available."
              : "No participant name is available.",
          },
        },
      );
      continue;
    }

    const attemptedAt = new Date();
    const staleBefore = new Date(attemptedAt.getTime() - STALE_DELIVERY_MS);
    const claimed = await BattleRoomSubmission.findOneAndUpdate(
      {
        _id: submission._id,
        roomId: room._id,
        status: "COMPLETED",
        $or: [
          { "resultDelivery.status": { $in: ["PENDING", "FAILED"] } },
          { "resultDelivery.status": { $exists: false } },
          {
            "resultDelivery.status": "SENDING",
            "resultDelivery.attemptedAt": { $lt: staleBefore },
          },
        ],
      },
      {
        $set: {
          "resultDelivery.status": "SENDING",
          "resultDelivery.attemptedAt": attemptedAt,
          "resultDelivery.error": "",
        },
        $inc: { "resultDelivery.attempts": 1 },
      },
      { new: true },
    ).lean();
    if (!claimed) continue;

    let delivery;
    try {
      delivery = await sendBattleRoomResultEmail({
        email: recipientEmail,
        userName: participantName,
        roomTitle: room.title,
        totalScore: submission.totalScore,
        totalPassed: submission.totalPassed,
        totalTestCases,
        rank: rankedPosition || Math.max(1, index + 1),
        totalParticipants: Math.max(1, rankedSubmissions.length),
        roomCode: room.roomCode,
        startTime: room.startDate || room.startTime,
        endTime: room.endDate || room.endTime,
        timeZone: room.timezone || "UTC",
        submissionStatus: submission.status,
        completedAt: submission.submittedAt,
      });
    } catch (error) {
      delivery = { success: false, error: error.message };
    }

    if (delivery?.success) {
      emailsSent += 1;
      await BattleRoomSubmission.updateOne(
        {
          _id: submission._id,
          "resultDelivery.status": "SENDING",
          "resultDelivery.attemptedAt": attemptedAt,
        },
        {
          $set: {
            "resultDelivery.status": "SENT",
            "resultDelivery.sentAt": new Date(),
            "resultDelivery.error": "",
          },
        },
      );
    } else {
      emailFailures += 1;
      await BattleRoomSubmission.updateOne(
        {
          _id: submission._id,
          "resultDelivery.status": "SENDING",
          "resultDelivery.attemptedAt": attemptedAt,
        },
        {
          $set: {
            "resultDelivery.status": "FAILED",
            "resultDelivery.error": String(
              delivery?.error || "Email delivery failed.",
            ).slice(0, 500),
          },
        },
      );
    }
  }

  await BattleRoom.updateOne(
    { _id: room._id },
    { $set: { resultEmailsCompletedAt: new Date() } },
  );
  return {
    emailsSent,
    emailFailures,
    emailsSkipped,
    totalParticipants: submissions.length,
  };
}

/**
 * Atomically close a room before finalizing submissions and attempting
 * per-participant result/certificate email delivery.
 */
export async function closeBattleRoomAndNotify(roomId) {
  const attemptedAt = new Date();
  const room = await BattleRoom.findOneAndUpdate(
    {
      _id: roomId,
      status: { $in: ["ACTIVE", "UPCOMING"] },
      resultEmailsAttemptedAt: null,
    },
    {
      $set: {
        status: "CLOSED",
        resultEmailsAttemptedAt: attemptedAt,
        closedAt: attemptedAt,
      },
    },
    { new: true },
  );

  if (!room) {
    return {
      closed: false,
      emailsSent: 0,
      emailFailures: 0,
      emailsSkipped: 0,
      totalParticipants: 0,
    };
  }

  await finalizePendingSubmissions(room);
  const delivery = await deliverRoomResults(room);
  return { closed: true, ...delivery };
}

export async function retryBattleRoomResultDelivery(roomId) {
  const room = await BattleRoom.findOne({ _id: roomId, status: "CLOSED" });
  if (!room) {
    return {
      retried: false,
      emailsSent: 0,
      emailFailures: 0,
      emailsSkipped: 0,
      totalParticipants: 0,
    };
  }
  await finalizePendingSubmissions(room);
  const delivery = await deliverRoomResults(room);
  return { retried: true, ...delivery };
}
