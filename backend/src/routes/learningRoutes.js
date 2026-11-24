import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireAssessmentRole } from "../middleware/rbac.js";
import {
  executionLimiter,
  learningPurchaseLimiter,
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
router.post(
  "/purchases",
  ...student,
  learningPurchaseLimiter,
  asyncRoute(learningController.createPurchase),
);
router.post(
  "/purchases/:purchaseId/verify",
  ...student,
  learningPurchaseLimiter,
  asyncRoute(learningController.verifyPurchase),
);
router.post(
  "/payments/webhook",
  asyncRoute(learningController.learningPaymentWebhook),
);
router.get("/me", ...student, asyncRoute(learningController.getDashboard));
router.get(
  "/certification/:programId/summary",
  ...student,
  asyncRoute(learningController.getCertificationSummary),
);
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
router.get(
  "/programs/:programId/modules/:moduleId/topics/:topicId",
  ...student,
  asyncRoute(learningController.getTopic),
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
  learningTutorLimiter,
  executionLimiter,
  asyncRoute(learningController.submitExercise),
);

router.get("/admin/programs", ...admin, asyncRoute(learningController.listAdminPrograms));
router.post("/admin/programs", ...admin, asyncRoute(learningController.createProgram));
router.patch(
  "/admin/programs/:programId",
  ...admin,
  asyncRoute(learningController.updateProgram),
);
router.delete(
  "/admin/programs/:programId",
  ...admin,
  asyncRoute(learningController.archiveProgram),
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
router.patch(
  "/admin/modules/:moduleId/status",
  ...admin,
  asyncRoute(learningController.changeModuleStatus),
);
router.delete(
  "/admin/modules/:moduleId",
  ...admin,
  asyncRoute(learningController.archiveModule),
);
router.put(
  "/admin/programs/:programId/modules/order",
  ...admin,
  asyncRoute(learningController.reorderModules),
);
router.post(
  "/admin/modules/:moduleId/topics",
  ...admin,
  asyncRoute(learningController.createTopic),
);
router.post(
  "/admin/modules/:moduleId/topic-proposals",
  ...admin,
  learningTutorLimiter,
  asyncRoute(learningController.createTopicProposal),
);
router.post(
  "/admin/modules/:moduleId/topics/:topicId/preview",
  ...admin,
  learningTutorLimiter,
  asyncRoute(learningController.previewTopicTutor),
);
router.post(
  "/admin/modules/:moduleId/topic-preview",
  ...admin,
  learningTutorLimiter,
  asyncRoute(learningController.previewTopicTutor),
);
router.patch(
  "/admin/modules/:moduleId/topics/:topicId",
  ...admin,
  asyncRoute(learningController.updateTopic),
);
router.delete(
  "/admin/modules/:moduleId/topics/:topicId",
  ...admin,
  asyncRoute(learningController.deleteTopic),
);
router.put(
  "/admin/modules/:moduleId/topics/order",
  ...admin,
  asyncRoute(learningController.reorderTopics),
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
