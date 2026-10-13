import {
  streamBattleRoomCertificate,
  streamBattleRoomCertificateImage,
  streamBattleRoomCertificateData,
} from "../services/battleRoomCertificateService.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";

export function downloadBattleRoomCertificate(req, res) {
  try {
    streamBattleRoomCertificate(req.params.token, res);
  } catch (error) {
    console.error("[BattleRoomCertificate] Download rejected:", error.message);
    return res.status(400).json({ error: "This certificate link is invalid or has expired." });
  }
}

export async function viewBattleRoomCertificateImage(req, res) {
  try {
    await streamBattleRoomCertificateImage(req.params.token, res);
  } catch (error) {
    console.error("[BattleRoomCertificate] Image rejected:", error.message);
    const invalidToken = [
      "JsonWebTokenError",
      "TokenExpiredError",
      "NotBeforeError",
    ].includes(error.name);
    return res
      .status(invalidToken ? 400 : 500)
      .json({
        error: invalidToken
          ? "This certificate image is invalid or has expired."
          : "Failed to render the certificate image.",
      });
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
