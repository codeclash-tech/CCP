import {
  requestOtp,
  verifyOtp,
  loginWithPassword,
  resendOtp,
  requestPasswordReset,
  resetPassword,
} from "../services/authService.js";
import {
  generateLoginToken,
  createSession,
  revokeAllUserSessions,
} from "../services/tokenService.js";

/**
 * Password-based authentication controller with email-verified registration.
 *
 * Security notes:
 *  - Registration OTPs verify email only; organization is collected at room join.
 *  - Registration errors are explicit, while email-provider internals remain private.
 *  - NO LEAKAGE: internal email-provider errors are never surfaced to the client; a clean,
 *    generic message is returned instead. Detailed logs stay server-side.
 *  - Successful registration verification and password login both create a
 *    signed access token and a refreshable session.
 */

/**
 * POST /request-otp
 * Body: { email, name, password }
 */
export async function requestOTP(req, res) {
  try {
    const { email, name, password } = req.body || {};
    const ip = req.ip || req.connection?.remoteAddress || "";

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const result = await requestOtp({ email, name, password, ip });

                return res.status(200).json({
      message: "Registration verification code sent.",
      userId: result.userId,
      email: result.email,
    });
  } catch (error) {
    if (error.message?.includes("already registered")) {
      return res.status(409).json({ error: error.message });
    }
    if (
      error.message?.includes("Password") ||
      error.message?.includes("Full name")
    ) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message && error.message.includes("wait")) {
      return res.status(429).json({ error: error.message });
    }
    if (error.message === "Invalid email format.") {
      return res.status(400).json({ error: error.message });
    }
    // Generic failure — never leak email-provider internals.
    console.error("[AuthController] request-otp failed:", error.message);
    return res
      .status(500)
      .json({ error: "Unable to send OTP at this time. Please try again." });
  }
}

/**
 * POST /login-password
 * Body: { email, password }
 * Password login for verified accounts.
 */
export async function loginWithPasswordHandler(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    const user = await loginWithPassword({ email, password });

    const loginToken = generateLoginToken(
      user._id.toString(),
      user.email,
      user.organization,
      user.role,
    );

    const deviceInfo = req.headers["user-agent"] || "Unknown";
    const ipAddress = req.ip || req.connection?.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";
    const session = await createSession(
      user._id,
      deviceInfo,
      ipAddress,
      userAgent,
    );

    return res.status(200).json({
      message: "Login successful.",
      token: loginToken,
      refreshToken: session.refreshToken,
      sessionId: session._id,
      user: user.toPublicJSON(),
    });
  } catch (error) {
    const msg = error.message || "";
    if (
      msg.includes("Invalid email") ||
      msg.includes("Invalid credentials") ||
      msg.includes("not verified") ||
      msg.includes("verify")
    ) {
      return res.status(401).json({ error: msg });
    }
    console.error("[AuthController] login-password failed:", error.message);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
}

export async function requestPasswordResetHandler(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    await requestPasswordReset({ email });
    return res.status(200).json({
      message:
        "If an account exists for that email, a password reset code has been sent.",
    });
  } catch (error) {
    if (error.message === "Invalid email format.") {
      return res.status(400).json({ error: error.message });
    }
    console.error("[AuthController] password reset request failed:", error.message);
    return res.status(500).json({
      error: "Unable to process the password reset request. Please try again.",
    });
  }
}

export async function resetPasswordHandler(req, res) {
  try {
    const { email, otp, password } = req.body || {};
    if (!email || !otp || !password) {
      return res
        .status(400)
        .json({ error: "Email, reset code, and new password are required." });
    }

    const user = await resetPassword({ email, otp, password });
    await revokeAllUserSessions(user._id);
    return res.status(200).json({
      message: "Password updated. Please sign in with your new password.",
    });
  } catch (error) {
    const message = error.message || "";
    if (
      message.includes("Invalid") ||
      message.includes("Password") ||
      message.includes("Too many") ||
      message.includes("expired")
    ) {
      return res.status(400).json({ error: message });
    }
    console.error("[AuthController] password reset failed:", message);
    return res
      .status(500)
      .json({ error: "Unable to reset your password. Please try again." });
  }
}

/**
 * POST /verify-otp
 * Body: { userId, otp }
 */
export async function verifyOTP(req, res) {
  try {
    const { userId, otp } = req.body || {};

    if (!userId || !otp) {
      return res.status(400).json({ error: "UserId and OTP are required." });
    }

    const user = await verifyOtp({ userId, otp });

    // Issue a login token after completing verified registration.
    const loginToken = generateLoginToken(
      user._id.toString(),
      user.email,
      user.organization,
      user.role,
    );

    // Create a session for refresh-token flow (keeps existing frontend intact).
    const deviceInfo = req.headers["user-agent"] || "Unknown";
    const ipAddress = req.ip || req.connection?.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";
    const session = await createSession(
      user._id,
      deviceInfo,
      ipAddress,
      userAgent,
    );

    return res.status(200).json({
      message: "Login successful.",
      token: loginToken, // 12h stateless JWT
      refreshToken: session.refreshToken,
      sessionId: session._id,
      user: user.toPublicJSON(),
    });
  } catch (error) {
    const msg = error.message || "";
    if (msg.includes("already verified")) {
      return res.status(409).json({ error: msg });
    }
    if (
      msg.includes("OTP") ||
      msg.includes("attempt") ||
      msg.includes("Invalid") ||
      msg.includes("not found") ||
      msg.includes("No OTP")
    ) {
      return res.status(401).json({ error: msg });
    }
    console.error("[AuthController] verify-otp failed:", error.message);
    return res
      .status(500)
      .json({ error: "Verification failed. Please try again." });
  }
}

/**
 * Resend a registration-verification code.
 * Accepts `{ email }` or `{ userId }` (looked up from DB).
 */
export async function resendOTPHandler(req, res) {
  try {
    const { email, userId } = req.body || {};
    const ip = req.ip || req.connection?.remoteAddress || "";

    const result = await resendOtp({ email, userId, ip });
    return res.status(200).json({
      message: "If registration can be completed, a new code has been sent.",
      userId: result.userId,
      email: result.email,
    });
  } catch (error) {
    if (error.message?.includes("already verified")) {
      return res.status(409).json({ error: error.message });
    }
    if (error.message && error.message.includes("wait")) {
      return res.status(429).json({ error: error.message });
    }
    console.error("[AuthController] resend-otp failed:", error.message);
    return res
      .status(500)
      .json({ error: "Unable to send OTP at this time. Please try again." });
  }
}

export async function refreshToken(req, res) {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Refresh token is required." });
    }

    const { rotateRefreshToken } = await import("../services/tokenService.js");
    const session = await rotateRefreshToken(token);
    const User = (await import("../models/User.js")).default;
    const user = await User.findById(session.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    const loginToken = generateLoginToken(
      user._id.toString(),
      user.email,
      user.organization,
      user.role,
    );

    return res.status(200).json({
      token: loginToken,
      refreshToken: session.refreshToken,
      sessionId: session._id,
    });
  } catch (error) {
    if (error.message === "Invalid refresh token") {
      return res
        .status(401)
        .json({ error: "Invalid refresh token. Please login again." });
    }
    console.error("[AuthController] refresh-token failed:", error.message);
    return res.status(500).json({ error: "Failed to refresh token." });
  }
}

export async function logout(req, res) {
  try {
    const { sessionId } = req.body;
    const { revokeSession, revokeAllUserSessions } =
      await import("../services/tokenService.js");
    if (sessionId) {
      await revokeSession(sessionId);
    } else {
      await revokeAllUserSessions(req.userId);
    }
    return res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    console.error("[AuthController] logout failed:", error.message);
    return res.status(500).json({ error: "Failed to logout." });
  }
}

export async function logoutAllDevices(req, res) {
  try {
    const { sessionId } = req.body;
    const { revokeAllUserSessions } =
      await import("../services/tokenService.js");
    await revokeAllUserSessions(req.userId, sessionId);
    return res.status(200).json({ message: "Logged out from all devices." });
  } catch (error) {
    console.error("[AuthController] logout-all failed:", error.message);
    return res
      .status(500)
      .json({ error: "Failed to logout from all devices." });
  }
}

export async function getSessions(req, res) {
  try {
    const { getActiveSessions } = await import("../services/tokenService.js");
    const sessions = await getActiveSessions(req.userId);
    return res.status(200).json({ sessions });
  } catch (error) {
    console.error("[AuthController] get-sessions failed:", error.message);
    return res.status(500).json({ error: "Failed to get sessions." });
  }
}

export async function getProfile(req, res) {
  try {
    const user = req.user;
    return res.status(200).json({ user: user.toPublicJSON() });
  } catch (error) {
    console.error("[AuthController] get-profile failed:", error.message);
    return res.status(500).json({ error: "Failed to get profile." });
  }
}
