import { getResendClient } from "./resendClient.js";

export async function sendBattleRoomResultEmail({
  email,
  userName,
  roomTitle,
  totalScore,
  totalPassed,
  totalTestCases,
  questionResults = [],
  rank,
  totalParticipants,
  roomCode,
  startTime,
  endTime,
  submissionStatus = "COMPLETED",
  completedAt,
}) {
  try {
    const { resend, from } = getResendClient();

    const passRate =
      totalTestCases > 0 ? Math.round((totalPassed / totalTestCases) * 100) : 0;
    const safeUserName = escapeHtml(userName || "Developer");
    const safeRoomTitle = escapeHtml(roomTitle || "Coding Challenge");
    const safeRoomCode = escapeHtml(roomCode || "");
    const completionDate = formatBattleDate(completedAt);
    const battleStart = formatBattleDate(startTime);
    const battleEnd = formatBattleDate(endTime);
    const safeStatus = escapeHtml(submissionStatus || "COMPLETED");
    const questionResultRows = questionResults.length
      ? questionResults
          .map((question, index) => {
            const questionTitle = escapeHtml(
              question.questionTitle || `Question ${index + 1}`,
            );
            const questionStatus = escapeHtml(question.status || "PENDING");
            const cases = (question.results || [])
              .map((result, resultIndex) => {
                const caseName = result.isHidden
                  ? `Hidden test ${resultIndex + 1}`
                  : `Test ${resultIndex + 1}`;
                return `<tr>
                  <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0;">${caseName}</td>
                  <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(result.status || "PENDING")}</td>
                  <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${Math.max(0, Number(result.executionTime) || 0)} ms</td>
                </tr>`;
              })
              .join("");

            return `<tr>
              <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${index + 1}. ${questionTitle}</strong></td>
              <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0;">${questionStatus}</td>
              <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${Math.round(Number(question.score) || 0)}</td>
              <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${Math.max(0, Number(question.passed) || 0)} / ${Math.max(0, Number(question.total) || 0)}</td>
            </tr>${cases ? `<tr><td colspan="4" style="padding: 0 10px 12px;"><table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #475569;"><thead><tr><th align="left" style="padding: 7px 10px;">Test case</th><th align="left" style="padding: 7px 10px;">Result</th><th align="right" style="padding: 7px 10px;">Time</th></tr></thead><tbody>${cases}</tbody></table></td></tr>` : ""}`;
          })
          .join("")
      : `<tr><td colspan="4" style="padding: 12px 10px; color: #64748b;">No question-level results were recorded.</td></tr>`;

    const downloadInstructions =
      "To download your certificate, sign in to CodeClash, open Joined Rooms, select this battle room, click My Result, and choose Download Certificate.";
    const certificateDeadline = endTime
      ? `Please download your certificate by the battle room end time (${battleEnd}).`
      : "Please download your certificate by the battle room end time shown in the platform.";

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f1f5f9; font-family: Arial, Helvetica, sans-serif; color: #0f172a;">
  <main style="max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
    <header style="padding: 28px 32px; background: #0f172a; color: #ffffff;">
      <p style="margin: 0 0 8px; color: #bfdbfe; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Battle results</p>
      <h1 style="margin: 0; font-size: 26px;">Congratulations, ${safeUserName}!</h1>
      <p style="margin: 10px 0 0; color: #e2e8f0; font-size: 17px;">${safeRoomTitle}</p>
    </header>
    <section style="padding: 24px 32px;">
      <p style="margin: 0 0 20px; color: #475569; line-height: 1.6;">The battle is complete. Here is your final result.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 24px;">
        <tbody>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Battle</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${safeRoomTitle}</strong> (${safeRoomCode})</td></tr>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Final score</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${Math.round(Number(totalScore) || 0)}</strong></td></tr>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Tests passed</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${Math.max(0, Number(totalPassed) || 0)} / ${Math.max(0, Number(totalTestCases) || 0)} (${passRate}%)</td></tr>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Final rank</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">#${Math.max(1, Number(rank) || 1)} of ${Math.max(1, Number(totalParticipants) || 1)}</td></tr>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Completion status</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${safeStatus}</td></tr>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Battle start</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${battleStart}</td></tr>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Battle end</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${battleEnd}</td></tr>
          <tr><td style="padding: 10px; background: #f8fafc;">Completed on</td><td style="padding: 10px;">${completionDate}</td></tr>
        </tbody>
      </table>

      <h2 style="margin: 28px 0 12px; font-size: 19px;">Question results</h2>
      <div style="overflow-x: auto;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 14px;">
          <thead><tr style="background: #f1f5f9; text-align: left;"><th style="padding: 10px;">Question</th><th style="padding: 10px;">Status</th><th style="padding: 10px; text-align: right;">Score</th><th style="padding: 10px; text-align: right;">Tests passed</th></tr></thead>
          <tbody>${questionResultRows}</tbody>
        </table>
      </div>
      <section style="margin-top: 28px; padding: 18px; background: #eff6ff; border-radius: 8px;">
        <h2 style="margin: 0 0 8px; font-size: 17px;">Download your certificate</h2>
        <p style="margin: 0; color: #334155; line-height: 1.6;">${downloadInstructions}</p>
        <p style="margin: 8px 0 0; color: #334155; line-height: 1.6;">${certificateDeadline}</p>
      </section>
    </section>
    <footer style="padding: 16px 32px; color: #64748b; background: #f8fafc; font-size: 12px;">CodeClash &copy; ${new Date().getFullYear()}</footer>
  </main>
</body>
</html>`;

    const textContent = `
CONGRATULATIONS, ${userName || "Developer"}!
Battle: ${roomTitle}
Room code: ${roomCode}
Final score: ${Math.round(Number(totalScore) || 0)}
Tests passed: ${Math.max(0, Number(totalPassed) || 0)} / ${Math.max(0, Number(totalTestCases) || 0)} (${passRate}%)
Final rank: #${Math.max(1, Number(rank) || 1)} of ${Math.max(1, Number(totalParticipants) || 1)}
Completion status: ${submissionStatus || "COMPLETED"}
Battle start: ${battleStart}
Battle end: ${battleEnd}
Completed on: ${completionDate}

QUESTION RESULTS
${questionResults.map((question, index) => {
  const cases = (question.results || [])
    .map((result, resultIndex) =>
      `  ${result.isHidden ? "Hidden test" : "Test"} ${resultIndex + 1}: ${result.status || "PENDING"} (${Math.max(0, Number(result.executionTime) || 0)} ms)`,
    )
    .join("\n");
  return `${index + 1}. ${question.questionTitle || `Question ${index + 1}`} — ${question.status || "PENDING"}, score ${Math.round(Number(question.score) || 0)}, tests passed ${Math.max(0, Number(question.passed) || 0)} / ${Math.max(0, Number(question.total) || 0)}${cases ? `\n${cases}` : ""}`;
}).join("\n")}

DOWNLOAD YOUR CERTIFICATE
${downloadInstructions}
${certificateDeadline}

CodeClash
    `;

    const { data, error } = await resend.emails.send({
      from,
      to: [email],
      subject: `Battle complete: ${roomTitle} - Your results`,
      text: textContent,
      html: htmlContent,
    });

    if (error) {
      console.error("[EmailService] Resend email send failed:", error);
      return { success: false, error: error.message || "Resend email send failed." };
    }

    console.log(
      `[EmailService] Result email sent to ${email}: ${data?.id || "unknown"}`,
    );
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error(
      `[EmailService] Failed to send email to ${email}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

function formatBattleDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default {
  sendBattleRoomResultEmail,
};
