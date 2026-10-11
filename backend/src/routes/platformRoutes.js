import { Router } from "express";
import {
  getPlatformPartners,
  getPlatformStats,
  updateCreatorProfile,
} from "../controllers/platformController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/stats", getPlatformStats);
router.get("/partners", getPlatformPartners);
router.put("/creator-profile", authenticate, updateCreatorProfile);

export default router;
