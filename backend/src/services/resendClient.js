import { Resend } from "resend";

export const RESEND_FROM = "CodeClash <onboarding@resend.dev>";

let resendClient;
let initializedApiKey;

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!resendClient || initializedApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    initializedApiKey = apiKey;
  }

  return resendClient;
}
