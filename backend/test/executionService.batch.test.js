import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionService } from "../src/services/executionService.js";

test("executes the complete submission in one engine request", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "ACCEPTED",
          passed: 2,
          failed: 0,
          total: 2,
          results: [
            {
              status: "PASSED",
              output: "3",
              expectedOutput: "3",
              executionTime: 4,
              memoryUsed: 1_024,
            },
            {
              status: "PASSED",
              output: "1000",
              expectedOutput: "1000",
              executionTime: 5,
              memoryUsed: 1_536,
            },
          ],
        }),
    };
  });

  const service = new ExecutionService(
    "https://engine.example/api/v1/execute",
    1_000,
    "test-engine-key",
  );
  const result = await service.execute(
    "class Main {}",
    [
      { input: "1 2", expectedOutput: "3" },
      { input: "999 1", expectedOutput: "1000" },
    ],
    "java",
    { timeLimit: 5_000, memoryLimit: 131_072 },
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://engine.example/api/v1/execute");
  assert.equal(requests[0].options.headers["x-api-key"], "test-engine-key");
  assert.deepEqual(
    requests[0].body.testCases,
    [
      { input: "1 2", expectedOutput: "3" },
      { input: "999 1", expectedOutput: "1000" },
    ],
  );
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.passed, 2);
  assert.deepEqual(
    result.results.map(({ status, output }) => ({ status, output })),
    [
      { status: "PASSED", output: "3" },
      { status: "PASSED", output: "1000" },
    ],
  );
});
