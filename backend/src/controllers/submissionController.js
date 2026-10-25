import {
  createSubmission,
  processSubmissionResult,
  getSubmission,
  disqualifySubmission,
} from "../services/submissionService.js";
import Challenge from "../models/Challenge.js";
import Submission from "../models/Submission.js";

export async function submitSolution(req, res) {
  try {
    const { challengeId, code, language, timeToSolve } = req.body;
    const userId = req.userId;

    if (!challengeId || !code) {
      return res.status(400).json({ error: "Challenge ID and code are required." });
    }

    // Validate code size
    if (code.length > 50000) {
      return res.status(400).json({ error: "Code exceeds maximum length of 50000 characters." });
    }

    // Server-side contest timing validation
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found." });
    }

    // Validate contest window (server-authoritative)
    const now = new Date();
    const activeDate = new Date(challenge.activeDate);
    const contestEnd = new Date(activeDate);
    contestEnd.setHours(contestEnd.getHours() + 24);

    if (now < activeDate || now > contestEnd) {
      return res.status(403).json({
        error: "Submission window is closed.",
        code: "CONTEST_CLOSED",
      });
    }

    if (!challenge.isActive) {
      return res.status(403).json({
        error: "This challenge is no longer active.",
        code: "CHALLENGE_INACTIVE",
      });
    }

    if (language && language.toLowerCase() !== "java") {
      return res.status(400).json({ error: "Only Java submissions are supported." });
    }

    const submission = await createSubmission(userId, challengeId, code, "java", timeToSolve || 0);

    // Audit log
    Submission.findById(submission._id).then((s) => {
      if (s) {
        import("../models/AuditLog.js").then(({ default: AuditLog }) => {
          AuditLog.create({
            userId,
            action: "SUBMISSION_CREATE",
            resource: "submission",
            resourceId: submission._id,
            details: { challengeId, language: "java" },
            requestId: req.requestId,
          }).catch(() => {});
        });
      }
    });

    return res.status(201).json({
      message: "Submission received.",
      submissionId: submission._id,
      status: "PENDING",
    });
  } catch (error) {
    if (error.message.includes("already submitted")) {
      return res.status(409).json({ error: error.message, code: "ALREADY_SUBMITTED" });
    }
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Submit solution error:", error.message);
    return res.status(500).json({ error: "Failed to submit solution." });
  }
}

export async function getSubmissionResult(req, res) {
  try {
    const { challengeId } = req.params;
    const userId = req.userId;

    const submission = await getSubmission(userId, challengeId);
    if (!submission) {
      return res.status(404).json({ error: "No submission found for this challenge." });
    }

    const publicResult = submission.toPublicJSON({
      includeTestCaseDetails: true,
    });
    publicResult.results = publicResult.results.map((result) => {
      const { isHidden: _legacyHiddenFlag, ...testResult } = result;
      return testResult;
    });

    return res.status(200).json(publicResult);
  } catch (error) {
    console.error("Get submission result error:", error.message);
    return res.status(500).json({ error: "Failed to get submission result." });
  }
}

export async function updateSubmissionResult(req, res) {
  try {
    const { submissionId } = req.params;
    const { executionResult } = req.body;

    if (!executionResult) {
      return res.status(400).json({ error: "Execution result is required." });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found." });
    }

    // Validate execution result structure
    if (!executionResult.results || !Array.isArray(executionResult.results)) {
      return res.status(400).json({ error: "Invalid execution result format." });
    }

    const result = await processSubmissionResult(submissionId, executionResult);
    return res.status(200).json(result);
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Update submission result error:", error.message);
    return res.status(500).json({ error: "Failed to update submission result." });
  }
}

export async function handleDisqualification(req, res) {
  try {
    const { submissionId } = req.params;
    const result = await disqualifySubmission(submissionId);

    // Audit log
    import("../models/AuditLog.js").then(({ default: AuditLog }) => {
      AuditLog.create({
        userId: req.userId,
        action: "SUBMISSION_DISQUALIFY",
        resource: "submission",
        resourceId: submissionId,
        details: { reason: req.body.reason || "Manual disqualification" },
        requestId: req.requestId,
      }).catch(() => {});
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Disqualification error:", error.message);
    return res.status(500).json({ error: "Failed to disqualify submission." });
  }
}

export async function getSubmissionHistory(req, res) {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const submissions = await Submission.find({ userId })
      .populate("challengeId", "title slug difficulty")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Submission.countDocuments({ userId });

    return res.status(200).json({
      submissions: submissions.map((s) => ({
        submissionId: s._id,
        challengeTitle: s.challengeId?.title || "Unknown",
        challengeSlug: s.challengeId?.slug || "",
        difficulty: s.challengeId?.difficulty || "MEDIUM",
        status: s.status,
        score: s.score,
        passed: s.passed,
        total: s.total,
        submittedAt: s.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get submission history error:", error.message);
    return res.status(500).json({ error: "Failed to get submission history." });
  }
}
