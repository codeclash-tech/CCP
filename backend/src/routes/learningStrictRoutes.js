import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireAssessmentRole } from "../middleware/rbac.js";
import { learningTutorLimiter } from "../middleware/security.js";
import * as strictController from "../controllers/learningStrictController.js";

const router = Router();
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
const student = [
  authenticate,
  requireAssessmentRole("CANDIDATE", "ORGANIZATION_USER"),
];
const admin = [authenticate, requireAssessmentRole("SUPER_ADMIN")];

// Student — Strict Evaluation (Challenges page)
router.get(
  "/assessments",
  ...student,
  asyncRoute(strictController.listStrictAssessments),
);
router.post(
  "/modules/:moduleId/attempt",
  ...student,
  learningTutorLimiter,
  asyncRoute(strictController.startAssessment),
);
router.post(
  "/attempts/:attemptId/submit",
  ...student,
  learningTutorLimiter,
  asyncRoute(strictController.submitAssessment),
);
router.get(
  "/attempts/:attemptId",
  ...student,
  asyncRoute(strictController.getAttempt),
);
router.get("/history", ...student, asyncRoute(strictController.listMyAttempts));
router.get(
  "/attempts/:attemptId/report.pdf",
  ...student,
  asyncRoute(strictController.downloadAttemptReportPdf),
);

// Admin — results dashboard and Excel export (Super Admin only)
router.get(
  "/admin/modules/:moduleId/results",
  ...admin,
  asyncRoute(strictController.getModuleResults),
);
router.get(
  "/admin/modules/:moduleId/results.xlsx",
  ...admin,
  asyncRoute(strictController.exportModuleResults),
);

export default router;
