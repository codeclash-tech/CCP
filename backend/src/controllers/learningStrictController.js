import {
  startStrictAssessment,
  submitStrictAssessment,
  getStrictAttempt,
  listStrictAttempts,
  getStrictModuleResults,
} from "../services/learningStrictService.js";
import { buildStrictResultsWorkbook } from "../services/strictResultsExportService.js";
import LearningModule from "../models/LearningModule.js";

function requireObjectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("A JSON object is required.");
    error.statusCode = 400;
    throw error;
  }
  return body;
}

/**
 * Published STRICT_EVALUATION modules for the Challenges page.
 * Free, assessment-only listings. Self Evaluation content never appears here.
 */
export async function listStrictAssessments(req, res) {
  try {
    const now = new Date();
    const modules = await LearningModule.find({
      status: "PUBLISHED",
      deletedAt: null,
      evaluationMode: "STRICT_EVALUATION",
      $or: [{ scheduleStartAt: null }, { scheduleStartAt: { $lte: now } }],
    })
      .populate("programId", "title")
      .sort({ "programId.title": 1, sequence: 1 })
      .limit(100)
      .lean();
    const visible = modules.filter(
      (module) =>
        !module.scheduleEndAt || new Date(module.scheduleEndAt) >= now,
    );
    return res.status(200).json({
      assessments: visible.map((module) => ({
        id: module._id,
        courseTitle: module.programId?.title || "",
        title: module.title,
        description: module.description,
        evaluationMode: "STRICT_EVALUATION",
        scheduleStartAt: module.scheduleStartAt,
        scheduleEndAt: module.scheduleEndAt,
      })),
    });
  } catch (error) {
    console.error("[StrictController] list failed:", error.message);
    return res.status(500).json({ error: "Could not load assessments." });
  }
}

export async function startAssessment(req, res) {
  try {
    requireObjectBody(req.body);
    const result = await startStrictAssessment(
      req.userId,
      req.params.moduleId,
      req.body.topicId,
    );
    return res.status(200).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500)
      console.error("[StrictController] start failed:", error.message);
    return res
      .status(status)
      .json({ error: error.message || "Could not start the assessment." });
  }
}

export async function submitAssessment(req, res) {
  try {
    const body = requireObjectBody(req.body);
    const result = await submitStrictAssessment(
      req.userId,
      req.params.attemptId,
      body.answers,
    );
    return res.status(200).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500)
      console.error("[StrictController] submit failed:", error.message);
    return res
      .status(status)
      .json({ error: error.message || "Could not submit the assessment." });
  }
}

export async function getAttempt(req, res) {
  try {
    const result = await getStrictAttempt(req.userId, req.params.attemptId);
    return res.status(200).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    return res
      .status(status)
      .json({ error: error.message || "Could not load the attempt." });
  }
}

export async function listMyAttempts(req, res) {
  try {
    const attempts = await listStrictAttempts(req.userId);
    return res.status(200).json({ attempts });
  } catch (error) {
    console.error("[StrictController] history failed:", error.message);
    return res
      .status(500)
      .json({ error: "Could not load assessment history." });
  }
}

export async function getModuleResults(req, res) {
  try {
    const results = await getStrictModuleResults(
      req.userId,
      req.params.moduleId,
    );
    return res.status(200).json(results);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500)
      console.error("[StrictController] results failed:", error.message);
    return res
      .status(status)
      .json({ error: error.message || "Could not load results." });
  }
}

export async function exportModuleResults(req, res) {
  try {
    const workbook = await buildStrictResultsWorkbook(req.params.moduleId);
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="strict-evaluation-results-${req.params.moduleId}.xlsx"`,
    );
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500)
      console.error("[StrictController] export failed:", error.message);
    return res
      .status(status)
      .json({ error: error.message || "Could not export results." });
  }
}

export default {
  listStrictAssessments,
  startAssessment,
  submitAssessment,
  getAttempt,
  listMyAttempts,
  getModuleResults,
  exportModuleResults,
};
