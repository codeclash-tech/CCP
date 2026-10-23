import { createHmac, randomInt, timingSafeEqual } from "crypto";
import CreatorVerificationOtp from "../models/CreatorVerificationOtp.js";
import User from "../models/User.js";
import config from "../config/env.js";
import {
  generateLoginToken,
  verifyAccessToken,
} from "./tokenService.js";
import { sendCreatorVerificationOtp } from "./creatorVerificationEmailService.js";

const otpTtlSeconds = Math.max(60, Number(config.OTP_TTL_SECONDS) || 300);
const otpMaxAttempts = Math.max(1, Number(config.OTP_MAX_ATTEMPTS) || 3);
const resendCooldownSeconds = Math.max(
  1,
  Number(config.OTP_RESEND_COOLDOWN_SECONDS) || 30,
);

function createOtpRepository(maxAttempts) {
  return {
    findByEmail: (email) =>
      CreatorVerificationOtp.findOne({ email }).select("+codeHash").lean(),
    replace: (email, data) =>
      CreatorVerificationOtp.findOneAndUpdate(
        { email },
        { $set: data },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean(),
    incrementAttempts: (id) =>
      CreatorVerificationOtp.updateOne(
        { _id: id, attempts: { $lt: maxAttempts } },
        { $inc: { attempts: 1 } },
      ),
    consume: (record, now) =>
      CreatorVerificationOtp.findOneAndDelete({
        _id: record._id,
        email: record.email,
        codeHash: record.codeHash,
        attempts: { $lt: maxAttempts },
        expiresAt: { $gt: now },
      }).lean(),
  };
}

async function resolveVerifiedUser(email) {
  let user = await User.findOne({ email });
  if (!user) {
    user = new User({
      email,
      name: email.split("@")[0],
      organization: "Unspecified",
      role: "USER",
      isVerified: true,
    });
  } else if (!user.isVerified) {
    user.isVerified = true;
  }

  await user.save();
  return user;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashCode(email, code, secret) {
  return createHmac("sha256", secret)
    .update(`${email}:${code}`)
    .digest("hex");
}

function hashesMatch(expected, actual) {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return (
    expectedBuffer.length === 32 &&
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function createCreatorVerificationService({
  repository: providedRepository,
  sendOtp = sendCreatorVerificationOtp,
  secret = config.JWT_SECRET,
  findOrCreateVerifiedUser = resolveVerifiedUser,
  createLoginToken = generateLoginToken,
  ttlSeconds = otpTtlSeconds,
  maxAttempts = otpMaxAttempts,
  cooldownSeconds = resendCooldownSeconds,
  now = () => new Date(),
  createCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0"),
} = {}) {
  if (!secret) throw new Error("JWT_SECRET must be configured.");
  const otpRepository = providedRepository || createOtpRepository(maxAttempts);

  return {
    async requestOtp(rawEmail) {
      const email = normalizeEmail(rawEmail);
      const current = await otpRepository.findByEmail(email);
      const requestedAt = now();
      if (
        current?.sentAt &&
        requestedAt.getTime() - new Date(current.sentAt).getTime() <
          cooldownSeconds * 1000
      ) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(
            (cooldownSeconds * 1000 -
              (requestedAt.getTime() - new Date(current.sentAt).getTime())) /
              1000,
          ),
        );
        const error = new Error("Please wait before requesting another code.");
        error.status = 429;
        error.retryAfterSeconds = retryAfterSeconds;
        throw error;
      }

      const code = createCode();
      await sendOtp({ email, code, ttlSeconds });

      // Only replace a prior code after delivery succeeds, so a mail failure
      // cannot invalidate the code already in the user's inbox.
      await otpRepository.replace(email, {
        codeHash: hashCode(email, code, secret),
        expiresAt: new Date(requestedAt.getTime() + ttlSeconds * 1000),
        sentAt: requestedAt,
        attempts: 0,
      });
      return { email, expiresInSeconds: ttlSeconds };
    },

    async verifyOtp(rawEmail, rawCode) {
      const email = normalizeEmail(rawEmail);
      const code = String(rawCode || "").trim();
      const verificationTime = now();
      const record = await otpRepository.findByEmail(email);
      if (!record || new Date(record.expiresAt).getTime() <= verificationTime.getTime()) {
        const error = new Error("The code is invalid or has expired.");
        error.status = 400;
        throw error;
      }

      if (record.attempts >= maxAttempts) {
        const error = new Error("No attempts remain. Request a new code.");
        error.status = 429;
        throw error;
      }

      const candidateHash = hashCode(email, code, secret);
      if (!hashesMatch(record.codeHash, candidateHash)) {
        await otpRepository.incrementAttempts(record._id, record.attempts);
        const error = new Error("The code is invalid or has expired.");
        error.status = 400;
        throw error;
      }

      const consumed = await otpRepository.consume(record, verificationTime);
      if (!consumed) {
        const error = new Error("The code is invalid or has expired.");
        error.status = 400;
        throw error;
      }

      const user = await findOrCreateVerifiedUser(email);
      return {
        email,
        token: createLoginToken(
          user._id.toString(),
          user.email,
          user.organization || "Unspecified",
          user.role || "USER",
        ),
      };
    },
  };
}

let creatorVerificationService;

function getCreatorVerificationService() {
  if (!creatorVerificationService) {
    creatorVerificationService = createCreatorVerificationService();
  }
  return creatorVerificationService;
}

export async function requestCreatorOtp(email) {
  return getCreatorVerificationService().requestOtp(email);
}

export async function verifyCreatorOtp(email, code) {
  return getCreatorVerificationService().verifyOtp(email, code);
}

export function getCreatorCredentialClaims(token) {
  if (!token) return null;
  try {
    const claims = verifyAccessToken(token);
    if (
      claims.type !== "login" ||
      !claims.email ||
      !claims.userId ||
      !claims.role
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
