import jwt from "jsonwebtoken";
import config from "../config/env.js";
import { streamCertificatePdf } from "./certificatePdfService.js";

const CERTIFICATE_AUDIENCE = "codeclash-battle-certificate";
const CERTIFICATE_TOKEN_LIFETIME = "1y";

function normalizedCertificateData(data) {
  const requiredText = ["participantName", "roomTitle", "roomCode"];
  for (const field of requiredText) {
    if (!String(data?.[field] || "").trim()) {
      throw new Error(`Certificate ${field} is required.`);
    }
  }

  return {
    participantName: String(data.participantName).trim().slice(0, 160),
    roomTitle: String(data.roomTitle).trim().slice(0, 200),
    roomCode: String(data.roomCode).trim().slice(0, 32),
    certificateId: String(data.certificateId || "").trim().slice(0, 80),
    rank: Math.max(1, Number(data.rank) || 1),
    totalParticipants: Math.max(1, Number(data.totalParticipants) || 1),
    totalScore: Math.max(0, Number(data.totalScore) || 0),
    completedAt: new Date(data.completedAt || Date.now()).toISOString(),
  };
}

export function createBattleRoomCertificateUrl(data) {
  const token = createBattleRoomCertificateToken(data);
  return `${getCertificateBaseUrl()}/battle-rooms/certificate/${token}`;
}

function getCertificateBaseUrl() {
  const defaultBaseUrl = config.NODE_ENV === "production"
    ? `${config.CLIENT_URL}/api`
    : `http://localhost:${config.PORT}/api`;
  return String(config.API_PUBLIC_URL || defaultBaseUrl).replace(/\/+$/, "");
}

function createBattleRoomCertificateToken(data) {
  if (!config.JWT_SECRET) {
    throw new Error("JWT_SECRET is required to create certificate links.");
  }
  const certificate = normalizedCertificateData(data);
  const token = jwt.sign(
    { ...certificate, type: "battle-room-certificate" },
    config.JWT_SECRET,
    {
      audience: CERTIFICATE_AUDIENCE,
      issuer: config.JWT_ISSUER,
      expiresIn: CERTIFICATE_TOKEN_LIFETIME,
    },
  );
  return token;
}

function verifyCertificateToken(token) {
  const payload = jwt.verify(token, config.JWT_SECRET, {
    audience: CERTIFICATE_AUDIENCE,
    issuer: config.JWT_ISSUER,
  });
  if (!payload || typeof payload !== "object" || payload.type !== "battle-room-certificate") {
    throw new Error("Invalid certificate link.");
  }
  return normalizedCertificateData(payload);
}

export function streamBattleRoomCertificate(token, response) {
  const certificate = verifyCertificateToken(token);
  streamBattleRoomCertificateData(certificate, response);
}

export function streamBattleRoomCertificateData(data, response) {
  const certificate = normalizedCertificateData(data);
  streamCertificatePdf({
    challengeType: "BATTLE_ROOM",
    participantName: certificate.participantName,
    challengeName: certificate.roomTitle,
    rank: certificate.rank,
    totalParticipants: certificate.totalParticipants,
    completedAt: certificate.completedAt,
  }, response);
}
