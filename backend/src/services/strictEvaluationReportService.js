import LearningStrictAttempt from "../models/LearningStrictAttempt.js";
import LearningModule from "../models/LearningModule.js";
import User from "../models/User.js";
import { getResendClient } from "./resendClient.js";
import { sanitizeEmail } from "./emailDispatchService.js";

const STALE_DELIVERY_MS = 10 * 60 * 1000;
const MAX_EMAIL_LENGTH = 5000;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function listHtml(items) {
  const clean = (items || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!clean.length) return '<p style="color:#94a3b8;">—</p>';
  return `<ul style="margin:6px 0;padding-left:18px;color:#eaf2ff;">${clean
    .map((item) => `<li style="margin:2px 0;">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

/**
 * Send the individual Strict Evaluation report to the student's registered
 * email. Claim-based so concurrent dispatches do not double-send, and the
 * result is recorded on the attempt (reportEmailStatus). Self Evaluation
 * never calls this service.
 */
export async function dispatchStrictEvaluationReportEmail(attemptId) {
  const claimed = await LearningStrictAttempt.findOneAndUpdate(
    {
      _id: attemptId,
      status: "COMPLETED",
      result: { $ne: null },
      reportEmailStatus: "PENDING",
    },
    { $set: { reportEmailStatus: "SENT" } },
    { new: true },
  ).lean();
  if (!claimed) return false;

  try {
    const [student, moduleDoc] = await Promise.all([
      User.findById(claimed.userId).select("name email").lean(),
      LearningModule.findById(claimed.moduleId).select("title").lean(),
    ]);
    const recipient = sanitizeEmail(student?.email);
    const result = claimed.result || {};
    if (!recipient || !moduleDoc?.title) {
      await LearningStrictAttempt.updateOne(
        { _id: attemptId },
        { $set: { reportEmailStatus: "FAILED" } },
      );
      return false;
    }

    const safeName = escapeHtml(student.name || "there");
    const safeModule = escapeHtml(moduleDoc.title);
    const { resend, from } = getResendClient();
    const text =
      `Hi ${student.name || "there"},\n\n` +
      `Your Strict Evaluation report for "${moduleDoc.title}" is ready.\n\n` +
      `Overall knowledge level: ${result.overallLevel}\n` +
      `Score: ${result.scorePercent}%\n\n` +
      (result.strengths?.length
        ? `Strengths: ${result.strengths.join("; ")}\n`
        : "") +
      (result.weaknesses?.length
        ? `Weaknesses: ${result.weaknesses.join("; ")}\n`
        : "") +
      (result.knowledgeGaps?.length
        ? `Knowledge gaps: ${result.knowledgeGaps.join("; ")}\n`
        : "") +
      (result.improvementSuggestions?.length
        ? `\nSuggestions:\n${result.improvementSuggestions.map((item) => `- ${item}`).join("\n")}\n`
        : "") +
      `\n${result.appreciation || ""}\n\n` +
      "The full report is also available in your assessment history on CodeClash.\n";
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:28px 12px;background:#0b1220;font-family:Arial,Helvetica,sans-serif;color:#eaf2ff;">
  <main style="max-width:560px;margin:0 auto;padding:32px 28px;border:1px solid #233957;border-radius:14px;background:#111d2d;">
    <p style="margin:0 0 18px;color:#60a5fa;font-size:12px;font-weight:700;letter-spacing:2px;">CODECLASH · STRICT EVALUATION REPORT</p>
    <h1 style="margin:0 0 8px;font-size:22px;">${safeModule}</h1>
    <p style="margin:0 0 18px;color:#94a3b8;">Hi ${safeName}, here is your evaluation result.</p>
    <div style="display:flex;gap:12px;margin:0 0 20px;">
      <div style="flex:1;padding:14px;border-radius:10px;background:#0b1a2e;border:1px solid #233957;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">OVERALL LEVEL</p>
        <p style="margin:4px 0 0;font-size:18px;font-weight:700;">${escapeHtml(result.overallLevel)}</p>
      </div>
      <div style="flex:1;padding:14px;border-radius:10px;background:#0b1a2e;border:1px solid #233957;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">SCORE</p>
        <p style="margin:4px 0 0;font-size:18px;font-weight:700;">${Number(result.scorePercent) || 0}%</p>
      </div>
    </div>
    ${
      (result.objectiveResults || []).length
        ? `<h2 style="margin:0 0 6px;font-size:15px;">Objective-wise performance</h2>${(
            result.objectiveResults || []
          )
            .slice(0, 20)
            .map(
              (entry) =>
                `<div style="padding:10px 12px;margin:6px 0;border-radius:8px;background:#0b1a2e;border:1px solid #1d2f4a;"><strong>${escapeHtml(entry.objectiveTitle || entry.objectiveKey)}</strong><span style="color:#94a3b8;"> — ${escapeHtml(entry.level)} (${Number(entry.scorePercent) || 0}%)</span></div>`,
            )
            .join("")}`
        : ""
    }
    <h2 style="margin:16px 0 4px;font-size:15px;">Strengths</h2>${listHtml(result.strengths)}
    <h2 style="margin:12px 0 4px;font-size:15px;">Weaknesses</h2>${listHtml(result.weaknesses)}
    <h2 style="margin:12px 0 4px;font-size:15px;">Knowledge gaps</h2>${listHtml(result.knowledgeGaps)}
    ${
      (result.misconceptions || []).length
        ? `<h2 style="margin:12px 0 4px;font-size:15px;">Common misconceptions</h2>${listHtml(result.misconceptions)}`
        : ""
    }
    <h2 style="margin:12px 0 4px;font-size:15px;">Improvement suggestions</h2>${listHtml(result.improvementSuggestions)}
    ${
      (result.appreciation || "").trim()
        ? `<div style="margin:16px 0 0;padding:14px;border-radius:10px;background:#0b2b1e;border:1px solid #1d4a35;color:#a7f3d0;">${escapeHtml(result.appreciation)}</div>`
        : ""
    }
  </main>
</body></html>`;

    const { data, error } = await resend.emails.send({
      from,
      to: [recipient],
      subject: `Your Strict Evaluation report — ${moduleDoc.title}`,
      text: text.slice(0, MAX_EMAIL_LENGTH * 4),
      html: html.slice(0, 60000),
    });
    if (error) throw new Error(error.message || "Email delivery failed.");
    return Boolean(data?.id);
  } catch (error) {
    console.error("[StrictReportEmail] Delivery failed:", error.message);
    await LearningStrictAttempt.updateOne(
      { _id: attemptId, reportEmailStatus: "SENT" },
      { $set: { reportEmailStatus: "FAILED" } },
    ).catch(() => {});
    return false;
  }
}

export default dispatchStrictEvaluationReportEmail;
