import assert from "node:assert/strict";
import test from "node:test";
import {
  describeExecutionServiceFailure,
  executionService,
} from "../src/services/executionService.js";
import { generateExpectedOutputs } from "../src/services/referenceSolutionService.js";

const question = {
  signature: {
    name: "value",
    returnType: "int",
    params: [],
  },
};
const referenceSolution = "class Solution { public int value() { return 1; } }";
const testCases = [{ input: "", expectedOutput: "" }];

test("explains how to resolve a rejected Secure Code Engine API key", () => {
  assert.match(
    describeExecutionServiceFailure("Secure Code Engine error: Invalid API Key"),
    /SECURE_CODE_ENGINE_API_KEY[\s\S]*ENGINE_MASTER_API_KEY/,
  );
});

test("reports an unreachable Secure Code Engine separately from solution failures", async (t) => {
  t.mock.method(executionService, "execute", async () => ({
    status: "SYSTEM_ERROR",
    accepted: false,
    error: "Secure Code Engine request failed: fetch failed",
    results: [
      {
        testCase: 1,
        status: "SYSTEM_ERROR",
        output: "",
      },
    ],
  }));

  await assert.rejects(
    generateExpectedOutputs(question, referenceSolution, "java", testCases),
    /Secure Code Engine is unavailable or unreachable[\s\S]*fetch failed/,
  );
});

test("keeps reference-solution diagnostics for compilation failures", async (t) => {
  t.mock.method(executionService, "execute", async () => ({
    status: "COMPILATION_ERROR",
    accepted: false,
    error: "Compilation failed",
    results: [
      {
        testCase: 1,
        status: "COMPILATION_ERROR",
        output: "",
        error: "Compilation failed",
      },
    ],
  }));

  await assert.rejects(
    generateExpectedOutputs(question, referenceSolution, "java", testCases),
    /Reference solution failed\. Fix the solution before publishing\./,
  );
});
