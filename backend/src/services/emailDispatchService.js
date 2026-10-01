import config from "../config/env.js";
import { BREVO_SENDER, getBrevoClient } from "./brevoClient.js";

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function sanitizeEmail(email) {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254 || !EMAIL_REGEX.test(trimmed)) return null;
  return trimmed;
}

function createOtpEmailHtml(otpCode, ttlMinutes, emailPurpose) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Your CodeClash verification code</title>
  </head>
  <body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
      <tr>
        <td style="padding:32px 24px;text-align:center;">
          <p style="margin:0 0 8px;color:#2563eb;font-size:14px;font-weight:700;letter-spacing:1px;">CODECLASH</p>
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Your ${emailPurpose} code</h1>
          <p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">Enter this 6-digit code to continue:</p>
          <div style="box-sizing:border-box;margin:24px auto;padding:16px 12px;max-width:320px;border-radius:12px;background:#eff6ff;color:#1d4ed8;font-size:32px;font-weight:700;letter-spacing:8px;overflow-wrap:anywhere;">${otpCode}</div>
          <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.6;">This code expires in ${ttlMinutes} minutes.</p>
          <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">If you did not request this code, you can safely ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendVerificationEmail(
  toEmail,
  otpCode,
  { ttlMinutes = 5, purpose = "register" } = {},
) {
  const cleanEmail = sanitizeEmail(toEmail);
  if (!cleanEmail) {
    console.warn("[EmailDispatch] Rejected invalid email address before dispatch.");
    return { success: false, reason: "INVALID_EMAIL" };
  }
  if (typeof otpCode !== "string" || !/^\d{6}$/.test(otpCode)) {
    console.warn("[EmailDispatch] Rejected invalid verification code.");
    return { success: false, reason: "INVALID_OTP" };
  }

  const isPasswordReset = purpose === "password-reset";
  const isCreatorVerification = purpose === "creator-verification";
  const emailPurpose = isPasswordReset
    ? "password reset"
    : isCreatorVerification
      ? "creator verification"
      : "account verification";
  const safeTtlMinutes =
    Number.isFinite(Number(ttlMinutes)) && Number(ttlMinutes) > 0
      ? Math.ceil(Number(ttlMinutes))
      : 5;

  try {
    const brevo = getBrevoClient();
    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: BREVO_SENDER,
      to: [{ email: cleanEmail }],
      subject: isPasswordReset
        ? "Reset your CodeClash password"
        : isCreatorVerification
          ? "Verify your email to create a CodeClash battle"
          : "Verify your CodeClash account",
      textContent:
        `Your ${emailPurpose} code is: ${otpCode}\n\n` +
        `This code expires in ${safeTtlMinutes} minutes.\n` +
        "If you did not request this code, please ignore this email.\n",
      htmlContent: createOtpEmailHtml(otpCode, safeTtlMinutes, emailPurpose),
    });

    console.log(
      `[EmailDispatch] Verification email sent to ${cleanEmail} (id=${response?.messageId || "unknown"}).`,
    );
    return { success: true, messageId: response?.messageId };
  } catch (error) {
    console.error("[EmailDispatch] Brevo email send failed:", error.message);
    if (config.NODE_ENV !== "production") {
      console.warn(
        `[EmailDispatch][DEV FALLBACK] Email to ${cleanEmail} was not delivered. Verification code: ${otpCode}`,
      );
      return { success: true, devMode: true };
    }

    return { success: false, reason: "BREVO_FAILED" };
  }
}

export async function sendOtpEmail({
  email,
  otp,
  ttlMinutes,
  purpose = "register",
}) {
  return sendVerificationEmail(email, otp, { ttlMinutes, purpose });
}

export default {
  sendOtpEmail,
  sendVerificationEmail,
  sanitizeEmail,
};
