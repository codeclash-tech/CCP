import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "development";
process.env.RESEND_API_KEY = "";
process.env.EMAIL_FROM = "";

const { sendVerificationEmail } = await import(
  "../src/services/emailDispatchService.js"
);
const { sendBattleRoomResultEmail } = await import(
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

test("sends battle-result email through Resend", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  let requestBody;

  globalThis.fetch = async (url, request) => {
    assert.equal(url, "https://api.resend.com/emails");
    requestBody = JSON.parse(request.body);
    return new Response(JSON.stringify({ id: "result-email-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    process.env.RESEND_API_KEY = "unit-test-key";
    process.env.EMAIL_FROM = "CodeClash <no-reply@example.com>";
    const result = await sendBattleRoomResultEmail({
      email: "person@example.com",
      userName: "Developer",
      roomTitle: "Algorithms",
      totalScore: 90,
      totalPassed: 9,
      totalTestCases: 10,
      questionResults: [
        {
          questionTitle: "Two Sum",
          status: "ACCEPTED",
          score: 90,
          passed: 9,
          total: 10,
          results: [
            { status: "PASSED", executionTime: 12, isHidden: false },
            { status: "FAILED", executionTime: 18, isHidden: true, input: "secret input" },
          ],
        },
      ],
      rank: 1,
      totalParticipants: 5,
      roomCode: "ROOM1",
      certificateUrl:
        "https://api.example.com/api/battle-rooms/certificate/test-token",
      startTime: "2026-01-01T10:00:00.000Z",
      endTime: "2026-01-01T12:00:00.000Z",
      timeZone: "UTC",
      submissionStatus: "COMPLETED",
      completedAt: "2026-01-01T12:00:00.000Z",
    });

    assert.equal(result.success, true);
    assert.equal(requestBody.from, "CodeClash <no-reply@example.com>");
    assert.deepEqual(requestBody.to, ["person@example.com"]);
    assert.equal(
      requestBody.subject,
      "Battle complete: Algorithms - Your results",
    );
    assert.match(requestBody.text, /CONGRATULATIONS, Developer!/);
    assert.match(requestBody.text, /Final score: 90/);
    assert.match(requestBody.text, /Battle start: Jan 1, 2026, 10:00 UTC/);
    assert.match(requestBody.text, /Battle end: Jan 1, 2026, 12:00 UTC/);
    assert.doesNotMatch(requestBody.text, /Two Sum|Question results|secret input/);
    assert.doesNotMatch(requestBody.html, /Two Sum|Question results|secret input/);
    assert.match(requestBody.html, /Download your certificate/);
    assert.match(
      requestBody.html,
      /href="https:\/\/api\.example\.com\/api\/battle-rooms\/certificate\/test-token"/,
    );
    assert.doesNotMatch(requestBody.html, /5 minutes|room will then be deleted/);
    assert.match(
      requestBody.text,
      /Download: https:\/\/api\.example\.com\/api\/battle-rooms\/certificate\/test-token/,
    );
    assert.doesNotMatch(requestBody.html, /CERTIFICATE OF EXCELLENCE|Download PDF Certificate/);
    assert.doesNotMatch(requestBody.html, /Joined Rooms/);
    assert.doesNotMatch(requestBody.text, /secret input/);
    assert.doesNotMatch(requestBody.html, /secret input/);
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
