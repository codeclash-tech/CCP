export const BREVO_SENDER = {
  name: "CodeClash",
  email: "hellocodeclash@gmail.com",
};

/**
 * Native HTTP client for Brevo transactional emails
 * Bypasses buggy SDK classes and functions natively with test mock fetch wrappers
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
      // Wraps the native messageId property expected by the platform controllers
      return { body: bodyData };
    },
  };
}
