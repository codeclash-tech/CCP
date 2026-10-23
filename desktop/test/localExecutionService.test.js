import assert from "node:assert/strict";
import test from "node:test";
import { executeVisibleCasesLocally } from "../../frontend/src/services/localExecutionService.js";

test("composes Java submissions and sends only visible cases to the local engine", async () => {
  let executionRequest;
  globalThis.window = {
    codeClashDesktop: {
      engine: {
        execute: async (request) => {
          executionRequest = request;
          return { status: "ACCEPTED" };
        },
      },
    },
  };

  const result = await executeVisibleCasesLocally({
    question: {
      signature: {
        name: "sum",
        returnType: "int",
        params: [{ name: "values", type: "int[]" }],
      },
      visibleTestCases: [{ input: "[1, 2]", expectedOutput: "3" }],
      hiddenTestCases: [{ input: "[100, 200]", expectedOutput: "300" }],
    },
    code: "public class Solution { public int sum(int[] values) { return values[0] + values[1]; } }",
    language: "java",
  });

  assert.equal(result.status, "ACCEPTED");
  assert.match(executionRequest.code, /public class Main/);
  assert.match(executionRequest.code, /class Solution/);
  assert.deepEqual(executionRequest.testCases, [
    { input: "[1, 2]", expectedOutput: "3" },
  ]);
  delete globalThis.window;
});

test("returns visible case input, actual output, and expected output for the result panel", async () => {
  globalThis.window = {
    codeClashDesktop: {
      engine: {
        execute: async () => ({
          status: "ACCEPTED",
          results: [
            { testCase: 1, status: "PASSED", actualOutput: "3", expectedOutput: "3" },
            { testCase: 2, status: "FAILED", actualOutput: "6", expectedOutput: "7" },
          ],
        }),
      },
    },
  };

  const result = await executeVisibleCasesLocally({
    question: {
      visibleTestCases: [
        { input: "1 2", expectedOutput: "3" },
        { input: "3 4", expectedOutput: "7" },
      ],
    },
    code: "class Main {}",
    language: "java",
  });

  assert.deepEqual(
    result.results.map(({ input, output, expectedOutput }) => ({
      input,
      output,
      expectedOutput,
    })),
    [
      { input: "1 2", output: "3", expectedOutput: "3" },
      { input: "3 4", output: "6", expectedOutput: "7" },
    ],
  );
  delete globalThis.window;
});

test("executes parameter-based visible cases using the wrapper input format", async () => {
  let executionRequest;
  globalThis.window = {
    codeClashDesktop: {
      engine: {
        execute: async (request) => {
          executionRequest = request;
          return {
            status: "ACCEPTED",
            results: [
              {
                testCase: 1,
                status: "PASSED",
                actualOutput: "9",
                expectedOutput: "9",
              },
            ],
          };
        },
      },
    },
  };

  const result = await executeVisibleCasesLocally({
    question: {
      signature: {
        name: "sum",
        returnType: "int",
        params: [
          { name: "left", type: "int" },
          { name: "right", type: "int" },
        ],
      },
      visibleTestCases: [
        { parameterValues: { left: "4", right: "5" }, expectedOutput: "9" },
      ],
    },
    code: "public class Solution { public int sum(int left, int right) { return left + right; } }",
    language: "java",
  });

  assert.deepEqual(executionRequest.testCases, [
    { input: "4\n5", expectedOutput: "9" },
  ]);
  assert.equal(result.results[0].input, "4\n5");
  assert.equal(result.results[0].output, "9");
  assert.equal(result.results[0].expectedOutput, "9");
  delete globalThis.window;
});

test("rejects a question with no visible cases instead of calling the engine", async () => {
  let wasCalled = false;
  globalThis.window = {
    codeClashDesktop: {
      engine: {
        execute: async () => {
          wasCalled = true;
        },
      },
    },
  };

  await assert.rejects(
    executeVisibleCasesLocally({ question: { visibleTestCases: [] }, code: "class Main {}", language: "java" }),
    /No visible test cases/,
  );
  assert.equal(wasCalled, false);
  delete globalThis.window;
});

test("hides local engine connection details from execution errors", async () => {
  globalThis.window = {
    codeClashDesktop: {
      engine: {
        execute: async () => {
          throw new Error("fetch failed at http://127.0.0.1:43123");
        },
      },
    },
  };

  await assert.rejects(
    executeVisibleCasesLocally({
      question: {
        visibleTestCases: [{ input: "1", expectedOutput: "1" }],
      },
      code: "class Main {}",
      language: "java",
    }),
    (error) => {
      assert.equal(error.message, "Code execution is currently unavailable.");
      assert.equal(error.message.includes("127.0.0.1"), false);
      return true;
    },
  );
  delete globalThis.window;
});
