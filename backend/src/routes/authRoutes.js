import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  requestOTP,
  verifyOTP,
  resendOTPHandler,
  refreshToken,
  logout,
  logoutAllDevices,
  getSessions,
  getProfile,
  loginWithPasswordHandler,
  requestPasswordResetHandler,
  resetPasswordHandler,
  updateProfile,
} from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import {
  validateEmail,
  validateOTP,
  validateUserId,
  handleValidationErrors,
} from "../middleware/validate.js";
import { auditLogin, auditLogout } from "../middleware/auditLog.js";

const router = Router();

/**
 * API Gateway Rate Limiters (IP-keyed).
 *
 *  - `/request-otp`: max 3 requests / 15 minutes / IP
 *    → throttles email-bombing and API-exhaustion scripts.
 *  - `/verify-otp`: max 5 requests / 5 minutes / IP
 *    → throttles brute-forcing of 6-digit codes.
 *
 * `standardHeaders: true` sends RFC 7766 `RateLimit-*` headers.
 * `legacyHeaders: false` disables the deprecated `X-RateLimit-*` headers.
 * `skipSuccessfulRequests` is used on verify-otp so only FAILED attempts
 * count toward the brute-force budget.
 */
const requestOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many OTP requests. Please try again in 15 minutes.",
  },
});

const passwordLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many sign-in attempts. Please try again in 15 minutes.",
  },
});

const verifyOtpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed attempts
  message: {
    error:
      "Too many failed verification attempts. Please try again in 5 minutes.",
  },
});

const resendOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many resend requests. Please try again later.",
  },
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many password reset attempts. Please try again later.",
  },
});

router.post("/login-password", passwordLoginLimiter, loginWithPasswordHandler);
router.post(
  "/request-password-reset",
  passwordResetLimiter,
  validateEmail,
  handleValidationErrors,
  requestPasswordResetHandler,
);
router.post("/reset-password", passwordResetLimiter, resetPasswordHandler);
router.post(
  "/request-otp",
  requestOtpLimiter,
  validateEmail,
  handleValidationErrors,
  requestOTP,
);
router.post(
  "/verify-otp",
  verifyOtpLimiter,
  validateUserId,
  validateOTP,
  handleValidationErrors,
  verifyOTP,
  auditLogin,
);
router.post(
  "/resend-otp",
  resendOtpLimiter,
  handleValidationErrors,
  resendOTPHandler,
);
router.post("/refresh-token", refreshToken);
router.post("/logout", authenticate, logout, auditLogout);
router.post("/logout-all", authenticate, logoutAllDevices);
router.get("/sessions", authenticate, getSessions);
router.get("/profile", authenticate, getProfile);
router.put("/profile", authenticate, updateProfile);

export default router;
