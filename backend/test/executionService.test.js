import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionService } from "../src/services/executionService.js";

const testCases = [
  { _id: "case-1", input: "1", expectedOutput: "2" },
  { _id: "case-2", input: "2", expectedOutput: "4" },
  { _id: "case-3", input: "3", expectedOutput: "6" },
];

function engineResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("sends all test cases in exactly one engine request and maps results in order", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, request) => {
    requests.push({ url, request, body: JSON.parse(request.body) });
    return engineResponse({
      status: "ACCEPTED",
      results: [
        { actualOutput: "2", executionTime: 11, memoryUsed: 21 },
        { actualOutput: "4", executionTime: 12, memoryUsed: 22 },
        { actualOutput: "6", executionTime: 13, memoryUsed: 23 },
      ],
    });
  };

  try {
    const service = new ExecutionService("https://engine.test/execute", 1000, "key");
    const result = await service.execute(
      "class Solution {}",
      testCases,
      "java",
      { timeLimit: 5000, memoryLimit: 131072 },
    );

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://engine.test/execute");
    assert.deepEqual(requests[0].body, {
      language: "JAVA",
      code: "class Solution {}",
      timeLimit: 5000,
      memoryLimit: 131072,
      testCases: testCases.map(({ input, expectedOutput }) => ({
        input,
        expectedOutput,
      })),
    });
    assert.equal(result.status, "ACCEPTED");
    assert.equal(result.accepted, true);
    assert.equal(result.passed, 3);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 3);
    assert.equal(result.executionTime, 36);
    assert.equal(result.memoryUsed, 23);
    assert.deepEqual(
      result.results.map(({ testCaseId, testCase, input, status, output }) => ({
        testCaseId,
        testCase,
        input,
        status,
        output,
      })),
      [
        { testCaseId: "case-1", testCase: 1, input: "1", status: "PASSED", output: "2" },
        { testCaseId: "case-2", testCase: 2, input: "2", status: "PASSED", output: "4" },
        { testCaseId: "case-3", testCase: 3, input: "3", status: "PASSED", output: "6" },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps wrong-answer cases failed in a batched response", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return engineResponse({
      status: "ACCEPTED",
      results: [
        { actualOutput: "2" },
        { actualOutput: "wrong" },
        { actualOutput: "6" },
      ],
    });
  };

  try {
    const service = new ExecutionService("https://engine.test/execute");
    const result = await service.execute("class Solution {}", testCases);

    assert.equal(requestCount, 1);
    assert.equal(result.status, "WRONG_ANSWER");
    assert.equal(result.accepted, false);
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 1);
    assert.deepEqual(
      result.results.map(({ status }) => status),
      ["PASSED", "WRONG_ANSWER", "PASSED"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserves compilation errors across the submitted batch", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return engineResponse({
      status: "COMPILATION_ERROR",
      error: "cannot find symbol",
    });
  };

  try {
    const service = new ExecutionService("https://engine.test/execute");
    const result = await service.execute("invalid Java", testCases);

    assert.equal(requestCount, 1);
    assert.equal(result.status, "COMPILATION_ERROR");
    assert.equal(result.accepted, false);
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 3);
    assert.ok(result.results.every(({ status }) => status === "COMPILATION_ERROR"));
    assert.match(result.error, /cannot find symbol/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a non-accepted system error for malformed multi-case results", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => engineResponse({
    status: "ACCEPTED",
    results: [{ actualOutput: "2" }],
  });

  try {
    const service = new ExecutionService("https://engine.test/execute");
    const result = await service.execute("class Solution {}", testCases);

    assert.equal(result.status, "SYSTEM_ERROR");
    assert.equal(result.accepted, false);
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 3);
    assert.match(result.error, /returned 1 result\(s\) for 3 test case\(s\)/);
    assert.ok(result.results.every(({ status }) => status === "SYSTEM_ERROR"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports a malformed response when a multi-case result array is missing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => engineResponse({ status: "ACCEPTED" });

  try {
    const service = new ExecutionService("https://engine.test/execute");
    const result = await service.execute("class Solution {}", testCases);

    assert.equal(result.status, "SYSTEM_ERROR");
    assert.equal(result.accepted, false);
    assert.equal(result.results.length, testCases.length);
    assert.match(result.error, /malformed test results/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("converts engine HTTP failures into failed results for every case", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return engineResponse({ error: "engine unavailable" }, 503);
  };

  try {
    const service = new ExecutionService("https://engine.test/execute");
    const result = await service.execute("class Solution {}", testCases);

    assert.equal(requestCount, 1);
    assert.equal(result.status, "SYSTEM_ERROR");
    assert.equal(result.accepted, false);
    assert.equal(result.results.length, testCases.length);
    assert.match(result.error, /engine unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handles a batch timeout without accepting any test case", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  try {
    const service = new ExecutionService("https://engine.test/execute", 5);
    const result = await service.execute("class Solution {}", testCases);

    assert.equal(result.status, "SYSTEM_ERROR");
    assert.equal(result.accepted, false);
    assert.equal(result.results.length, testCases.length);
    assert.ok(result.results.every(({ status, error }) =>
      status === "SYSTEM_ERROR" && /timed out/.test(error),
    ));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
