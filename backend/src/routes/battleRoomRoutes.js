import { Router } from "express";
import {
  createRoom,
  startRoom,
  getRoomByCode,
  joinRoom,
  submitQuestionSolution,
  runQuestionSolution,
  endTest,
  disqualifyRoomSubmission,
  getRoomLeaderboard,
  getUserResult,
  closeRoom,
  getLeaderboardByRoomCodePublic,
  getMyRooms,
  getJoinedRooms,
  deleteRoom,
  shareKey,
  reuseRoom,
  getRoomReport,
  downloadRoomReportPDF,
  downloadRoomResultsExcel,
  downloadParticipantReportPDF,
  getRoomResultDelivery,
  retryRoomResultDelivery,
} from "../controllers/battleRoomController.js";
import {
  generateSignature,
  generateStarterCode,
  generateOutputs,
  validateQuestionEndpoint,
} from "../controllers/battleRoomAuthoringController.js";
import {
  downloadBattleRoomCertificate,
  downloadParticipantBattleRoomCertificate,
} from "../controllers/battleRoomCertificateController.js";
import {
  authenticate,
  requireVerifiedCreator,
} from "../middleware/auth.js";
import {
  executionLimiter,
  joinLimiter,
  reportLimiter,
} from "../middleware/security.js";

const router = Router();
const creatorAuth = [
  authenticate,
  requireVerifiedCreator,
];

// Authoring wizard helpers (stateless; do not create rooms)
router.post("/authoring/generate-signature", ...creatorAuth, generateSignature);
router.post("/authoring/generate-starter", ...creatorAuth, generateStarterCode);
router.post("/authoring/generate-outputs", ...creatorAuth, generateOutputs);
router.post("/authoring/validate", ...creatorAuth, validateQuestionEndpoint);

// Room management
router.get("/certificate/:token", reportLimiter, downloadBattleRoomCertificate);
router.get(
  "/:roomCode/certificate",
  authenticate,
  downloadParticipantBattleRoomCertificate,
);
router.post("/create", ...creatorAuth, createRoom);
router.post("/:roomCode/start", ...creatorAuth, startRoom);
router.post("/join", authenticate, joinLimiter, joinRoom);
router.get("/my-rooms", ...creatorAuth, getMyRooms);
router.get("/joined-rooms", authenticate, getJoinedRooms);
router.get("/:roomCode", authenticate, getRoomByCode);

// Creator-only actions
router.delete("/:roomCode", ...creatorAuth, deleteRoom);
router.post("/:roomCode/share-key", ...creatorAuth, shareKey);

// Submission (stateless, no raw code persisted)
router.post(
  "/:roomCode/submit",
  authenticate,
  executionLimiter,
  submitQuestionSolution,
);

// Debug run (stateless, read-only, visible test cases only, does NOT create a submission)
router.post(
  "/:roomCode/run",
  authenticate,
  executionLimiter,
  runQuestionSolution,
);

// End test (finalize the user's submission as completed)
router.post("/:roomCode/end", authenticate, endTest);

router.post("/:roomCode/disqualify", authenticate, disqualifyRoomSubmission);

// Leaderboard
router.get("/:roomCode/leaderboard", authenticate, getRoomLeaderboard);
router.get(
  "/:roomCode/public-leaderboard",
  authenticate,
  getLeaderboardByRoomCodePublic,
);
router.get("/:roomCode/my-result", authenticate, getUserResult);

// Close room (only creator can close)
router.post("/:roomCode/close", ...creatorAuth, closeRoom);
router.get("/:roomCode/result-delivery", ...creatorAuth, getRoomResultDelivery);
router.post(
  "/:roomCode/result-delivery/retry",
  ...creatorAuth,
  retryRoomResultDelivery,
);
router.post("/:roomCode/reuse", ...creatorAuth, reuseRoom);

// Creator-only reports (authorization enforced inside reportService)
router.get(
  "/:roomCode/report",
  ...creatorAuth,
  reportLimiter,
  getRoomReport,
);
router.get(
  "/:roomCode/report/pdf",
  ...creatorAuth,
  reportLimiter,
  downloadRoomReportPDF,
);
router.get(
  "/:roomCode/report/excel",
  ...creatorAuth,
  reportLimiter,
  downloadRoomResultsExcel,
);
router.get(
  "/:roomCode/report/participant/:participantId/pdf",
  ...creatorAuth,
  reportLimiter,
  downloadParticipantReportPDF,
);

export default router;
