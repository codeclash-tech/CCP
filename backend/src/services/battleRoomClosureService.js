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
import { dispatchBattleRoomCompletionEmail } from "./completionNotificationService.js";

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

async function saveRoomCertificateSnapshots(room) {
  const submissions = await BattleRoomSubmission.find({
    roomId: room._id,
    status: { $in: RANKED_SUBMISSION_STATUSES },
  }).lean();
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

  for (const submission of submissions) {
    if (submission.status !== "COMPLETED") continue;
    const certificateSnapshot = isBattleRoomCertificateEligible(
      submission,
      totalTestCases,
    )
      ? {
          roomCode: room.roomCode,
          roomTitle: room.title,
          rank: rankedById.get(String(submission._id)) || null,
          totalParticipants: rankedSubmissions.length,
          totalTestCases,
          completedAt: submission.submittedAt,
        }
      : null;
    await BattleRoomSubmission.updateOne(
      { _id: submission._id, roomId: room._id },
      { $set: { certificateSnapshot } },
    );
  }

  return submissions.length;
}

/**
 * Closes a room and preserves eligible certificate snapshots without emailing
 * participants. Completion emails are sent when each participant finishes.
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
  const totalParticipants = await saveRoomCertificateSnapshots(room);
  await BattleRoom.updateOne(
    { _id: room._id },
    { $set: { resultEmailsCompletedAt: new Date() } },
  );

  return {
    closed: true,
    emailsSent: 0,
    emailFailures: 0,
    emailsSkipped: 0,
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
    "completionEmail.eligible": true,
    "completionEmail.status": "FAILED",
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
