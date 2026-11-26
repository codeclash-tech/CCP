import LearningCertificate from "../models/LearningCertificate.js";
import LearningModule from "../models/LearningModule.js";
import LearningProgram from "../models/LearningProgram.js";
import User from "../models/User.js";
import { createCertificatePdfBuffer } from "./certificatePdfService.js";
import { sendChallengeCompletionEmail } from "./emailService.js";

const STALE_DELIVERY_MS = 10 * 60 * 1000;
const RETRY_DELIVERY_MS = 5 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 3;

export async function dispatchLearningCertificateEmail(certificateId) {
  const attemptedAt = new Date();
  const claimed = await LearningCertificate.findOneAndUpdate(
    {
      _id: certificateId,
      $or: [
        { "completionEmail.status": { $in: ["PENDING", null] } },
        {
          "completionEmail.status": "FAILED",
          "completionEmail.attempts": { $lt: MAX_DELIVERY_ATTEMPTS },
          "completionEmail.attemptedAt": {
            $lte: new Date(attemptedAt.getTime() - RETRY_DELIVERY_MS),
          },
        },
        {
          "completionEmail.status": "SENDING",
          "completionEmail.attemptedAt": {
            $lte: new Date(attemptedAt.getTime() - STALE_DELIVERY_MS),
          },
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
  if (!claimed) {
    const certificate = await LearningCertificate.findById(certificateId)
      .select("completionEmail.status")
      .lean();
    return certificate?.completionEmail?.status === "SENT";
  }

  let delivery;
  try {
    const isCourse = claimed.kind === "COURSE" || !claimed.moduleId;
    const [student, program, module] = await Promise.all([
      User.findById(claimed.userId).select("name email").lean(),
      LearningProgram.findById(claimed.programId).select("title").lean(),
      isCourse
        ? Promise.resolve(null)
        : LearningModule.findById(claimed.moduleId).select("title").lean(),
    ]);
    if (!student?.email || !program?.title) {
      throw new Error("The certificate recipient or course details are unavailable.");
    }
    const certificatePdf = await createCertificatePdfBuffer({
      challengeType: isCourse ? "LEARNING_COURSE" : "LEARNING_MODULE",
      participantName: student.name || student.email,
      challengeName: isCourse ? program.title : module?.title || program.title,
      certificateCode: claimed.code,
      completedAt: claimed.earnedAt,
    });
    delivery = await sendChallengeCompletionEmail({
      email: student.email,
      userName: student.name,
      challengeName: isCourse
        ? `${program.title} (full course)`
        : `${program.title}: ${module?.title || ""}`.trim(),
      challengeType: isCourse ? "LEARNING_COURSE" : "LEARNING_MODULE",
      certificatePdf,
      certificateFilename: `COGNICLASH-Learning-${claimed.code}.pdf`,
    });
  } catch (error) {
    delivery = { success: false, error: error.message || String(error) };
  }

  await LearningCertificate.updateOne(
    {
      _id: claimed._id,
      "completionEmail.status": "SENDING",
      "completionEmail.attemptedAt": attemptedAt,
    },
    {
      $set: delivery.success
        ? {
            "completionEmail.status": "SENT",
            "completionEmail.sentAt": new Date(),
            "completionEmail.error": "",
          }
        : {
            "completionEmail.status": "FAILED",
            "completionEmail.error": String(delivery.error || "Email delivery failed.").slice(0, 500),
          },
    },
  );
  if (!delivery.success) {
    console.error("[LearningCertificateEmail] Delivery failed.", {
      certificateId: String(certificateId),
      error: delivery.error,
    });
  }
  return Boolean(delivery.success);
}
