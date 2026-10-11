/**
 * referenceSolutionService.js
 * ------------------------------------------------------------------
 * Expected-output auto-generation.
 *
 * The admin uploads ONE correct Java reference solution. The backend:
 *   1. Composes a judge wrapper around it using the same templates
 *      participants will get.
 *   2. Executes it against ALL visible + hidden test-case inputs in a
 *      SINGLE engine call (batch mode).
 *   3. Reads the stdout from each test case result (actualOutput) and
 *      stores it as the expected output.
 *   4. Returns the populated test-case arrays.
 *
 * The reference solution is NEVER executed again during the actual
 * contest — only the stored expected outputs are used by the judge.
 */

import { composeProgram } from "./wrapperGenerator.js";
import { executionService } from "./executionService.js";

/**
 * Build the composed Java program that reads one test-case input and prints
 * the result.
 */
export function buildReferenceProgram(question, referenceSolution, language) {
  return composeProgram(question, referenceSolution, language, { forReferenceSolution: true });
}

/**
 * Generate expected outputs for ALL test cases in ONE engine call.
 * @returns {Array<{input: string, expectedOutput: string}>}
 */
export async function generateExpectedOutputs(question, referenceSolution, language, testCases) {
  if (!testCases || testCases.length === 0) return [];

  const program = buildReferenceProgram(question, referenceSolution, language);

  // The engine requires every test case to have a non-empty expectedOutput,
  // even when it is only being used to execute a reference program. Use a
  // sentinel that is intentionally unlikely to match; the reference path
  // stores actualOutput and does not use the pass/fail comparison.
  const batchTestCases = testCases.map((tc) => ({
    input: tc.input || "",
    expectedOutput: "__REFERENCE_OUTPUT_SENTINEL__",
  }));
  const result = await executionService.execute(program, batchTestCases, language, {
    isFullProgram: true,
    forReferenceSolution: true,
    timeLimit: 5000,  // generous timeout for reference execution
    memoryLimit: 131072,
  });

  if (result.error?.includes("HTTP 429")) {
    throw new Error(
      "Secure Code Engine is temporarily rate-limiting requests (HTTP 429). Wait a moment and try generating expected outputs again."
    );
  }

  // Engine-level failures (e.g. compilation error, engine down) with no
  // per-test-case results block publishing with the required message.
  if (result.error && (!result.results || result.results.length === 0)) {
    throw new Error(
      "Reference solution failed. Fix the solution before publishing.\n\n" + (result.error || "")
    );
  }

// Map the engine results back to expected outputs.
  // The engine puts the program's stdout into `actualOutput` (aliased to `output`).
  // The original test-case fields (parameterValues, description, etc.) are
  // preserved so the edit flow can reload parameter-based test cases.
  const outputs = testCases.map((tc, index) => {
    const tcResult = result.results[index] || {};
    return {
      ...tc,
      input: tc.input,
      expectedOutput: String(tcResult.output !== undefined ? tcResult.output : "").trim(),
      description: tc.description || "",
    };
  });

  // Detect per-test-case failures: runtime error, timeout, or no output
  // produced for a non-void return type. The reference solution must pass
  // every test case before the question can be published.
  const failed = (result.results || []).find((r) => r.status === "SYSTEM_ERROR" || r.status === "ERROR") || (() => {
    const returnType = (String(question?.signature?.returnType || "").trim() || "void").toLowerCase();
    if (returnType === "void") return null;
    return outputs.find((tc) => !tc.expectedOutput || tc.expectedOutput === "" || tc.expectedOutput === "null");
  })();

  if (failed) {
    const errorDetail = result.error || "Test case #" + (failed.testCase || "?") + " did not produce valid output.";
    const testCaseDetails = (result.results || [])
      .slice(0, 10)
      .map((r, i) => "  #" + (i + 1) + ": status=" + r.status + ', output="' + r.output + '"')
      .join("\n");
    throw new Error(
      "Reference solution failed. Fix the solution before publishing.\n\n" +
      errorDetail +
      "\n\nTest case results:\n" +
      testCaseDetails
    );
  }

  return outputs;
}

export default {
  buildReferenceProgram,
  generateExpectedOutputs,
};
