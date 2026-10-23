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

test("executes granted visible cases locally and sends source for backend judging", async () => {
  const requests = [];
  let engineRequest;
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options, body: JSON.parse(options.body) });
    if (requests.length === 1) {
      return response({
        nonce: "a".repeat(64),
        visibleTestCaseCount: 1,
        timeLimit: 5_000,
        memoryLimit: 131_072,
        testCases: [{ input: "1 2", expectedOutput: "3" }],
      });
    }
    return response({ questionResult: { status: "ACCEPTED", score: 100 } });
  };
  const engine = {
    execute: async (normalizedRequest) => {
      engineRequest = normalizedRequest;
      return {
        status: "ACCEPTED",
        executionTime: 12,
        memoryUsed: 2_048,
        results: [
          {
            status: "PASSED",
            actualOutput: "3",
            executionTime: 5,
            memoryUsed: 1_024,
          },
        ],
      };
    },
  };

  const result = await submitDesktopQuestion({
    engine,
    fetchImpl,
    isPackaged: true,
    request,
  });

  assert.equal(result.questionResult.status, "ACCEPTED");
  assert.deepEqual(
    engineRequest.testCases.map(({ input }) => input),
    ["1 2"],
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.endsWith("/ABC234/desktop-execution"), true);
  assert.match(requests[0].body.codeHash, /^[a-f\d]{64}$/);
  assert.equal(requests[1].url.endsWith("/ABC234/submit"), true);
  assert.equal(requests[1].body.code, request.code);
  assert.equal(requests[1].body.desktopNonce, "a".repeat(64));
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
        return response({
          nonce: "b".repeat(64),
          visibleTestCaseCount: 1,
          timeLimit: 5_000,
          memoryLimit: 131_072,
          testCases: [{ input: "1", expectedOutput: "1" }],
        });
      }
      submittedBody = JSON.parse(options.body);
      return response({ questionResult: { status: "ACCEPTED" } });
    },
    isPackaged: true,
    request,
  });

  assert.equal("localExecution" in submittedBody, false);
  assert.equal(submittedBody.code, request.code);
});

test("runs composed code locally but sends the original source for backend composition", async () => {
  const rawSource = "class Solution { public int add(int a, int b) { return a + b; } }";
  const localProgram = "public class Main { public static void main(String[] args) {} }";
  let localCode;
  const requests = [];

  await submitDesktopQuestion({
    engine: {
      execute: async (executionRequest) => {
        localCode = executionRequest.code;
        return { status: "ACCEPTED", results: [{ status: "PASSED" }] };
      },
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url: String(url), body });
      if (requests.length === 1) {
        return response({
          nonce: "d".repeat(64),
          visibleTestCaseCount: 1,
          timeLimit: 5_000,
          memoryLimit: 131_072,
          testCases: [{ input: "1 2", expectedOutput: "3" }],
        });
      }
      return response({ questionResult: { status: "ACCEPTED" } });
    },
    isPackaged: true,
    request: { ...request, code: rawSource, executionCode: localProgram },
  });

  assert.equal(localCode, localProgram);
  assert.equal(
    requests[0].body.codeHash,
    createHash("sha256").update(rawSource, "utf8").digest("hex"),
  );
  assert.equal(requests[1].body.code, rawSource);
  assert.equal("executionCode" in requests[1].body, false);
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

test("does not submit if local execution fails", async () => {
  let requestCount = 0;
  await assert.rejects(
    submitDesktopQuestion({
      engine: { execute: async () => { throw new Error("engine failed"); } },
      fetchImpl: async () => {
        requestCount += 1;
        return response({
          nonce: "a".repeat(64),
          visibleTestCaseCount: 1,
          timeLimit: 5_000,
          memoryLimit: 131_072,
          testCases: [{ input: "1", expectedOutput: "1" }],
        });
      },
      isPackaged: true,
      request,
    }),
    /Code execution is currently unavailable/,
  );
  assert.equal(requestCount, 1);
});
