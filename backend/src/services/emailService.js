import { getResendClient } from "./resendClient.js";

export async function sendBattleRoomResultEmail({
  email,
  userName,
  roomTitle,
  totalScore,
  totalPassed,
  totalTestCases,
  rank,
  totalParticipants,
  roomCode,
  startTime,
  endTime,
  timeZone = "UTC",
  submissionStatus = "COMPLETED",
  completedAt,
  certificateImageUrl,
}) {
  try {
    const { resend, from } = getResendClient();

    const passRate =
      totalTestCases > 0 ? Math.round((totalPassed / totalTestCases) * 100) : 0;
    const safeUserName = escapeHtml(userName || "Developer");
    const safeRoomTitle = escapeHtml(roomTitle || "Coding Challenge");
    const safeRoomCode = escapeHtml(roomCode || "");
    const completionDate = formatBattleDate(completedAt, timeZone);
    const battleStart = formatBattleDate(startTime, timeZone);
    const battleEnd = formatBattleDate(endTime, timeZone);
    const safeStatus = escapeHtml(submissionStatus || "COMPLETED");
    const certificateImage = certificateImageUrl
      ? `<img src="${escapeHtml(certificateImageUrl)}" alt="CodeClash certificate for ${safeUserName}" width="100%" style="display: block; width: 100%; max-width: 680px; height: auto; border: 0; border-radius: 8px;">`
      : "";

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

      ${certificateImage ? `<section style="margin-top: 28px;"><h2 style="margin: 0 0 12px; font-size: 17px;">Your certificate</h2>${certificateImage}</section>` : ""}
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

function formatBattleDate(value, timeZone = "UTC") {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
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
