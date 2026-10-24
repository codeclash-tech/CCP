import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { submitDesktopQuestion } from "../src/main/desktopSubmission.js";

const request = {
  apiBaseUrl: "https://ccp-backend-qylz.onrender.com/api",
  accessToken: "a-valid-access-token-that-is-long-enough",
  roomCode: "ABC234",
  questionId: "507f1f77bcf86cd799439011",
  code: "class Main {}",
};

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("submits source for asynchronous server verification without running the local engine", async () => {
  const requests = [];
  let engineCalled = false;
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options, body: JSON.parse(options.body) });
    if (requests.length === 1) {
      return response({ nonce: "a".repeat(64) });
    }
    return response({
      submissionId: "submission-123",
      status: "PROCESSING",
      verificationStatus: "PENDING_VERIFICATION",
      questionResult: {
        status: "PROCESSING",
        verificationStatus: "PENDING_VERIFICATION",
        score: null,
      },
    });
  };
  const engine = {
    execute: async () => {
      engineCalled = true;
      throw new Error("Submit must not invoke the local engine.");
    },
  };

  const result = await submitDesktopQuestion({
    engine,
    fetchImpl,
    isPackaged: true,
    request,
  });

  assert.equal(result.questionResult.verificationStatus, "PENDING_VERIFICATION");
  assert.equal(result.questionResult.score, null);
  assert.equal(result.submissionId, "submission-123");
  assert.equal(engineCalled, false);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.endsWith("/ABC234/desktop-execution"), true);
  assert.match(requests[0].body.codeHash, /^[a-f\d]{64}$/);
  assert.equal(requests[1].url.endsWith("/ABC234/submit"), true);
  assert.equal(requests[1].body.code, request.code);
  assert.equal(requests[1].body.desktopNonce, "a".repeat(64));
  assert.equal("testCases" in requests[0].body, false);
  assert.equal("localExecution" in requests[1].body, false);
  assert.equal(
    requests[1].options.headers.Authorization,
    `Bearer ${request.accessToken}`,
  );
});

test("does not send candidate-reported local results to the backend", async () => {
  let submittedBody;
  let requestCount = 0;
  await submitDesktopQuestion({
    engine: {
      execute: async () => ({
        status: "ACCEPTED",
        executionTime: 2,
        memoryUsed: 1_024,
        results: [
          { status: "PASSED", actualOutput: "x".repeat(50_000), executionTime: 1, memoryUsed: 512 },
        ],
      }),
    },
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      if (requestCount === 1) {
        return response({ nonce: "b".repeat(64) });
      }
      submittedBody = JSON.parse(options.body);
      return response({
        submissionId: "submission-456",
        questionResult: {
          status: "PROCESSING",
          verificationStatus: "PENDING_VERIFICATION",
        },
      });
    },
    isPackaged: true,
    request,
  });

  assert.equal("localExecution" in submittedBody, false);
  assert.equal(submittedBody.code, request.code);
});

test("sends the original source for server-side composition without local execution", async () => {
  const rawSource = "class Solution { public int add(int a, int b) { return a + b; } }";
  const localProgram = "public class Main { public static void main(String[] args) {} }";
  let engineCalled = false;
  const requests = [];

  await submitDesktopQuestion({
    engine: { execute: async () => { engineCalled = true; } },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url: String(url), body });
      if (requests.length === 1) {
        return response({ nonce: "d".repeat(64) });
      }
      return response({
        submissionId: "submission-789",
        questionResult: {
          status: "PROCESSING",
          verificationStatus: "PENDING_VERIFICATION",
        },
      });
    },
    isPackaged: true,
    request: { ...request, code: rawSource, executionCode: localProgram },
  });

  assert.equal(engineCalled, false);
  assert.equal(
    requests[0].body.codeHash,
    createHash("sha256").update(rawSource, "utf8").digest("hex"),
  );
  assert.equal(requests[1].body.code, rawSource);
  assert.equal("executionCode" in requests[1].body, false);
  assert.notEqual(requests[1].body.code, localProgram);
});

test("rejects unapproved API origins before making a request", async () => {
  let requestCount = 0;
  await assert.rejects(
    submitDesktopQuestion({
      engine: { execute: async () => ({}) },
      fetchImpl: async () => {
        requestCount += 1;
        return response({});
      },
      isPackaged: true,
      request: { ...request, apiBaseUrl: "https://attacker.example/api" },
    }),
    /not an approved endpoint/,
  );
  assert.equal(requestCount, 0);
});

test("does not block submission on a local engine failure", async () => {
  let requestCount = 0;
  const result = await submitDesktopQuestion({
    engine: { execute: async () => { throw new Error("engine failed"); } },
    fetchImpl: async () => {
      requestCount += 1;
      return requestCount === 1
        ? response({ nonce: "a".repeat(64) })
        : response({
            submissionId: "submission-123",
            questionResult: {
              status: "PROCESSING",
              verificationStatus: "PENDING_VERIFICATION",
            },
          });
    },
    isPackaged: true,
    request,
  });
  assert.equal(result.questionResult.verificationStatus, "PENDING_VERIFICATION");
  assert.equal(requestCount, 2);
});
