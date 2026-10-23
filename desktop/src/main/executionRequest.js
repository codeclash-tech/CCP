const MAX_CODE_LENGTH = 50_000;
const MAX_TEST_CASES = 50;
const MAX_INPUT_LENGTH = 5_000;
const MAX_EXPECTED_OUTPUT_LENGTH = 100_000;
const MAX_TIME_LIMIT = 30_000;
const MAX_MEMORY_LIMIT = 1_048_576;

export function normalizeExecutionRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("An execution request is required.");
  }
  if (typeof request.code !== "string" || !request.code.trim()) {
    throw new TypeError("Source code cannot be empty.");
  }
  if (request.code.length > MAX_CODE_LENGTH) {
    throw new RangeError(`Source code must not exceed ${MAX_CODE_LENGTH} characters.`);
  }
  if (
    request.language !== undefined &&
    (typeof request.language !== "string" ||
      request.language.toLowerCase() !== "java")
  ) {
    throw new TypeError("Only Java submissions are supported.");
  }
  if (!Array.isArray(request.testCases) || request.testCases.length === 0) {
    throw new TypeError("At least one test case is required.");
  }
  if (request.testCases.length > MAX_TEST_CASES) {
    throw new RangeError(`No more than ${MAX_TEST_CASES} test cases may be run.`);
  }

  const testCases = request.testCases.map((testCase, index) => {
    if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) {
      throw new TypeError(`Test case ${index + 1} is invalid.`);
    }
    const input = testCase.input ?? "";
    const expectedOutput = testCase.expectedOutput ?? "";
    if (typeof input !== "string" || input.length > MAX_INPUT_LENGTH) {
      throw new RangeError(`Test case ${index + 1} input is invalid or too long.`);
    }
    if (
      typeof expectedOutput !== "string" ||
      expectedOutput.length > MAX_EXPECTED_OUTPUT_LENGTH
    ) {
      throw new RangeError(
        `Test case ${index + 1} expected output is invalid or too long.`,
      );
    }
    return { input, expectedOutput };
  });

  const timeLimit = request.timeLimit ?? 5_000;
  const memoryLimit = request.memoryLimit ?? 131_072;
  if (!Number.isInteger(timeLimit) || timeLimit < 100 || timeLimit > MAX_TIME_LIMIT) {
    throw new RangeError("The execution time limit must be between 100 and 30000 ms.");
  }
  if (
    !Number.isInteger(memoryLimit) ||
    memoryLimit < 1_024 ||
    memoryLimit > MAX_MEMORY_LIMIT
  ) {
    throw new RangeError("The execution memory limit is invalid.");
  }

  return {
    language: "JAVA",
    code: request.code,
    timeLimit,
    memoryLimit,
    testCases,
  };
}
