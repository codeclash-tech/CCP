import PDFDocument from "pdfkit";

const CATEGORY_LABELS = {
  WINNER: "Daily Challenge Winner",
  RUNNER_UP: "Daily Challenge Runner-up",
  SECOND_RUNNER_UP: "Daily Challenge Second Runner-up",
  PARTICIPATION: "Congratulations on Completing the Daily Challenge",
  ORGANIZATION_WINNER: "Organization Winner",
  ORGANIZATION_RUNNER_UP: "Organization Runner-up",
  ORGANIZATION_SECOND_RUNNER_UP: "Organization Second Runner-up",
};

export function streamWeeklyCertificate(certificate, response) {
  if (!certificate?.snapshot || !certificate.certificateId) {
    throw new Error("Finalized daily certificate snapshot is incomplete.");
  }
  const { snapshot } = certificate;
  const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 48 });
  const filename = `${certificate.certificateId}.pdf`;
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Cache-Control", "private, no-store");
  document.pipe(response);

  const width = document.page.width;
  const height = document.page.height;
  document.rect(0, 0, width, height).fill("#07142f");
  document.roundedRect(30, 30, width - 60, height - 60, 12)
    .lineWidth(2).fillAndStroke("#ffffff", "#2563eb");
  document.fillColor("#1d4ed8").font("Helvetica-Bold").fontSize(24)
    .text("CodeClash", 55, 62, { align: "center" });
  document.fillColor("#0f172a").font("Helvetica-Bold").fontSize(32)
    .text("Congratulations!", 60, 120, {
      align: "center",
      width: width - 120,
      ellipsis: true,
    });
  document.fillColor("#334155").font("Helvetica-Bold").fontSize(18)
    .text(CATEGORY_LABELS[certificate.category] || "Daily Challenge Certificate", 60, 168, {
      align: "center",
      width: width - 120,
      ellipsis: true,
    });
  document.fillColor("#334155").font("Helvetica").fontSize(15)
    .text("This certificate is awarded to", 70, 210, { align: "center", width: width - 140 });
  document.fillColor("#1d4ed8").font("Helvetica-Bold").fontSize(30)
    .text(snapshot.subjectName, 70, 242, {
      align: "center",
      width: width - 140,
      height: 42,
      ellipsis: true,
    });
  document.fillColor("#334155").font("Helvetica").fontSize(14)
    .text(`${snapshot.assessmentName}  |  Challenge date: ${snapshot.cycleKey}`, 70, 310, {
      align: "center",
      width: width - 140,
    });
  const rankLabel =
    Number.isFinite(Number(snapshot.rank)) && Number(snapshot.rank) > 0
      ? `Rank #${snapshot.rank}`
      : "Participation";
  document.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18)
    .text(
      `${rankLabel}  |  Score: ${Number(snapshot.score).toFixed(2)}`,
      70,
      355,
      {
        align: "center",
        width: width - 140,
      },
    );
  if (snapshot.organizationName && certificate.type === "INDIVIDUAL") {
    document.fillColor("#475569").font("Helvetica").fontSize(13)
      .text(`Organization: ${snapshot.organizationName}`, 70, 395, {
        align: "center",
        width: width - 140,
      });
  }
  document.fillColor("#64748b").font("Helvetica").fontSize(10)
    .text(`Certificate ID: ${certificate.certificateId}`, 70, 445, {
      align: "center",
      width: width - 140,
    });
  document.text(`Issued ${new Date(snapshot.issuedAt).toISOString().slice(0, 10)}`, 70, 465, {
    align: "center",
    width: width - 140,
  });
  document.end();
}
