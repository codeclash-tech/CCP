import PDFDocument from "pdfkit";

const PAGE_WIDTH = 900;
const PAGE_HEIGHT = 600;

function normalizedCertificateData(data) {
  const participantName = String(data?.participantName || "").trim();
  const challengeName = String(data?.challengeName || "").trim();
  if (!participantName || !challengeName) {
    throw new Error("Certificate participant and challenge names are required.");
  }

  return {
    participantName: participantName.slice(0, 160),
    challengeName: challengeName.slice(0, 200),
    challengeType: data.challengeType,
    rank: Number.isInteger(Number(data.rank)) && Number(data.rank) > 0
      ? Number(data.rank)
      : null,
    totalParticipants: Math.max(1, Number(data.totalParticipants) || 1),
    score: Number.isFinite(Number(data.score)) ? Number(data.score) : 0,
    completedAt: new Date(data.completedAt || Date.now()),
  };
}

function drawCertificate(document, input) {
  const certificate = normalizedCertificateData(input);
  const dailyChallenge = certificate.challengeType === "DAILY_CHALLENGE";
  const width = document.page.width;
  const height = document.page.height;
  const gradient = document.linearGradient(0, 0, width, height);
  gradient.stop(0, "#07142f");
  gradient.stop(0.5, "#123b8f");
  gradient.stop(1, "#2563eb");
  document.rect(0, 0, width, height).fill(gradient);
  document.roundedRect(30, 30, 840, 540, 15).fill("#ffffff");
  document.roundedRect(46.5, 46.5, 807, 507, 7.5)
    .lineWidth(1.5)
    .stroke("#2563eb");

  document.strokeColor("#2563eb").lineWidth(1.5)
    .moveTo(783.75, 61.5).lineTo(836.25, 61.5)
    .moveTo(836.25, 61.5).lineTo(836.25, 112.5)
    .stroke();
  document.strokeColor("#bfdbfe").lineWidth(0.75)
    .moveTo(795, 69).lineTo(827.25, 69)
    .moveTo(827.25, 69).lineTo(827.25, 101.25)
    .stroke();
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      document.circle(750 + column * 15, 78.75 + row * 15, 1.65).fill("#2563eb");
    }
  }
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      document.circle(772.5 + column * 15, 138.75 + row * 15, 1.125).fill("#93c5fd");
    }
  }

  document.fillColor("#1d4ed8").font("Times-Bold").fontSize(31.5)
    .text("CodeClash", 78.75, 63, { lineBreak: false });
  document.fillColor("#64748b").font("Helvetica-Bold").fontSize(9.75)
    .text(
      dailyChallenge ? "DAILY CHALLENGE CERTIFICATE" : "CERTIFICATE OF EXCELLENCE",
      81,
      104.25,
      { characterSpacing: 1.5, lineBreak: false },
    );
  document.strokeColor("#2563eb").lineWidth(1.125)
    .moveTo(78.75, 127.5).lineTo(262.5, 127.5)
    .stroke();
  document.strokeColor("#bfdbfe").lineWidth(0.75)
    .moveTo(78.75, 132).lineTo(213.75, 132)
    .stroke();
  document.rect(78.75, 126, 24, 3).fill("#2563eb");

  document.fillColor("#94a3b8").font("Times-Roman").fontSize(15)
    .text(
      dailyChallenge ? "Congratulations!" : "This certificate is proudly presented to",
      0,
      176.25,
      { align: "center", width: width, lineBreak: false },
    );
  document.fillColor("#0f172a").font("Times-Bold").fontSize(36)
    .text(certificate.participantName.toUpperCase(), 112.5, 197.25, {
      align: "center",
      width: 675,
      height: 36,
      ellipsis: true,
      lineBreak: false,
    });
  document.strokeColor("#2563eb").lineWidth(0.75)
    .moveTo(250, 243.75).lineTo(650, 243.75)
    .stroke();

  document.fillColor("#64748b").font("Helvetica").fontSize(14.25)
    .text(
      dailyChallenge
        ? "For successfully completing the Daily Challenge"
        : "For successfully competing in the coding battle",
      0,
      270.75,
      { align: "center", width, lineBreak: false },
    );
  document.fillColor("#1e293b").font("Times-Bold").fontSize(22.5)
    .text(certificate.challengeName, 112.5, 292.5, {
      align: "center",
      width: 675,
      height: 42,
      ellipsis: true,
      lineBreak: false,
    });

  document.fillColor("#64748b").font("Helvetica").fontSize(12.75)
    .text(
      dailyChallenge
        ? `Score: ${certificate.score.toFixed(2)}%`
        : "In recognition of your dedication, technical ability, and commitment to excellence",
      0,
      336,
      { align: "center", width, lineBreak: false },
    );
  if (!dailyChallenge) {
    document.text(
      "Your problem-solving and persistence stood out throughout the challenge.",
      0,
      354.75,
      {
        align: "center",
        width,
        lineBreak: false,
      },
    );
  } else {
    document.text(
      "Your focus, persistence, and problem-solving skills made this achievement possible.",
      0,
      354.75,
      { align: "center", width, lineBreak: false },
    );
  }

  document.fillColor("#1d4ed8").font("Helvetica-Bold").fontSize(13.5)
    .text(
      certificate.rank
        ? `FINAL RANK #${certificate.rank} OF ${certificate.totalParticipants}`
        : dailyChallenge
          ? "DAILY CHALLENGE COMPLETION"
          : "DAILY CHALLENGE PARTICIPATION",
      0,
      376.5,
      { align: "center", width, lineBreak: false },
    );
  document.strokeColor("#c9c6c6").lineWidth(0.375)
    .moveTo(112.5, 405).lineTo(787.5, 405)
    .stroke();

  const completedDate = Number.isFinite(certificate.completedAt.getTime())
    ? certificate.completedAt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";
  document.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10.5)
    .text(completedDate, 135, 459, { lineBreak: false });
  document.fillColor("#64748b").font("Helvetica").fontSize(7.5)
    .text("DATE OF COMPLETION", 135, 489.75, { lineBreak: false });

  document.fillColor("#0f172a").font("Times-Italic").fontSize(17.25)
    .text("CodeClash Team", 637.5, 453.75, {
      align: "right",
      width: 127.5,
      lineBreak: false,
    });
  document.strokeColor("#94a3b8").lineWidth(0.375)
    .moveTo(637.5, 480).lineTo(765, 480)
    .stroke();
  document.fillColor("#64748b").font("Helvetica").fontSize(7.5)
    .text("VERIFIED SYSTEM", 637.5, 489.75, {
      align: "right",
      width: 127.5,
      lineBreak: false,
    });

  document.fillColor("#94a3b8").font("Courier").fontSize(10.5)
    .text("CODECLASH • COMPETE • CODE • CONQUER", 0, 519.75, {
      align: "center",
      width,
      lineBreak: false,
    });
}

function createCertificateDocument(data) {
  const document = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margin: 0,
  });
  drawCertificate(document, data);
  return document;
}

export function streamCertificatePdf(data, response) {
  const document = createCertificateDocument(data);
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", 'attachment; filename="codeclash-certificate.pdf"');
  response.setHeader("Cache-Control", "private, no-store");
  document.pipe(response);
  document.end();
}

export function createCertificatePdfBuffer(data) {
  return new Promise((resolve, reject) => {
    let document;
    try {
      document = createCertificateDocument(data);
    } catch (error) {
      reject(error);
      return;
    }
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.end();
  });
}
