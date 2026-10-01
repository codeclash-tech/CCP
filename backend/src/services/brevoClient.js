export const BREVO_SENDER = {
  name: "CodeClash",
  email: "hellocodeclash@gmail.com",
};

/**
 * Robust native HTTP wrapper for Brevo API v3
 * Fixes the "undefined" instance bindings and plays perfectly with fetch tests.
 */
export function getBrevoClient() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured.");
  }

  return {
    sendTransacEmail: async (smtpEmailPayload) => {
      const response = await fetch("https://brevo.com", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(smtpEmailPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Status code: ${response.status} Body: ${errorText}`);
      }

      const bodyData = await response.json();
      return { body: bodyData };
    },
  };
}
