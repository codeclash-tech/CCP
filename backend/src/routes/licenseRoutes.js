import { Router } from "express";
import {
  listLicenses,
  listOrganizations,
  generateLicense,
  validateLicenseKey,
} from "../controllers/licenseController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/validate", validateLicenseKey);
router.get("/", authenticate, listLicenses);
router.get("/organizations", authenticate, listOrganizations);
router.post("/generate", authenticate, generateLicense);

export default router;
