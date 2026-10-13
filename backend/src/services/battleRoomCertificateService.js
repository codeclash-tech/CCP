import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";
import config from "../config/env.js";

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
    rank: Math.max(1, Number(data.rank) || 1),
    totalParticipants: Math.max(1, Number(data.totalParticipants) || 1),
    totalScore: Math.max(0, Number(data.totalScore) || 0),
    completedAt: new Date(data.completedAt || Date.now()).toISOString(),
  };
}

export function createBattleRoomCertificateUrl(data) {
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
  const defaultBaseUrl = config.NODE_ENV === "production"
    ? `${config.CLIENT_URL}/api`
    : `http://localhost:${config.PORT}/api`;
  const baseUrl = String(config.API_PUBLIC_URL || defaultBaseUrl).replace(/\/+$/, "");
  return `${baseUrl}/battle-rooms/certificate/${token}`;
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
  const document = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 48,
  });
  const filename = `codeclash-certificate-${certificate.roomCode.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;

  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Cache-Control", "private, no-store");
  document.pipe(response);

  const pageWidth = document.page.width;
  const pageHeight = document.page.height;
  document.rect(0, 0, pageWidth, pageHeight).fill("#07142f");
  document
    .roundedRect(30, 30, pageWidth - 60, pageHeight - 60, 12)
    .lineWidth(2)
    .fillAndStroke("#ffffff", "#2563eb");
  document
    .fillColor("#1d4ed8")
    .font("Helvetica-Bold")
    .fontSize(24)
    .text("CodeClash", 55, 64, { align: "center" });
  document
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(12)
    .text("CODING BATTLE", 55, 105, { align: "center", characterSpacing: 2 });
  document
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(34)
    .text("Certificate of Completion", 55, 145, { align: "center" });
  document
    .fillColor("#475569")
    .font("Helvetica")
    .fontSize(14)
    .text("This certificate is presented to", 70, 210, {
      align: "center",
      width: pageWidth - 140,
    });
  document
    .fillColor("#1d4ed8")
    .font("Helvetica-Bold")
    .fontSize(30)
    .text(certificate.participantName, 70, 242, {
      align: "center",
      width: pageWidth - 140,
      height: 42,
      ellipsis: true,
    });
  document
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(15)
    .text("for successfully completing the CodeClash battle", 70, 300, {
      align: "center",
      width: pageWidth - 140,
    });
  document
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(21)
    .text(certificate.roomTitle, 70, 335, {
      align: "center",
      width: pageWidth - 140,
      height: 55,
      ellipsis: true,
    });
  document
    .fillColor("#334155")
    .font("Helvetica")
    .fontSize(13)
    .text(
      `Rank #${certificate.rank} of ${certificate.totalParticipants}  |  Score: ${Math.round(certificate.totalScore)}  |  Room: ${certificate.roomCode}`,
      70,
      408,
      { align: "center", width: pageWidth - 140 },
    );
  document
    .fillColor("#64748b")
    .fontSize(10)
    .text(
      `Completed on ${new Date(certificate.completedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })} (UTC)`,
      70,
      445,
      { align: "center", width: pageWidth - 140 },
    );
  document
    .strokeColor("#cbd5e1")
    .moveTo(100, 500)
    .lineTo(pageWidth - 100, 500)
    .stroke();
  document
    .fillColor("#64748b")
    .fontSize(10)
    .text("CODE • COMPETE • CONQUER", 70, 516, {
      align: "center",
      width: pageWidth - 140,
      characterSpacing: 1,
    });
  document.end();
}
