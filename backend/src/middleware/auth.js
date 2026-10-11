import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { verifyAccessToken } from "../services/tokenService.js";
import config from "../config/env.js";
import { beginExecutionPhase } from "../utils/executionPerformance.js";

const JWT_SECRET = config.JWT_SECRET || "challenge-platform-jwt-secret-change-in-production";

export async function authenticate(req, res, next) {
  const finishAuthentication = beginExecutionPhase("AUTH");
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          error: "Invalid authorization header.",
          code: "INVALID_TOKEN",
        });
      }

      const token = authHeader.slice("Bearer ".length);
      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch (error) {
        if (error.message === "Access token expired") {
          return res.status(401).json({
            error: "Token expired.",
            code: "TOKEN_EXPIRED",
          });
        }
        return res.status(401).json({
          error: "Invalid token.",
          code: "INVALID_TOKEN",
        });
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          error: "User not found.",
          code: "USER_NOT_FOUND",
        });
      }
      if (!user.isVerified) {
        return res.status(403).json({
          error: "Account not verified.",
          code: "NOT_VERIFIED",
        });
      }

      req.user = user;
      req.userId = user._id;
      req.tokenPayload = decoded;
      return next();
    }

    return res.status(401).json({
      error: "Please sign in to access the platform.",
      code: "NO_TOKEN",
    });
  } catch (error) {
    return res.status(500).json({ error: "Authentication failed." });
  } finally {
    finishAuthentication();
  }
}

export function requireVerifiedCreator(req, res, next) {
  const tokenType = req.tokenPayload?.type;
  const creatorClaims = req.creatorClaims || req.tokenPayload;

  if (
    !req.user ||
    !req.user.isVerified ||
    !["access", "login"].includes(tokenType) ||
    (creatorClaims && creatorClaims.userId && creatorClaims.userId !== req.userId?.toString()) ||
    (creatorClaims && creatorClaims.email && creatorClaims.email !== req.user.email)
  ) {
    return res.status(403).json({
      error: "A verified creator account is required.",
      code: "VERIFIED_CREATOR_REQUIRED",
    });
  }
  next();
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyAccessToken(token);
    User.findById(decoded.userId)
      .then((user) => {
        if (user) {
          req.user = user;
          req.userId = user._id;
          req.tokenPayload = decoded;
        }
        next();
      })
      .catch(() => next());
  } catch {
    next();
  }
}

export function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "24h" });
}

export function generateOTPToken(userId) {
  return jwt.sign({ userId, purpose: "otp" }, JWT_SECRET, { expiresIn: "10m" });
}

export function verifyApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: "API Key is required.",
    });
  }

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      message: "Invalid API Key.",
    });
  }

  next();
}
