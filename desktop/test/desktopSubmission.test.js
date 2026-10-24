import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  submitDesktopDailyQuestion,
  submitDesktopQuestion,
} from "../src/main/desktopSubmission.js";

const request = {
  apiBaseUrl: "https://ccp-backend-qylz.onrender.com/api",
  accessToken: "a-valid-access-token-that-is-long-enough",
  roomCode: "ABC234",
  cycleId: "507f1f77bcf86cd799439012",
  questionId: "507f1f77bcf86cd799439011",
  code: "class Main {}",
  executionCode: "public class Main {}",
  testCases: [{ input: "1", expectedOutput: "1" }],
  language: "java",
};

const clientVersion = "1.0.0";
const engineVersion = "1.0.0";
const executionId = "0a10b0c0-d0e0-40f0-80a0-0a10b0c0d0e0";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function grant(testCount = 1) {
  return {
    nonce: "a".repeat(64),
    executionId,
    submissionId: "507f1f77bcf86cd799439013",
    assessmentId: "507f1f77bcf86cd799439014",
    challengeId: request.questionId,
    challengeVersion: "challenge-version",
    testSetVersion: "test-set-version",
    clientVersion,
    engineVersion,
    executionProtocolVersion: 1,
    testCount,
  };
}

function successfulExecution() {
  return {
    results: [
      {
        status: "PASSED",
        executionTime: 3,
        memoryUsed: 256,
      },
    ],
  };
}

function submissionOptions(fetchImpl, overrides = {}) {
  return {
    engine: {
      execute: async () => successfulExecution(),
      verifyIntegrity: async () => ({ verified: true }),
    },
    fetchImpl,
    isPackaged: true,
    clientVersion,
    engineVersion,
    request,
    ...overrides,
  };
}

test("executes locally and submits a transcript bound to the source and one-use grant", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url: String(url), options, body });
    return requests.length === 1
      ? response({ ...grant(), executionId: body.executionId })
      : response({ questionResult: { status: "ACCEPTED", score: 100 } }, 201);
  };
  const result = await submitDesktopQuestion(submissionOptions(fetchImpl));

  assert.equal(result.questionResult.status, "ACCEPTED");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.endsWith("/ABC234/desktop-execution"), true);
  assert.equal(
    requests[0].body.codeHash,
    createHash("sha256").update(request.code, "utf8").digest("hex"),
  );
  assert.match(requests[0].body.executionId, /^[a-f\d-]{36}$/i);
  assert.equal(requests[1].url.endsWith("/ABC234/desktop-finalize"), true);
  assert.equal(requests[1].body.transcript.sourceHash, requests[0].body.codeHash);
  assert.equal(requests[1].body.transcript.nonce, "a".repeat(64));
  assert.equal(requests[1].body.transcript.executionId, requests[0].body.executionId);
  assert.match(requests[1].body.transcriptHash, /^[a-f\d]{64}$/);
  assert.equal("testCases" in requests[0].body, false);
  assert.equal("code" in requests[1].body, false);
  assert.equal(
    requests[0].options.headers.Authorization,
    `Bearer ${request.accessToken}`,
  );
});

test("does not submit a result when the local engine fails", async () => {
  let requestCount = 0;
  await assert.rejects(
    submitDesktopQuestion(
      submissionOptions(
        async (_url, options) => {
          requestCount += 1;
          return response({
            ...grant(),
            executionId: JSON.parse(options.body).executionId,
          });
        },
        {
          engine: {
            verifyIntegrity: async () => ({ verified: true }),
            execute: async () => { throw new Error("engine failed"); },
          },
        },
      ),
    ),
    /engine failed/,
  );
  assert.equal(requestCount, 1);
});

test("rejects a grant bound to a different execution before running the engine", async () => {
  let engineCalled = false;
  await assert.rejects(
    submitDesktopQuestion(
      submissionOptions(
        async () => response({ ...grant(), executionId: "1a10b0c0-d0e0-40f0-80a0-0a10b0c0d0e0" }),
        {
          engine: {
            verifyIntegrity: async () => ({ verified: true }),
            execute: async () => { engineCalled = true; return successfulExecution(); },
          },
        },
      ),
    ),
    /mismatched execution grant/,
  );
  assert.equal(engineCalled, false);
});

test("blocks packaged submissions when the engine artifact integrity check fails", async () => {
  let requestCount = 0;
  await assert.rejects(
    submitDesktopQuestion(
      submissionOptions(
        async () => {
          requestCount += 1;
          return response(grant());
        },
        {
          engine: {
            verifyIntegrity: async () => {
              throw new Error("The bundled engine failed its release integrity check.");
            },
            execute: async () => successfulExecution(),
          },
        },
      ),
    ),
    /release integrity check/,
  );
  assert.equal(requestCount, 0);
});

test("submits Daily Challenge transcript using the cycle-bound grant routes", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return requests.length === 1
      ? response({
          ...grant(),
          executionId: requests.at(-1).body.executionId,
        })
      : response({ submission: { submissionId: "507f1f77bcf86cd799439013", status: "FINALIZED" } }, 201);
  };
  const result = await submitDesktopDailyQuestion(
    submissionOptions(fetchImpl, { request: { ...request, roomCode: undefined } }),
  );

  assert.equal(result.submission.status, "FINALIZED");
  assert.equal(requests[0].url.endsWith("/weekly-assessments/desktop-grant"), true);
  assert.equal(requests[0].body.cycleId, request.cycleId);
  assert.equal(requests[0].body.questionId, request.questionId);
  assert.equal(requests[0].body.sourceHash, createHash("sha256").update(request.code, "utf8").digest("hex"));
  assert.equal(requests[1].url.endsWith("/weekly-assessments/desktop-finalize"), true);
});

test("rejects unapproved API origins before making a request", async () => {
  let requestCount = 0;
  await assert.rejects(
    submitDesktopQuestion(
      submissionOptions(
        async () => {
          requestCount += 1;
          return response(grant());
        },
        { request: { ...request, apiBaseUrl: "https://attacker.example/api" } },
      ),
    ),
    /not an approved endpoint/,
  );
  assert.equal(requestCount, 0);
});
