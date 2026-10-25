import assert from "node:assert/strict";
import test from "node:test";
import { generateReferenceOutputs } from "../../frontend/src/services/referenceOutputService.js";

const question = {
  signature: {
    name: "add",
    returnType: "int",
    params: [
      { name: "a", type: "int" },
      { name: "b", type: "int" },
    ],
  },
  referenceSolution:
    "public class Solution { public int add(int a, int b) { return a + b; } }",
  referenceSolutionLanguage: "java",
  testCases: [
    {
      parameterValues: { a: "1", b: "2" },
      description: "parameter-based case",
    },
    { input: "7\n8", expectedOutput: "old", description: "legacy raw case" },
    {
      input: "20\n22",
      expectedOutput: "",
      description: "additional case",
      customMetadata: "preserved",
    },
  ],
};

test("Desktop reference generation batches all test cases through the local engine", async () => {
  let executionRequest;
  let backendCalled = false;
  const desktopBridge = {
    engine: {
      execute: async (request) => {
        executionRequest = request;
        return {
          results: [
            { status: "FAILED", actualOutput: "3\n" },
            { status: "FAILED", output: "15" },
            { status: "FAILED", stdout: "42\n" },
          ],
        };
      },
    },
  };

  const generated = await generateReferenceOutputs(
    question,
    desktopBridge,
    async () => {
      backendCalled = true;
      throw new Error("Desktop must not use backend authoring execution.");
    },
  );

  assert.equal(backendCalled, false);
  assert.match(executionRequest.code, /public class Main/);
  assert.deepEqual(executionRequest.testCases, [
    { input: "1\n2", expectedOutput: "__REFERENCE_OUTPUT_SENTINEL__" },
    { input: "7\n8", expectedOutput: "__REFERENCE_OUTPUT_SENTINEL__" },
    { input: "20\n22", expectedOutput: "__REFERENCE_OUTPUT_SENTINEL__" },
  ]);
  assert.deepEqual(generated.testCases, [
    {
      ...question.testCases[0],
      input: "1\n2",
      expectedOutput: "3",
    },
    {
      ...question.testCases[1],
      input: "7\n8",
      expectedOutput: "15",
    },
    {
      ...question.testCases[2],
      input: "20\n22",
      expectedOutput: "42",
    },
  ]);
  assert.equal(generated.accepted, true);
  assert.match(generated.message, /Expected outputs generated/);
  assert.equal("referenceSolution" in generated, false);
});

test("Web reference generation keeps using the backend authoring endpoint", async () => {
  let backendQuestion;
  const response = { accepted: true, testCases: [] };
  const generated = await generateReferenceOutputs(
    question,
    undefined,
    async (payload) => {
      backendQuestion = payload;
      return response;
    },
  );

  assert.equal(backendQuestion, question);
  assert.equal(generated, response);
});

for (const [status, message] of [
  ["COMPILATION_ERROR", "Compilation failed."],
  ["RUNTIME_ERROR", "Runtime error."],
  ["TIME_LIMIT_EXCEEDED", "Execution timed out."],
  ["MEMORY_LIMIT_EXCEEDED", "Memory limit exceeded."],
  ["SYSTEM_ERROR", "Code execution is currently unavailable."],
]) {
  test(`reference generation rejects ${status}`, async () => {
    const desktopBridge = {
      engine: {
        execute: async () => ({
          results: [
            { status, actualOutput: "" },
            { status: "FAILED", actualOutput: "15" },
            { status: "FAILED", actualOutput: "42" },
          ],
        }),
      },
    };

    await assert.rejects(
      generateReferenceOutputs(question, desktopBridge, async () => {
        throw new Error("The Desktop bridge should be used.");
      }),
      new RegExp(`Reference solution failed on test case 1\\. ${message}`),
    );
  });
}

test("non-void reference functions reject empty and null output", async () => {
  for (const output of ["", "  ", "null"]) {
    const desktopBridge = {
      engine: {
        execute: async () => ({
          results: [
            { status: "FAILED", actualOutput: output },
            { status: "FAILED", actualOutput: "15" },
            { status: "FAILED", actualOutput: "42" },
          ],
        }),
      },
    };
    await assert.rejects(
      generateReferenceOutputs(question, desktopBridge, async () => null),
      /Reference solution failed on test case 1\. It produced no output/,
    );
  }
});

test("void reference functions allow the wrapper's null output", async () => {
  const desktopBridge = {
    engine: {
      execute: async () => ({
        results: [
          { status: "FAILED", actualOutput: "null" },
          { status: "FAILED", output: "null" },
          { status: "FAILED", stdout: "null" },
        ],
      }),
    },
  };

  const generated = await generateReferenceOutputs(
    { ...question, signature: { ...question.signature, returnType: "void" } },
    desktopBridge,
    async () => null,
  );

  assert.equal(generated.accepted, true);
  assert.deepEqual(
    generated.testCases.map((testCase) => testCase.expectedOutput),
    ["null", "null", "null"],
  );
});

test("local engine invocation failures are reported without technical details", async () => {
  const desktopBridge = {
    engine: {
      execute: async () => {
        throw new Error("fetch failed at http://127.0.0.1:43123");
      },
    },
  };

  await assert.rejects(
    generateReferenceOutputs(question, desktopBridge, async () => null),
    (error) => {
      assert.equal(error.message, "Code execution is currently unavailable.");
      assert.equal(error.message.includes("127.0.0.1"), false);
      return true;
    },
  );
});

test("local test-case limit errors are not mislabeled as engine outages", async () => {
  const desktopBridge = {
    engine: {
      execute: async () => {
        throw new Error("No more than 50 test cases may be run.");
      },
    },
  };

  await assert.rejects(
    generateReferenceOutputs(question, desktopBridge, async () => null),
    /No more than 50 test cases may be run/,
  );
});
