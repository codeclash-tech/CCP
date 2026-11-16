import LearningCertificate from "../models/LearningCertificate.js";
import { streamCertificatePdf } from "../services/certificatePdfService.js";
import {
  askLearningTutor,
  completeLearningTopic,
  createLearningModule,
  createLearningProgram,
  createJavaLearningProgramStructure,
  createLearningPurchase,
  getAdminLearningModule,
  getLearningDashboard,
  getStudentModule,
  listAdminLearningPrograms,
  listAdminLearningPurchases,
  listLearningPrograms,
  requestLearningSession,
  reviewLearningPurchase,
  submitLearningAssessment,
  submitLearningExercise,
  updateLearningModule,
  updateLearningProgram,
} from "../services/learningService.js";

function requireObjectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("A JSON object is required.");
    error.statusCode = 400;
    throw error;
  }
}

export async function listPrograms(req, res) {
  return res.json(await listLearningPrograms(req.userId, req.query.page, req.query.limit));
}

export async function listAdminPrograms(req, res) {
  return res.json(await listAdminLearningPrograms(req.query.page, req.query.limit));
}

export async function createProgram(req, res) {
  requireObjectBody(req.body);
  return res.status(201).json({
    program: await createLearningProgram(req.userId, req.body),
  });
}

export async function createJavaProgramTemplate(req, res) {
  return res.status(201).json({
    program: await createJavaLearningProgramStructure(req.userId),
  });
}

export async function updateProgram(req, res) {
  requireObjectBody(req.body);
  return res.json({
    program: await updateLearningProgram(req.userId, req.params.programId, req.body),
  });
}

export async function createModule(req, res) {
  requireObjectBody(req.body);
  return res.status(201).json({
    module: await createLearningModule(req.params.programId, req.body),
  });
}

export async function getAdminModule(req, res) {
  return res.json({ module: await getAdminLearningModule(req.params.moduleId) });
}

export async function updateModule(req, res) {
  requireObjectBody(req.body);
  return res.json({
    module: await updateLearningModule(req.params.moduleId, req.body),
  });
}

export async function createPurchase(req, res) {
  requireObjectBody(req.body);
  return res.status(201).json({
    purchase: await createLearningPurchase(req.userId, req.body),
  });
}

export async function listAdminPurchases(req, res) {
  return res.json(await listAdminLearningPurchases(req.query.page, req.query.limit));
}

export async function updatePurchase(req, res) {
  requireObjectBody(req.body);
  return res.json({
    purchase: await reviewLearningPurchase(
      req.userId,
      req.params.purchaseId,
      req.body.status,
    ),
  });
}

export async function getModule(req, res) {
  return res.json(
    await getStudentModule(req.userId, req.params.programId, req.params.moduleId),
  );
}

export async function getDashboard(req, res) {
  return res.json(
    await getLearningDashboard(req.userId, req.query.page, req.query.limit),
  );
}

export async function downloadLearningCertificate(req, res) {
  const certificate = await LearningCertificate.findOne({
    _id: req.params.certificateId,
    userId: req.userId,
  })
    .populate("userId", "name")
    .populate("programId", "title")
    .populate("moduleId", "title");
  if (!certificate) {
    const error = new Error("Learning certificate not found.");
    error.statusCode = 404;
    throw error;
  }
  streamCertificatePdf(
    {
      participantName: certificate.userId.name,
      challengeName: certificate.moduleId.title,
      challengeType: "LEARNING_MODULE",
      score: 100,
      completedAt: certificate.earnedAt,
      certificateCode: certificate.code,
    },
    res,
  );
}

export async function startLearningSession(req, res) {
  requireObjectBody(req.body);
  const session = await requestLearningSession(
    req.userId,
    req.body.moduleId,
    req.body.topicId,
    req.body.language,
  );
  return res.json({ session });
}

export async function sendTutorMessage(req, res) {
  requireObjectBody(req.body);
  return res.json(
    await askLearningTutor(
      req.userId,
      req.params.sessionId,
      req.body.message,
      req.body.language,
    ),
  );
}

export async function completeTopic(req, res) {
  const result = await completeLearningTopic(
    req.userId,
    req.params.moduleId,
    req.params.topicId,
  );
  return res.json(result);
}

export async function submitAssessment(req, res) {
  requireObjectBody(req.body);
  return res.json(
    await submitLearningAssessment(
      req.userId,
      req.params.moduleId,
      req.body.answers,
    ),
  );
}

export async function submitExercise(req, res) {
  requireObjectBody(req.body);
  return res.json(
    await submitLearningExercise(
      req.userId,
      req.params.moduleId,
      req.params.topicId,
      req.params.exerciseId,
      req.body.code,
      req.body.subtopicId,
    ),
  );
}
