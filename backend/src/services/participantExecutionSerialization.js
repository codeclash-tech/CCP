const PUBLIC_EXECUTION_ERRORS = new Map([
  ["RUNTIME_ERROR", "Runtime error on one or more test cases."],
  ["TIME_LIMIT_EXCEEDED", "Time limit exceeded on one or more test cases."],
  ["MEMORY_LIMIT_EXCEEDED", "Memory limit exceeded on one or more test cases."],
  ["SECURITY_VIOLATION", "Execution was blocked by security restrictions."],
  ["OUTPUT_LIMIT_EXCEEDED", "Program output exceeded the allowed limit."],
  ["INTERNAL_ENGINE_ERROR", "The execution service could not complete this submission."],
  ["SYSTEM_ERROR", "The execution service could not complete this submission."],
  ["ERROR", "The execution service could not complete this submission."],
]);
const MAX_PUBLIC_TEST_OUTPUT_CHARACTERS = 32_000;

export function sanitizeParticipantExecutionError(status, error) {
  if (status === "COMPILATION_ERROR") {
    return typeof error === "string" ? error.slice(0, 8_000) : "";
  }
  return PUBLIC_EXECUTION_ERRORS.get(status) || "";
}

export function sanitizeParticipantTestResult(result) {
  if (result.isHidden !== false) {
    return {
      testCase: result.testCase,
      status: result.status,
      executionTime: result.executionTime,
      memoryUsed: result.memoryUsed,
      isHidden: true,
    };
  }

  return {
    ...(result.testCaseId ? { testCaseId: result.testCaseId } : {}),
    testCase: result.testCase,
    status: result.status,
    executionTime: result.executionTime,
    memoryUsed: result.memoryUsed,
    input: result.input ?? "",
    output:
      typeof result.output === "string"
        ? result.output.slice(0, MAX_PUBLIC_TEST_OUTPUT_CHARACTERS)
        : "",
    expectedOutput: result.expectedOutput ?? "",
    error: sanitizeParticipantExecutionError(result.status, result.error),
    isHidden: false,
  };
}

export function getVisibleExecutionOutput(results) {
  return results
    .filter((result) => result.isHidden === false)
    .map((result) => result.output || "")
    .join("\n");
}
