import { Router } from "express";
import { getPlatformStats } from "../controllers/platformController.js";

const router = Router();

router.get("/stats", getPlatformStats);

export default router;
