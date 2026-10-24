import { Router } from "express";
import {
  getAssessmentIntegrityReport,
  recordAssessmentIntegrityEvent,
} from "../controllers/assessmentIntegrityController.js";
import { authenticate } from "../middleware/auth.js";
import { requireAssessmentRole } from "../middleware/rbac.js";
import { executionLimiter } from "../middleware/security.js";

const router = Router();

router.post("/events", authenticate, executionLimiter, recordAssessmentIntegrityEvent);
router.get(
  "/reports/:assessmentType/:assessmentId",
  authenticate,
  requireAssessmentRole("SUPER_ADMIN"),
  getAssessmentIntegrityReport,
);

export default router;
