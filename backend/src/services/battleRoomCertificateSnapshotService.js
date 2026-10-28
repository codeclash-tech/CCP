import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import {
  countRoomTestCases,
  isBattleRoomCertificateEligible,
  isBattleRoomRankedEligible,
} from "./battleRoomScoring.js";
import {
  RANKED_SUBMISSION_STATUSES,
  getRoomRank,
  sortRoomSubmissions,
} from "./battleRoomRanking.js";

export async function refreshBattleRoomCertificateSnapshots(room) {
  if (room.status !== "CLOSED") return 0;

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
      getRoomRank(rankedSubmissions, index),
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
