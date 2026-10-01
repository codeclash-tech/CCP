import "dotenv/config";
import { getResendClient } from "../services/resendClient.js";

console.log("=== RESEND CONNECTION TEST ===");

try {
  const resend = getResendClient();
  const { data, error } = await resend.domains.list();
  if (error) throw new Error(error.message || "Resend API request failed.");

  console.log("RESEND API CONNECTION: verified");
  console.log("Domains available:", data?.data?.length ?? 0);
} catch (error) {
  console.error("RESEND API CONNECTION: failed:", error.message);
  process.exitCode = 1;
}
