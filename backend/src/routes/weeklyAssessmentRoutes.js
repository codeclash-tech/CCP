import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireAssessmentRole } from "../middleware/rbac.js";
import {
  assignCandidateOrganizationHandler,
  createAdminOrganization,
  createOwnOrganizationProfile,
  createWeeklyCycleHandler,
  disqualifyWeeklyCandidateHandler,
  downloadWeeklyCertificate,
  finalizeWeeklyCycleHandler,
  getAdminWeeklyRoster,
  getCurrentWeeklyAssessment,
  getAdminGlobalChallenge,
  getOrganizationProfile,
  getWeeklyRankings,
  listAdminOrganizations,
  listAdminCandidates,
  listAdminWeeklyCycles,
  listAdminWeeklyCertificates,
  listMyOrganizationCertificates,
  listMyWeeklyCertificates,
  listMyWeeklyHistory,
  listOrganizationWeeklyHistory,
  listRecoverableWeeklySubmissionsHandler,
  submitCurrentWeeklyAnswer,
  saveAdminGlobalChallenge,
  retryWeeklyAnswerHandler,
  removeCandidateOrganizationHandler,
  updateAdminCandidateStatus,
  updateAdminOrganizationStatus,
  updateOwnOrganizationProfile,
  updateWeeklyQuestions,
} from "../controllers/weeklyAssessmentController.js";

const router = Router();
const admin = [authenticate, requireAssessmentRole("SUPER_ADMIN")];
const candidate = [authenticate];
const organizationUser = [authenticate, requireAssessmentRole("ORGANIZATION_USER")];

router.get("/current", ...candidate, getCurrentWeeklyAssessment);
router.post("/submit", ...candidate, submitCurrentWeeklyAnswer);
router.post("/retry/:submissionId", ...candidate, retryWeeklyAnswerHandler);
router.get("/recoverable", ...candidate, listRecoverableWeeklySubmissionsHandler);
router.get("/history", ...candidate, listMyWeeklyHistory);
router.get("/organization/history", ...organizationUser, listOrganizationWeeklyHistory);
router.get("/cycles/:cycleId/rankings", authenticate, getWeeklyRankings);

router.get("/certificates/mine", authenticate, listMyWeeklyCertificates);
router.get("/certificates/organization", ...organizationUser, listMyOrganizationCertificates);
router.get("/certificates/:certificateId/pdf", authenticate, downloadWeeklyCertificate);

router.get("/organization/profile", ...organizationUser, getOrganizationProfile);
router.post("/organization/profile", ...organizationUser, createOwnOrganizationProfile);
router.put("/organization/profile", ...organizationUser, updateOwnOrganizationProfile);

router.post("/admin/cycles", ...admin, createWeeklyCycleHandler);
router.get("/admin/global-challenge", ...admin, getAdminGlobalChallenge);
router.put("/admin/global-challenge", ...admin, saveAdminGlobalChallenge);
router.get("/admin/cycles", ...admin, listAdminWeeklyCycles);
router.put("/admin/cycles/:cycleId/questions", ...admin, updateWeeklyQuestions);
router.get("/admin/cycles/:cycleId/roster", ...admin, getAdminWeeklyRoster);
router.post("/admin/cycles/:cycleId/finalize", ...admin, finalizeWeeklyCycleHandler);
router.get("/admin/cycles/:cycleId/certificates", ...admin, listAdminWeeklyCertificates);
router.post("/admin/cycles/:cycleId/candidates/:candidateId/disqualify", ...admin, disqualifyWeeklyCandidateHandler);
router.get("/admin/cycles/:cycleId/results", ...admin, getWeeklyRankings);
router.get("/admin/organizations", ...admin, listAdminOrganizations);
router.get("/admin/candidates", ...admin, listAdminCandidates);
router.post("/admin/organizations", ...admin, createAdminOrganization);
router.put("/admin/candidates/:candidateId/organization", ...admin, assignCandidateOrganizationHandler);
router.delete("/admin/candidates/:candidateId/organization", ...admin, removeCandidateOrganizationHandler);
router.patch("/admin/candidates/:candidateId/status", ...admin, updateAdminCandidateStatus);
router.patch("/admin/organizations/:organizationId/status", ...admin, updateAdminOrganizationStatus);

export default router;
