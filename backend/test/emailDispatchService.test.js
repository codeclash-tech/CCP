import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "development";
process.env.RESEND_API_KEY = "";

const { sendVerificationEmail } = await import(
  "../src/services/emailDispatchService.js"
);

test("sends a responsive verification email through Resend", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  let requestBody;

  globalThis.fetch = async (_url, request) => {
    requestBody = JSON.parse(request.body);
    return new Response(JSON.stringify({ id: "email-test-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    process.env.RESEND_API_KEY = "re_test_only";
    const result = await sendVerificationEmail("person@example.com", "012345");

    assert.equal(result.success, true);
    assert.equal(result.messageId, "email-test-id");
    assert.equal(requestBody.from, "CodeClash <onboarding@resend.dev>");
    assert.equal(requestBody.to, "person@example.com");
    assert.match(requestBody.html, /name="viewport"/);
    assert.match(requestBody.html, /012345/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
  }
});

test("logs the OTP as a local fallback when Resend is unavailable", async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const warnings = [];

  console.error = () => {};
  console.warn = (message) => warnings.push(message);

  try {
    process.env.RESEND_API_KEY = "";
    const result = await sendVerificationEmail("person@example.com", "654321");

    assert.equal(result.success, true);
    assert.equal(result.devMode, true);
    assert.match(warnings.join("\n"), /Verification code: 654321/);
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    process.env.RESEND_API_KEY = originalApiKey;
  }
});
