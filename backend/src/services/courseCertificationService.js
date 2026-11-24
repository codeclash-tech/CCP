import LearningProgram from "../models/LearningProgram.js";
import LearningModule from "../models/LearningModule.js";
import LearningProgress from "../models/LearningProgress.js";
import LearningCertificate from "../models/LearningCertificate.js";
import { dispatchLearningCertificateEmail } from "./learningCertificateNotificationService.js";
import crypto from "crypto";

/**
 * Course-level certification. A course certificate is issued only when every
 * module marked `requiredForCompletion` in the course is completed by the
 * user (LearningProgress.completedAt set). Optional modules never block
 * certification. Certificates are issued once per user+course.
 *
 * Returns the created course certificate, or null when the course is not
 * yet complete or a certificate already exists.
 */
export async function updateCourseCertificateProgress(userId, moduleId) {
  const module = await LearningModule.findById(moduleId)
    .select("programId")
    .lean();
  if (!module?.programId) return null;
  const programId = module.programId;

  const program = await LearningProgram.findOne({
    _id: programId,
    status: "PUBLISHED",
    deletedAt: null,
  })
    .select("_id title")
    .lean();
  if (!program) return null;

  const requiredModules = await LearningModule.find({
    programId,
    deletedAt: null,
    requiredForCompletion: true,
  })
    .select("_id")
    .lean();
  if (!requiredModules.length) return null;

  const requiredIds = requiredModules.map((entry) => String(entry._id));
  const completed = await LearningProgress.find({
    userId,
    moduleId: { $in: requiredIds },
    completedAt: { $ne: null },
  })
    .select("moduleId")
    .lean();
  const completedIds = new Set(
    completed.map((entry) => String(entry.moduleId)),
  );
  if (requiredIds.some((requiredId) => !completedIds.has(requiredId))) {
    return null;
  }

  const certificate = await LearningCertificate.findOneAndUpdate(
    { userId, courseId: programId, kind: "COURSE" },
    {
      $setOnInsert: {
        code: crypto.randomUUID(),
        userId,
        programId,
        courseId: programId,
        moduleId: null,
        moduleVersion: 1,
        kind: "COURSE",
        earnedAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  await dispatchLearningCertificateEmail(certificate._id).catch((error) =>
    console.error(
      "[CourseCertification] Certificate email failed:",
      error.message,
    ),
  );
  return certificate;
}

/**
 * Complete course-certificate status for a student dashboard: which required
 * modules remain, and the issued course certificate (if any).
 */
export async function getCourseCertificationSummary(userId, programId) {
  const [requiredModules, certificate] = await Promise.all([
    LearningModule.find({
      programId,
      deletedAt: null,
      requiredForCompletion: true,
    })
      .select("_id title sequence")
      .sort({ sequence: 1 })
      .lean(),
    LearningCertificate.findOne({ userId, courseId: programId, kind: "COURSE" })
      .select("code earnedAt")
      .lean(),
  ]);
  const requiredIds = requiredModules.map((entry) => String(entry._id));
  const completed = requiredIds.length
    ? await LearningProgress.find({
        userId,
        moduleId: { $in: requiredIds },
        completedAt: { $ne: null },
      })
        .select("moduleId")
        .lean()
    : [];
  const completedIds = new Set(
    completed.map((entry) => String(entry.moduleId)),
  );
  const remaining = requiredModules
    .filter((entry) => !completedIds.has(String(entry._id)))
    .map((entry) => ({ id: entry._id, title: entry.title }));
  return {
    requiredModules: requiredModules.map((entry) => ({
      id: entry._id,
      title: entry.title,
      completed: completedIds.has(String(entry._id)),
    })),
    remaining,
    eligible: requiredIds.length > 0 && remaining.length === 0,
    certificate: certificate || null,
  };
}
