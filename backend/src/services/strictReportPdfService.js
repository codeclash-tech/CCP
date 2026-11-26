import PDFDocument from "pdfkit";
import LearningStrictAttempt from "../models/LearningStrictAttempt.js";
import LearningModule from "../models/LearningModule.js";
import User from "../models/User.js";

function writeList(doc, items) {
  const clean = (items || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!clean.length) {
    doc.font("Helvetica").fontSize(10).fillColor("#64748b").text("—");
    return;
  }
  doc.font("Helvetica").fontSize(10.5).fillColor("#1e293b").list(clean);
}

/**
 * Downloadable PDF report for one completed Strict Evaluation attempt.
 * Only the owner of the attempt may download it.
 */
export async function buildAttemptReportPdf(userId, attemptId) {
  const attempt = await LearningStrictAttempt.findOne({
    _id: attemptId,
    userId,
    status: "COMPLETED",
    result: { $ne: null },
  }).lean();
  if (!attempt) {
    const error = new Error("Evaluation report not found.");
    error.statusCode = 404;
    throw error;
  }
  const [student, moduleDoc] = await Promise.all([
    User.findById(attempt.userId).select("name email").lean(),
    LearningModule.findById(attempt.moduleId).select("title").lean(),
  ]);
  const result = attempt.result || {};

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 54 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#2563eb")
      .text("COGNICLASH · AN AMUX PRODUCT", { characterSpacing: 2 });
    doc.move(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#0f172a")
      .text(moduleDoc?.title || "Evaluation report");
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor("#475569")
      .text(
        `Evaluation report for ${student?.name || "participant"} · ${new Date(
          attempt.completedAt || Date.now(),
        ).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })}`,
      );
    doc.move(0.8);
    doc
      .moveTo(doc.x, doc.y)
      .lineTo(541, doc.y)
      .lineWidth(0.8)
      .strokeColor("#e2e8f0")
      .stroke();
    doc.move(1);

    // Summary boxes
    const boxTop = doc.y;
    doc.rect(54, boxTop, 220, 62).fillAndStroke("#eff6ff", "#bfdbfe");
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#2563eb")
      .text("OVERALL LEVEL", 66, boxTop + 12, { characterSpacing: 1 });
    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor("#0f172a")
      .text(result.overallLevel || "—", 66, boxTop + 28);

    doc.rect(322, boxTop, 219, 62).fillAndStroke("#f0fdf4", "#bbf7d0");
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#16a34a")
      .text("SCORE", 334, boxTop + 12, { characterSpacing: 1 });
    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor("#0f172a")
      .text(`${Number(result.scorePercent) || 0}%`, 334, boxTop + 28);
    doc.y = boxTop + 80;

    const section = (title) => {
      doc.move(0.8);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text(title);
      doc.move(0.2);
    };

    if (result.objectiveResults?.length) {
      section("Objective-wise performance");
      for (const entry of result.objectiveResults.slice(0, 20)) {
        doc
          .font("Helvetica")
          .fontSize(10.5)
          .fillColor("#1e293b")
          .text(
            `• ${entry.objectiveTitle || entry.objectiveKey} — ${
              entry.level || ""
            } (${Number(entry.scorePercent) || 0}%)`,
          );
      }
    }

    if (result.strengths?.length) {
      section("Strengths");
      writeList(doc, result.strengths);
    }
    if (result.weaknesses?.length) {
      section("Weaknesses");
      writeList(doc, result.weaknesses);
    }
    if (result.knowledgeGaps?.length) {
      section("Knowledge gaps");
      writeList(doc, result.knowledgeGaps);
    }
    if (result.misconceptions?.length) {
      section("Common misconceptions");
      writeList(doc, result.misconceptions);
    }
    if (result.improvementSuggestions?.length) {
      section("Improvement suggestions");
      writeList(doc, result.improvementSuggestions);
    }
    if ((result.appreciation || "").trim()) {
      doc.move(0.6);
      doc.rect(54, doc.y, 487, 34).fillAndStroke("#f0fdf4", "#bbf7d0");
      doc
        .font("Helvetica")
        .fontSize(10.5)
        .fillColor("#166534")
        .text(result.appreciation, 64, doc.y + 10, {
          width: 467,
        });
    }

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(
        "CogniClash is a product of AMUX. This report is generated from the evaluation data available at the time of submission.",
        54,
        780,
        { width: 487 },
      );

    doc.end();
  });
}
