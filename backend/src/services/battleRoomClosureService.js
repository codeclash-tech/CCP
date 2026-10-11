import BattleRoom from "../models/BattleRoom.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import { countRoomTestCases } from "./battleRoomScoring.js";
import { sendBattleRoomResultEmail } from "./emailService.js";
import { createBattleRoomCertificateUrl } from "./battleRoomCertificateService.js";

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
    status: "COMPLETED",
  })
    .populate("userId", "name email")
    .sort({ totalScore: -1, totalPassed: -1, submittedAt: 1, _id: 1 })
    .lean();
  const totalTestCases = countRoomTestCases(room.questions);
  let emailsSent = 0;
  let emailFailures = 0;
  let emailsSkipped = 0;

  for (const [index, submission] of submissions.entries()) {
    const user = submission.userId;
    const recipientEmail = submission.participantEmail || user?.email || "";
    if (!recipientEmail) {
      emailsSkipped += 1;
      await BattleRoomSubmission.updateOne(
        { _id: submission._id, roomId: room._id },
        {
          $set: {
            "resultDelivery.status": "SKIPPED",
            "resultDelivery.error": "No participant email is available.",
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
        userName: submission.participantName || user?.name || "Participant",
        roomTitle: room.title,
        totalScore: submission.totalScore,
        totalPassed: submission.totalPassed,
        totalTestCases,
        questionResults: submission.questionResults,
        rank: index + 1,
        totalParticipants: submissions.length,
        certificateUrl: createBattleRoomCertificateUrl({
          participantName:
            submission.participantName || user?.name || "Participant",
          roomTitle: room.title,
          roomCode: room.roomCode,
          rank: index + 1,
          totalParticipants: submissions.length,
          totalScore: submission.totalScore,
          completedAt: submission.submittedAt || room.endDate || new Date(),
        }),
        roomCode: room.roomCode,
        startTime: room.startTime || room.startDate,
        endTime: room.endTime || room.endDate,
        submissionStatus: submission.status,
        completedAt: submission.submittedAt || room.endDate || new Date(),
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
