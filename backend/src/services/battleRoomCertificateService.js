import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";
import sharp from "sharp";
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
  const token = createBattleRoomCertificateToken(data);
  return `${getCertificateBaseUrl()}/battle-rooms/certificate/${token}`;
}

export function createBattleRoomCertificateImageUrl(data) {
  const token = createBattleRoomCertificateToken(data);
  return `${getCertificateBaseUrl()}/battle-rooms/certificate-image/${token}`;
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

function getCertificateBaseUrl() {
  const defaultBaseUrl = config.NODE_ENV === "production"
    ? `${config.CLIENT_URL}/api`
    : `http://localhost:${config.PORT}/api`;
  return String(config.API_PUBLIC_URL || defaultBaseUrl).replace(/\/+$/, "");
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

export async function streamBattleRoomCertificateImage(token, response) {
  const certificate = verifyCertificateToken(token);
  const image = await createBattleRoomCertificatePng(certificate);
  response.setHeader("Content-Type", "image/png");
  response.setHeader("Content-Disposition", "inline");
  response.setHeader("Cache-Control", "private, no-store");
  response.send(image);
}

export function createBattleRoomCertificatePng(data) {
  return sharp(Buffer.from(createBattleRoomCertificateSvg(data)))
    .png()
    .toBuffer();
}

export function createBattleRoomCertificateSvg(data) {
  const certificate = normalizedCertificateData(data);
  const participantName = escapeXml(certificate.participantName.toUpperCase());
  const roomTitle = escapeXml(certificate.roomTitle);
  const completedDate = escapeXml(
    new Date(certificate.completedAt).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07142f"/><stop offset=".5" stop-color="#123b8f"/><stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#background)"/>
  <rect x="40" y="40" width="1120" height="720" rx="20" fill="#fff"/>
  <rect x="62" y="62" width="1076" height="676" rx="10" fill="none" stroke="#2563eb" stroke-width="2"/>
  <path d="M1045 82h70v68M1060 92h43v43" fill="none" stroke="#2563eb" stroke-width="2"/>
  <g fill="#2563eb">${Array.from({ length: 20 }, (_, index) => {
    const x = 1000 + (index % 5) * 20;
    const y = 105 + Math.floor(index / 5) * 20;
    return `<circle cx="${x}" cy="${y}" r="2.2"/>`;
  }).join("")}</g>
  <text x="105" y="125" fill="#1d4ed8" font-family="Georgia,serif" font-size="42" font-weight="700">CodeClash</text>
  <text x="108" y="151" fill="#64748b" font-family="Arial,sans-serif" font-size="13" font-weight="600" letter-spacing="2">CERTIFICATE OF EXCELLENCE</text>
  <path d="M105 170h245M105 176h180" stroke="#2563eb" stroke-width="1.5"/>
  <path d="M105 170h32" stroke="#2563eb" stroke-width="4"/>
  <text x="600" y="255" text-anchor="middle" fill="#94a3b8" font-family="Georgia,serif" font-size="20">This certificate is proudly presented to</text>
  <text x="600" y="310" text-anchor="middle" fill="#0f172a" font-family="Georgia,serif" font-size="48" font-weight="700" textLength="700" lengthAdjust="spacingAndGlyphs">${participantName}</text>
  <path d="M250 325h700" stroke="#2563eb"/>
  <text x="600" y="380" text-anchor="middle" fill="#64748b" font-family="Arial,sans-serif" font-size="19">For successfully competing in the coding battle</text>
  <text x="600" y="420" text-anchor="middle" fill="#1e293b" font-family="Georgia,serif" font-size="30" font-weight="700" textLength="700" lengthAdjust="spacingAndGlyphs">${roomTitle}</text>
  <text x="600" y="465" text-anchor="middle" fill="#64748b" font-family="Arial,sans-serif" font-size="17">In recognition of your dedication, technical ability and commitment</text>
  <text x="600" y="490" text-anchor="middle" fill="#64748b" font-family="Arial,sans-serif" font-size="17">demonstrated throughout the challenge.</text>
  <text x="600" y="520" text-anchor="middle" fill="#1d4ed8" font-family="Arial,sans-serif" font-size="18" font-weight="700">FINAL RANK #${certificate.rank} OF ${certificate.totalParticipants}</text>
  <path d="M150 540h900M150 650h900" stroke="#c9c6c6" stroke-width=".5"/>
  <text x="180" y="635" fill="#0f172a" font-family="Arial,sans-serif" font-size="14" font-weight="700">${completedDate}</text>
  <text x="180" y="655" fill="#64748b" font-family="Arial,sans-serif" font-size="10">DATE OF COMPLETION</text>
  <text x="1020" y="635" text-anchor="end" fill="#0f172a" font-family="cursive" font-size="23" font-style="italic">CodeClash Team</text>
  <path d="M850 652h170" stroke="#94a3b8" stroke-width=".5"/>
  <text x="1020" y="655" text-anchor="end" fill="#64748b" font-family="Arial,sans-serif" font-size="10">VERIFIED SYSTEM</text>
  <text x="600" y="695" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="14">CODECLASH • COMPETE • CODE • CONQUER</text>
</svg>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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
