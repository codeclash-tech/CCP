import User from "../models/User.js";
import Otp from "../models/Otp.js";
import config from "../config/env.js";
import { sendOtpEmail, sanitizeEmail } from "./emailDispatchService.js";

/**
 * Password-based auth service.
 *
 * Registration flow:
 *   1. User provides name, email, password.
 *   2. An OTP is emailed for verification.
 *   3. On OTP verification the pending account is marked verified.
 *
 * Login flow:
 *   User provides email + password. On success a login token + session is issued.
 *
 * Super admin: helloamux@gmail.com registers as a normal person but is
 * automatically promoted to the ADMIN role.
 */
const SUPER_ADMIN_EMAIL = (
  config.SUPER_ADMIN_EMAIL || "helloamux@gmail.com"
).toLowerCase();

const OTP_TTL_SECONDS = parseInt(config.OTP_TTL_SECONDS || "300", 10);
const OTP_MAX_ATTEMPTS = parseInt(config.OTP_MAX_ATTEMPTS || "3", 10);
const OTP_RESEND_COOLDOWN_SECONDS = parseInt(
  config.OTP_RESEND_COOLDOWN_SECONDS || "30",
  10,
);

/**
 * Convert a name to Sentence case (e.g. "jOhN dOE" -> "John Doe").
 * @param {string} name
 * @returns {string}
 */
function toSentenceCase(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// ---- Lightweight in-memory per-IP cooldown (defense in depth) -------------
const cooldownMap = new Map(); // ip -> timestamp (ms)
function isRateLimited(ip) {
  const now = Date.now();
  const last = cooldownMap.get(ip) || 0;
  if (now - last < OTP_RESEND_COOLDOWN_SECONDS * 1000) return true;
  cooldownMap.set(ip, now);
  if (cooldownMap.size > 10000) {
    for (const [k, v] of cooldownMap) {
      if (now - v > 60000) cooldownMap.delete(k);
    }
  }
  return false;
}

/**
 * Register a new user (name, email, password) and email an OTP for verification.
 * The user document is created immediately with the hashed password but
 * `isVerified` is false until the OTP is confirmed.
 *
 * Existing verified accounts must use password login; OTP is only for
 * completing registration and verifying the email address.
 */
export async function requestOtp({
  email,
  name,
  password,
  termsAccepted,
  ip,
}) {
  if (termsAccepted !== true) {
    throw new Error("You must agree to the Terms and Conditions to register.");
  }

  const cleanEmail = sanitizeEmail(email);
  if (!cleanEmail) throw new Error("Invalid email format.");

  const displayName = toSentenceCase(name);
  if (displayName.length < 2 || displayName.length > 100) {
    throw new Error("Full name must be between 2 and 100 characters.");
  }
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new Error("Password must be between 8 and 72 bytes.");
  }

  if (ip && isRateLimited(ip)) {
    throw new Error(
      `Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting a new OTP.`,
    );
  }

  let user = await User.findOne({ email: cleanEmail });

  if (!user) {
    const isSuperAdmin = cleanEmail === SUPER_ADMIN_EMAIL;
    user = new User({
      email: cleanEmail,
      name: displayName,
      organization: "Unspecified",
      password, // hashed via pre-save hook
      role: isSuperAdmin ? "ADMIN" : "USER",
      isVerified: false,
      termsAcceptedAt: new Date(),
      termsVersion: "2026-10-11",
    });
    await user.save();
  } else {
    if (user.isVerified) {
      throw new Error("Email is already registered. Sign in with your password.");
    }
    user.termsAcceptedAt = new Date();
    user.termsVersion = "2026-10-11";
    await user.save();
    // A pending registration may request another code, but cannot replace
    // the password or profile details already attached to that account.
  }

  // Guarantee a single live code per user.
  await Otp.deleteMany({ email: cleanEmail, purpose: "register" });

  const code = Otp.generateCode();
  const codeHash = Otp.hashCode(code);

  const otpDoc = new Otp({
    codeHash,
    email: cleanEmail,
    organization: "",
    purpose: "register",
    userId: user._id,
    attempts: 0,
    ip: ip || "",
    userAgent: "",
  });
  await otpDoc.save();

  const ttlMinutes = Math.max(1, Math.round(OTP_TTL_SECONDS / 60));
  const sendResult = await sendOtpEmail({
    email: cleanEmail,
    otp: code,
    ttlMinutes,
  });

  if (!sendResult.success) {
    await Otp.deleteOne({ _id: otpDoc._id }).catch(() => {});
    console.error(
      `[AuthService] Email dispatch failed for ${cleanEmail}; OTP rolled back.`,
    );
    throw new Error("Unable to send OTP at this time. Please try again.");
  }

  return { userId: user._id.toString(), email: cleanEmail };
}

export async function requestPasswordReset({ email }) {
  const cleanEmail = sanitizeEmail(email);
  if (!cleanEmail) throw new Error("Invalid email format.");

  const user = await User.findOne({ email: cleanEmail });
  if (!user?.isVerified) return;

  await Otp.deleteMany({ email: cleanEmail, purpose: "password-reset" });

  const code = Otp.generateCode();
  const otpDoc = new Otp({
    codeHash: Otp.hashCode(code),
    email: cleanEmail,
    organization: "",
    purpose: "password-reset",
    userId: user._id,
    attempts: 0,
  });
  await otpDoc.save();

  const ttlMinutes = Math.max(1, Math.round(OTP_TTL_SECONDS / 60));
  const sendResult = await sendOtpEmail({
    email: cleanEmail,
    otp: code,
    ttlMinutes,
    purpose: "password-reset",
  });

  if (!sendResult.success) {
    await Otp.deleteOne({ _id: otpDoc._id }).catch(() => {});
    console.error(
      `[AuthService] Password reset email dispatch failed for ${cleanEmail}; OTP rolled back.`,
    );
    throw new Error("Unable to send a password reset code at this time.");
  }
}

export async function resetPassword({ email, otp, password }) {
  const cleanEmail = sanitizeEmail(email);
  if (!cleanEmail) throw new Error("Invalid email format.");
  if (!/^\d{6}$/.test(String(otp || ""))) {
    throw new Error("Invalid or expired password reset code.");
  }
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new Error("Password must be between 8 and 72 bytes.");
  }

  const user = await User.findOne({ email: cleanEmail }).select("+password");
  if (!user?.isVerified) {
    throw new Error("Invalid or expired password reset code.");
  }

  const otpDoc = await Otp.findOne({
    email: cleanEmail,
    userId: user._id,
    purpose: "password-reset",
  }).sort({ createdAt: -1 });
  if (!otpDoc) {
    throw new Error("Invalid or expired password reset code.");
  }

  if (!otpDoc.matches(String(otp))) {
    otpDoc.attempts = (otpDoc.attempts || 0) + 1;
    if (otpDoc.attempts >= OTP_MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: otpDoc._id });
      throw new Error("Too many invalid attempts. Request a new reset code.");
    }
    await otpDoc.save();
    throw new Error("Invalid or expired password reset code.");
  }

  user.password = password;
  await user.save();
  await Otp.deleteOne({ _id: otpDoc._id });
  return user;
}

/**
 * Verify an OTP and mark the user as verified.
 */
export async function verifyOtp({ userId, otp }) {
  if (!/^\d{6}$/.test(String(otp || ""))) {
    throw new Error("Invalid OTP.");
  }
  if (!userId) {
    throw new Error("User ID is required.");
  }

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found.");

  if (user.isVerified) {
    throw new Error("This account is already verified. Sign in with your password.");
  }

  const otpDoc = await Otp.findOne({
    email: user.email,
    userId: user._id,
    purpose: "register",
  }).sort({ createdAt: -1 });

  if (!otpDoc) {
    throw new Error("No OTP found. Please request a new one.");
  }

  if (!otpDoc.matches(String(otp))) {
    otpDoc.attempts = (otpDoc.attempts || 0) + 1;
    if (otpDoc.attempts >= OTP_MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: otpDoc._id });
      throw new Error("Too many invalid attempts. Please request a new OTP.");
    }
    await otpDoc.save();
    const remaining = OTP_MAX_ATTEMPTS - otpDoc.attempts;
    throw new Error(`Invalid OTP. ${remaining} attempt(s) remaining.`);
  }

  // SUCCESS: delete the OTP so it can never be reused.
  await Otp.deleteOne({ _id: otpDoc._id });

  user.isVerified = true;

  // Promote super admin if the email matches.
  const isSuperAdmin = user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
  if (isSuperAdmin) {
    user.role = "ADMIN";
  }

  await user.save();
  return user;
}

/**
 * Password login for all users.
 */
export async function loginWithPassword({ email, password }) {
  const cleanEmail = sanitizeEmail(email);
  if (!cleanEmail) throw new Error("Invalid email format.");
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Email and password are required.");
  }

  const user = await User.findOne({ email: cleanEmail }).select("+password");
  if (!user) {
    throw new Error("Invalid credentials.");
  }

  if (!user.isVerified) {
    throw new Error("Account not verified. Please verify your email first.");
  }

  const matches = await user.comparePassword(password);
  if (!matches) {
    throw new Error("Invalid credentials.");
  }

  // Promote super admin.
  if (cleanEmail === SUPER_ADMIN_EMAIL && user.role !== "ADMIN") {
    user.role = "ADMIN";
  }
  user.isVerified = true;
  await user.save();

  return user;
}

/**
 * Backward-compatible resend handler.
 */
export async function resendOtp({ email, userId, ip }) {
  let targetEmail = email;
  if (!targetEmail && userId) {
    const found = await User.findById(userId);
    if (!found) throw new Error("User not found.");
    targetEmail = found.email;
  }
  if (!targetEmail) throw new Error("Email is required.");

  // Reuse the existing user's password so the OTP can be re-sent without the
  // user having to re-enter it (password is required for the request flow).
  const found = await User.findOne({ email: targetEmail }).select("+password");
  if (found?.isVerified) {
    throw new Error("This account is already verified. Sign in with your password.");
  }
  const name = found?.name || "";
  const password = found?.password || "";
  return requestOtp({ email: targetEmail, name, password, ip });
}

export default {
  requestOtp,
  verifyOtp,
  loginWithPassword,
  resendOtp,
  requestPasswordReset,
  resetPassword,
};
