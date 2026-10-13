import { getResendClient } from "./resendClient.js";
import config from "../config/env.js";

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
  submissionStatus,
  completedAt,
}) {
  try {
    const requiredText = {
      email,
      userName,
      roomTitle,
      roomCode,
      submissionStatus,
    };
    for (const [field, value] of Object.entries(requiredText)) {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Battle result email ${field} is required.`);
      }
    }
    for (const [field, value] of Object.entries({
      totalScore,
      totalPassed,
      totalTestCases,
      rank,
      totalParticipants,
    })) {
      const minimum = ["rank", "totalParticipants"].includes(field) ? 1 : 0;
      if (!Number.isFinite(value) || value < minimum) {
        throw new Error(`Battle result email ${field} must be a valid number.`);
      }
    }
    if (!Number.isFinite(new Date(completedAt).getTime())) {
      throw new Error("Battle result email completion date is required.");
    }

    const { resend, from } = getResendClient();

    const passRate =
      totalTestCases > 0 ? Math.round((totalPassed / totalTestCases) * 100) : 0;
    const safeUserName = escapeHtml(userName);
    const safeRoomTitle = escapeHtml(roomTitle);
    const safeRoomCode = escapeHtml(roomCode);
    const completionDate = formatBattleDate(completedAt, timeZone);
    const battleStart = formatOptionalBattleDate(startTime, timeZone);
    const battleEnd = formatOptionalBattleDate(endTime, timeZone);
    const safeStatus = escapeHtml(submissionStatus);
    const platformUrl = `${String(config.CLIENT_URL).replace(/\/+$/, "")}/battle-room`;
    const safePlatformUrl = escapeHtml(platformUrl);
    const startRow = battleStart
      ? `<tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Battle start</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(battleStart)}</td></tr>`
      : "";
    const endRow = battleEnd
      ? `<tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Battle end</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(battleEnd)}</td></tr>`
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
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Final score</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${formatNumber(totalScore)}</strong></td></tr>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Tests passed</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${formatNumber(totalPassed)} / ${formatNumber(totalTestCases)} (${passRate}%)</td></tr>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Final rank</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">#${formatNumber(rank)} of ${formatNumber(totalParticipants)}</td></tr>
          <tr><td style="padding: 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Completion status</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${safeStatus}</td></tr>
          ${startRow}
          ${endRow}
          <tr><td style="padding: 10px; background: #f8fafc;">Completed on</td><td style="padding: 10px;">${completionDate}</td></tr>
        </tbody>
      </table>

      <section style="margin-top: 28px; padding: 18px; background: #eff6ff; border-radius: 8px; color: #334155; line-height: 1.6;">
        <p style="margin: 0 0 10px;">Open the <a href="${safePlatformUrl}" style="color: #1d4ed8;">CodeClash platform</a> and go to the <strong>Battle Room</strong> page.</p>
        <p style="margin: 0 0 10px;">Click the <strong>Joined Rooms</strong> tab to find your joined battles.</p>
        <p style="margin: 0 0 10px;">Select the relevant battle room to view the leaderboard.</p>
        <p style="margin: 0 0 10px;">From the leaderboard, you can download your certificate.</p>
        <p style="margin: 0;"><strong>Please download your certificate before the battle room is deleted.</strong></p>
      </section>
    </section>
    <footer style="padding: 16px 32px; color: #64748b; background: #f8fafc; font-size: 12px;">CodeClash &copy; ${new Date().getFullYear()}</footer>
  </main>
</body>
</html>`;

    const textContent = `
CONGRATULATIONS, ${userName}!
Battle: ${roomTitle}
Room code: ${roomCode}
Final score: ${formatNumber(totalScore)}
Tests passed: ${formatNumber(totalPassed)} / ${formatNumber(totalTestCases)} (${passRate}%)
Final rank: #${formatNumber(rank)} of ${formatNumber(totalParticipants)}
Completion status: ${submissionStatus}
${battleStart ? `Battle start: ${battleStart}` : ""}
${battleEnd ? `Battle end: ${battleEnd}` : ""}
Completed on: ${completionDate}

Open the CodeClash platform and go to the Battle Room page.
Click the Joined Rooms tab to find your joined battles.
Select the relevant battle room to view the leaderboard.
From the leaderboard, you can download your certificate.
Please download your certificate before the battle room is deleted.

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

function formatOptionalBattleDate(value, timeZone = "UTC") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
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

function formatBattleDate(value, timeZone) {
  return formatOptionalBattleDate(value, timeZone);
}

function formatNumber(value) {
  return String(value);
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
