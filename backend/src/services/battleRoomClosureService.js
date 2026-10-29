import BattleRoom from "../models/BattleRoom.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import { refreshBattleRoomCertificateSnapshots } from "./battleRoomCertificateSnapshotService.js";
import { dispatchBattleRoomCompletionEmails } from "./completionNotificationService.js";

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

/**
 * Closes a room, finalizes participant rankings, and emails certificates.
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
  const totalParticipants = await refreshBattleRoomCertificateSnapshots(room);
  const delivery = await dispatchBattleRoomCompletionEmails(room._id);
  await BattleRoom.updateOne(
    { _id: room._id },
    { $set: { resultEmailsCompletedAt: new Date() } },
  );

  return {
    closed: true,
    emailsSent: delivery.emailsSent,
    emailFailures: delivery.emailFailures,
    emailsSkipped: Math.max(0, totalParticipants - delivery.totalParticipants),
    totalParticipants,
  };
}

export async function retryBattleRoomResultDelivery(roomId) {
  const room = await BattleRoom.findOne({ _id: roomId, status: "CLOSED" }).select("_id");
  if (!room) {
    return {
      retried: false,
      emailsSent: 0,
      emailFailures: 0,
      emailsSkipped: 0,
      totalParticipants: 0,
    };
  }

  const pending = await BattleRoomSubmission.find({
    roomId: room._id,
    status: "COMPLETED",
    "certificateEmail.eligible": true,
    "certificateEmail.status": "FAILED",
    "certificateSnapshot.completedAt": { $ne: null },
  })
    .select("_id")
    .limit(100)
    .lean();
  const results = await Promise.all(
    pending.map(({ _id }) =>
      dispatchBattleRoomCompletionEmail(_id, { force: true }),
    ),
  );
  return {
    retried: true,
    emailsSent: results.filter(Boolean).length,
    emailFailures: results.filter((success) => !success).length,
    emailsSkipped: 0,
    totalParticipants: pending.length,
  };
}
