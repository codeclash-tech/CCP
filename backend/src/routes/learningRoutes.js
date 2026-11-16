import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireAssessmentRole } from "../middleware/rbac.js";
import {
  executionLimiter,
  learningTutorLimiter,
} from "../middleware/security.js";
import * as learningController from "../controllers/learningController.js";

const router = Router();
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
const student = [
  authenticate,
  requireAssessmentRole("CANDIDATE", "ORGANIZATION_USER"),
];
const admin = [authenticate, requireAssessmentRole("SUPER_ADMIN")];

router.get("/programs", ...student, asyncRoute(learningController.listPrograms));
router.post("/purchases", ...student, asyncRoute(learningController.createPurchase));
router.get("/me", ...student, asyncRoute(learningController.getDashboard));
router.get(
  "/certificates/:certificateId/pdf",
  ...student,
  asyncRoute(learningController.downloadLearningCertificate),
);
router.get(
  "/programs/:programId/modules/:moduleId",
  ...student,
  asyncRoute(learningController.getModule),
);
router.post("/sessions", ...student, asyncRoute(learningController.startLearningSession));
router.post(
  "/sessions/:sessionId/messages",
  ...student,
  learningTutorLimiter,
  asyncRoute(learningController.sendTutorMessage),
);
router.post(
  "/modules/:moduleId/topics/:topicId/complete",
  ...student,
  asyncRoute(learningController.completeTopic),
);
router.post(
  "/modules/:moduleId/assessment",
  ...student,
  asyncRoute(learningController.submitAssessment),
);
router.post(
  "/modules/:moduleId/topics/:topicId/exercises/:exerciseId",
  ...student,
  executionLimiter,
  asyncRoute(learningController.submitExercise),
);

router.get("/admin/programs", ...admin, asyncRoute(learningController.listAdminPrograms));
router.post("/admin/programs", ...admin, asyncRoute(learningController.createProgram));
router.post(
  "/admin/programs/java-template",
  ...admin,
  asyncRoute(learningController.createJavaProgramTemplate),
);
router.patch(
  "/admin/programs/:programId",
  ...admin,
  asyncRoute(learningController.updateProgram),
);
router.post(
  "/admin/programs/:programId/modules",
  ...admin,
  asyncRoute(learningController.createModule),
);
router.get(
  "/admin/modules/:moduleId",
  ...admin,
  asyncRoute(learningController.getAdminModule),
);
router.patch(
  "/admin/modules/:moduleId",
  ...admin,
  asyncRoute(learningController.updateModule),
);
router.get(
  "/admin/purchases",
  ...admin,
  asyncRoute(learningController.listAdminPurchases),
);
router.patch(
  "/admin/purchases/:purchaseId",
  ...admin,
  asyncRoute(learningController.updatePurchase),
);

export default router;
