import {
  streamBattleRoomCertificate,
  streamBattleRoomCertificateData,
} from "../services/battleRoomCertificateService.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";

export function toParticipantCertificate(submission) {
  const snapshot = submission.certificateSnapshot;
  const submissionId = String(submission._id);
  const roomCode = String(snapshot.roomCode).toUpperCase();

  return {
    certificateId: `BR-${submissionId.toUpperCase()}`,
    roomCode,
    roomTitle: snapshot.roomTitle,
    rank: snapshot.rank,
    totalParticipants: snapshot.totalParticipants,
    totalScore: submission.totalScore,
    completedAt: snapshot.completedAt,
    downloadPath: `/battle-rooms/${encodeURIComponent(roomCode)}/certificate`,
  };
}

export async function listParticipantBattleRoomCertificates(req, res) {
  try {
    const submissions = await BattleRoomSubmission.find({
      userId: req.userId,
      status: "COMPLETED",
      "certificateSnapshot.roomCode": { $exists: true, $nin: ["", null] },
      "certificateSnapshot.completedAt": { $ne: null },
    })
      .select("_id certificateSnapshot totalScore")
      .sort({ "certificateSnapshot.completedAt": -1 })
      .lean();

    return res.json({
      certificates: submissions.map(toParticipantCertificate),
    });
  } catch (error) {
    console.error("[BattleRoomCertificate] Certificate library failed:", error.message);
    return res.status(500).json({ error: "Failed to load certificates." });
  }
}

export function downloadBattleRoomCertificate(req, res) {
  try {
    streamBattleRoomCertificate(req.params.token, res);
  } catch (error) {
    console.error("[BattleRoomCertificate] Download rejected:", error.message);
    return res.status(400).json({ error: "This certificate link is invalid or has expired." });
  }
}

export async function downloadParticipantBattleRoomCertificate(req, res) {
  try {
    const submission = await BattleRoomSubmission.findOne({
      userId: req.userId,
      "certificateSnapshot.roomCode": req.params.roomCode.toUpperCase(),
      status: "COMPLETED",
    }).lean();

    if (!submission?.certificateSnapshot) {
      return res.status(404).json({
        error: "Your certificate is not available for this battle.",
      });
    }

    streamBattleRoomCertificateData(
      {
        ...submission.certificateSnapshot,
        certificateId: `BR-${String(submission._id).toUpperCase()}`,
        participantName: submission.participantName || "Participant",
        totalScore: submission.totalScore,
      },
      res,
    );
  } catch (error) {
    console.error("[BattleRoomCertificate] Participant download failed:", error.message);
    return res.status(500).json({ error: "Failed to download certificate." });
  }
}
