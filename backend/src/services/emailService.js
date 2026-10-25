import { getResendClient } from "./resendClient.js";
import { sanitizeEmail } from "./emailDispatchService.js";

export async function sendChallengeCompletionEmail({
  email,
  userName,
  challengeName,
  challengeType,
}) {
  const recipient = sanitizeEmail(email);
  if (!recipient) {
    return { success: false, error: "A valid participant email is required." };
  }
  if (
    typeof challengeName !== "string" ||
    !challengeName.trim() ||
    !["DAILY_CHALLENGE", "BATTLE_ROOM"].includes(challengeType)
  ) {
    return { success: false, error: "A valid completed challenge is required." };
  }

  const safeName = escapeHtml(userName || "there");
  const safeChallengeName = escapeHtml(challengeName.trim());
  const completionLabel =
    challengeType === "DAILY_CHALLENGE" ? "Daily Challenge" : "Battle Room";

  try {
    const { resend, from } = getResendClient();
    const { data, error } = await resend.emails.send({
      from,
      to: [recipient],
      subject: `${completionLabel} completed`,
      text:
        `Congratulations, ${userName || "there"}!\n\n` +
        `You successfully completed ${challengeName.trim()}.\n\n` +
        "Thank you for taking part in CodeClash.",
      html: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:28px 12px;background:#0b1220;font-family:Arial,Helvetica,sans-serif;color:#eaf2ff;">
    <main style="max-width:520px;margin:0 auto;padding:32px 28px;border:1px solid #233957;border-radius:14px;background:#111d2d;">
      <p style="margin:0 0 18px;color:#60a5fa;font-size:12px;font-weight:700;letter-spacing:2px;">CODECLASH</p>
      <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;">Well done, ${safeName}!</h1>
      <p style="margin:0;color:#aebed2;font-size:15px;line-height:1.7;">You successfully completed <strong style="color:#fff;">${safeChallengeName}</strong>.</p>
      <p style="margin:22px 0 0;color:#8498b2;font-size:13px;line-height:1.6;">Thank you for taking part in CodeClash.</p>
    </main>
  </body>
</html>`,
    });

    if (error) {
      console.error("[EmailService] Completion email send failed:", error);
      return { success: false, error: error.message || "Email delivery failed." };
    }

    console.info(`[EmailService] Completion email sent (id=${data?.id || "unknown"}).`);
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("[EmailService] Completion email delivery failed:", error);
    return { success: false, error: error.message || "Email delivery failed." };
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
