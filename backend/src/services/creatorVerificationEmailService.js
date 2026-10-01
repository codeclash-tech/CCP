import { sendVerificationEmail } from "./emailDispatchService.js";

export async function sendCreatorVerificationOtp({ email, code, ttlSeconds }) {
  const minutes = Math.max(1, Math.ceil(ttlSeconds / 60));
  const result = await sendVerificationEmail(email, code, {
    ttlMinutes: minutes,
    purpose: "creator-verification",
  });
  if (!result.success) {
    throw new Error("Creator verification email could not be delivered.");
  }
  return result;
}
