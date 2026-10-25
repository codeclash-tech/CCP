import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "development";
process.env.RESEND_API_KEY = "";
process.env.EMAIL_FROM = "";

const { sendVerificationEmail } = await import(
  "../src/services/emailDispatchService.js"
);
const { sendChallengeCompletionEmail } = await import(
  "../src/services/emailService.js"
);

test("sends the existing verification email through Resend", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  let requestBody;
  let authorizationHeaderPresent;
  let requestUrl;

  globalThis.fetch = async (url, request) => {
    requestUrl = url;
    authorizationHeaderPresent = new Headers(request.headers).has(
      "authorization",
    );
    requestBody = JSON.parse(request.body);
    return new Response(JSON.stringify({ id: "email-test-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    process.env.RESEND_API_KEY = "unit-test-key";
    process.env.EMAIL_FROM = "CodeClash <no-reply@example.com>";
    const result = await sendVerificationEmail("person@example.com", "012345");

    assert.equal(result.success, true);
    assert.equal(result.messageId, "email-test-id");
    assert.equal(requestUrl, "https://api.resend.com/emails");
    assert.equal(authorizationHeaderPresent, true);
    assert.equal(requestBody.from, "CodeClash <no-reply@example.com>");
    assert.deepEqual(requestBody.to, ["person@example.com"]);
    assert.equal(requestBody.subject, "Verify your CodeClash account");
    assert.match(requestBody.html, /name="viewport"/);
    assert.match(requestBody.html, /012345/);
    assert.match(requestBody.text, /012345/);
    assert.match(requestBody.html, /expires in 5 minutes/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  }
});

test("uses the password-reset purpose and subject", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  let requestBody;

  globalThis.fetch = async (_url, request) => {
    requestBody = JSON.parse(request.body);
    return new Response(JSON.stringify({ id: "reset-email-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    process.env.RESEND_API_KEY = "unit-test-key";
    process.env.EMAIL_FROM = "CodeClash <no-reply@example.com>";
    const result = await sendVerificationEmail(
      "person@example.com",
      "012345",
      { purpose: "password-reset" },
    );

    assert.equal(result.success, true);
    assert.equal(requestBody.subject, "Reset your CodeClash password");
    assert.match(requestBody.html, /Your password reset code/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  }
});

test("uses the creator-verification purpose and expiry in the email", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  let requestBody;

  globalThis.fetch = async (_url, request) => {
    requestBody = JSON.parse(request.body);
    return new Response(JSON.stringify({ id: "creator-email-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    process.env.RESEND_API_KEY = "unit-test-key";
    process.env.EMAIL_FROM = "CodeClash <no-reply@example.com>";
    const result = await sendVerificationEmail(
      "person@example.com",
      "012345",
      { ttlMinutes: 2, purpose: "creator-verification" },
    );

    assert.equal(result.success, true);
    assert.equal(
      requestBody.subject,
      "Verify your email to create a CodeClash battle",
    );
    assert.match(requestBody.html, /Your creator verification code/);
    assert.match(requestBody.text, /expires in 2 minutes/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  }
});

test("sends concise completion email without results or question details", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  let requestBody;

  globalThis.fetch = async (url, request) => {
    assert.equal(url, "https://api.resend.com/emails");
    requestBody = JSON.parse(request.body);
    return new Response(JSON.stringify({ id: "completion-email-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    process.env.RESEND_API_KEY = "unit-test-key";
    process.env.EMAIL_FROM = "CodeClash <no-reply@example.com>";
    const result = await sendChallengeCompletionEmail({
      email: "person@example.com",
      userName: "Developer",
      challengeName: "Algorithms Room",
      challengeType: "BATTLE_ROOM",
    });

    assert.equal(result.success, true);
    assert.equal(requestBody.from, "CodeClash <no-reply@example.com>");
    assert.deepEqual(requestBody.to, ["person@example.com"]);
    assert.equal(
      requestBody.subject,
      "Battle Room completed",
    );
    assert.match(requestBody.text, /Congratulations, Developer!/);
    assert.match(requestBody.text, /successfully completed Algorithms Room/);
    assert.doesNotMatch(requestBody.text, /score|rank|question|test case|result/i);
    assert.doesNotMatch(requestBody.html, /score|rank|question|test case|result/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  }
});

test("does not send completion emails without a valid challenge name", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Resend must not receive incomplete result data.");
  };

  try {
    const result = await sendChallengeCompletionEmail({
      email: "person@example.com",
      userName: "Developer",
      challengeName: "",
      challengeType: "BATTLE_ROOM",
    });

    assert.equal(result.success, false);
    assert.match(result.error, /completed challenge/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("identifies a daily challenge without exposing its problem or result", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  let requestBody;

  globalThis.fetch = async (_url, request) => {
    requestBody = JSON.parse(request.body);
    return new Response(JSON.stringify({ id: "daily-completion-email-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    process.env.RESEND_API_KEY = "unit-test-key";
    process.env.EMAIL_FROM = "CodeClash <no-reply@example.com>";
    const result = await sendChallengeCompletionEmail({
      email: "person@example.com",
      userName: "Developer",
      challengeName: "Daily Challenge",
      challengeType: "DAILY_CHALLENGE",
    });

    assert.equal(result.success, true);
    assert.equal(requestBody.subject, "Daily Challenge completed");
    assert.match(requestBody.text, /successfully completed Daily Challenge/);
    assert.doesNotMatch(requestBody.text, /score|rank|question|test case|result/i);
    assert.doesNotMatch(requestBody.html, /score|rank|question|test case|result/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  }
});

test("rejects an invalid recipient without calling Resend", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Resend must not be called for invalid emails.");
  };

  try {
    const result = await sendVerificationEmail("not-an-email", "012345");
    assert.deepEqual(result, { success: false, reason: "INVALID_EMAIL" });
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a safe failure when Resend rejects the request", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  const originalConsoleError = console.error;
  const errors = [];

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        name: "validation_error",
        message: "Invalid API key",
        statusCode: 401,
      }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );
  console.error = (...args) => errors.push(args.join(" "));

  try {
    process.env.RESEND_API_KEY = "unit-test-key";
    process.env.EMAIL_FROM = "CodeClash <no-reply@example.com>";
    const result = await sendVerificationEmail("person@example.com", "987654");

    assert.deepEqual(result, { success: false, reason: "RESEND_FAILED" });
    assert.match(errors.join("\n"), /Resend/);
    assert.doesNotMatch(errors.join("\n"), /987654/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  }
});

test("fails clearly when required Resend configuration is missing", async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  const originalConsoleError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(" "));

  try {
    process.env.RESEND_API_KEY = "";
    process.env.EMAIL_FROM = "CodeClash <no-reply@example.com>";
    const missingKeyResult = await sendVerificationEmail(
      "person@example.com",
      "012345",
    );
    assert.deepEqual(missingKeyResult, {
      success: false,
      reason: "RESEND_FAILED",
    });
    assert.match(errors.join("\n"), /RESEND_API_KEY is not configured/);

    errors.length = 0;
    process.env.RESEND_API_KEY = "unit-test-key";
    process.env.EMAIL_FROM = "";
    const missingSenderResult = await sendVerificationEmail(
      "person@example.com",
      "012345",
    );
    assert.deepEqual(missingSenderResult, {
      success: false,
      reason: "RESEND_FAILED",
    });
    assert.match(errors.join("\n"), /EMAIL_FROM is not configured/);
  } finally {
    console.error = originalConsoleError;
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  }
});
