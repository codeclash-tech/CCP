import { BrevoClient } from "@getbrevo/brevo";

export const BREVO_SENDER = {
  name: "CodeClash",
  email: "hellocodeclash@gmail.com",
};

let brevoClient;
let initializedApiKey;

export function getBrevoClient() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured.");
  }

  if (!brevoClient || initializedApiKey !== apiKey) {
    brevoClient = new BrevoClient({ apiKey });
    initializedApiKey = apiKey;
  }

  return brevoClient;
}
