import { composeProgram } from "../../../backend/src/services/wrapperGenerator.js";
import { convertParameterValuesToInput } from "../../../backend/src/services/parameterConverter.js";

const REFERENCE_OUTPUT_SENTINEL = "__REFERENCE_OUTPUT_SENTINEL__";
const REFERENCE_FAILURE_MESSAGES = {
  COMPILATION_ERROR: "Compilation failed.",
  COMPILE_ERROR: "Compilation failed.",
  RUNTIME_ERROR: "Runtime error.",
  TIME_LIMIT_EXCEEDED: "Execution timed out.",
  MEMORY_LIMIT_EXCEEDED: "Memory limit exceeded.",
  SYSTEM_ERROR: "Code execution is currently unavailable.",
  ERROR: "Execution failed.",
};

function getExecutionInput(testCase, signature) {
  if (
    testCase.parameterValues &&
    typeof testCase.parameterValues === "object" &&
    signature?.name
  ) {
    return convertParameterValuesToInput(signature, testCase.parameterValues);
  }
  return String(testCase.input ?? "");
}

function getReferenceOutput(result) {
  return String(
    result.actualOutput ?? result.output ?? result.stdout ?? "",
  ).trim();
}

function throwSafeLocalExecutionError(error) {
  const message = error?.message;
  if (
    typeof message === "string" &&
    /^(?:Source code|Only Java|At least one test case|No more than \d+ test cases|Test case \d+|The execution time limit|The execution memory limit)/.test(
      message,
    )
  ) {
    throw new Error(message);
  }
  throw new Error("Code execution is currently unavailable.");
}

function validateReferenceResults(results, question) {
  const returnType = String(question.signature?.returnType || "void")
    .trim()
    .toLowerCase();

  results.forEach((result, index) => {
    const failureMessage = REFERENCE_FAILURE_MESSAGES[result?.status];
    if (failureMessage) {
      throw new Error(
        `Reference solution failed on test case ${index + 1}. ${failureMessage}`,
      );
    }

    const output = getReferenceOutput(result || {});
    if (returnType !== "void" && (!output || output.toLowerCase() === "null")) {
      throw new Error(
        `Reference solution failed on test case ${index + 1}. It produced no output.`,
      );
    }
  });
}

export async function generateExpectedOutputsLocally(
  question,
  desktopBridge =
    typeof window !== "undefined" ? window.codeClashDesktop : undefined,
) {
  if (!question || typeof question !== "object") {
    throw new TypeError("A question is required to generate expected outputs.");
  }
  if (typeof question.referenceSolution !== "string" || !question.referenceSolution.trim()) {
    throw new TypeError("A reference solution is required to generate expected outputs.");
  }
  if (typeof desktopBridge?.engine?.execute !== "function") {
    throw new Error("Code execution is currently unavailable.");
  }

  const testCases = Array.isArray(question.testCases)
    ? question.testCases
    : [
        ...(question.visibleTestCases || []),
        ...(question.hiddenTestCases || []),
      ];
  if (testCases.length === 0) {
    throw new Error("Add at least one test case.");
  }

  const inputs = testCases.map((testCase) => ({
    input: getExecutionInput(testCase, question.signature),
    expectedOutput: REFERENCE_OUTPUT_SENTINEL,
  }));
  const program = composeProgram(
    question,
    question.referenceSolution,
    question.referenceSolutionLanguage || "java",
  );

  let execution;
  try {
    execution = await desktopBridge.engine.execute({
      code: program,
      language: question.referenceSolutionLanguage || "java",
      testCases: inputs,
    });
  } catch (error) {
    throwSafeLocalExecutionError(error);
  }

  if (!Array.isArray(execution?.results) || execution.results.length !== inputs.length) {
    throw new Error("Code execution is currently unavailable.");
  }
  validateReferenceResults(execution.results, question);

  const generatedTestCases = testCases.map((testCase, index) => ({
      ...testCase,
      input: inputs[index].input,
      expectedOutput: getReferenceOutput(execution.results[index]),
    }));

  return {
    testCases: generatedTestCases,
    accepted: true,
    message: "Expected outputs generated successfully.",
  };
}

export async function executeQuestionTestCasesLocally({ question, code, language }) {
  if (!question || typeof code !== "string") {
    throw new TypeError("A question and source code are required for code execution.");
  }
  if (!window.codeClashDesktop?.engine?.execute) {
    throw new Error("Code execution is currently unavailable.");
  }

  const sourceTestCases = (
    Array.isArray(question.testCases)
      ? question.testCases
      : [
          ...(question.visibleTestCases || []),
          ...(question.hiddenTestCases || []),
        ]
  ).filter(
    (testCase) =>
      (testCase.input !== undefined && testCase.input !== null) ||
      (testCase.parameterValues &&
        typeof testCase.parameterValues === "object" &&
        question.signature?.name &&
        Object.keys(testCase.parameterValues).length > 0),
  );
  const testCases = sourceTestCases.map((testCase) => ({
    input: getExecutionInput(testCase, question.signature),
    expectedOutput: testCase.expectedOutput ?? "",
  }));
  if (testCases.length === 0) {
    throw new Error("No test cases are available for this question.");
  }

  const program = question.signature?.name
    ? composeProgram(question, code, language)
    : code;
  try {
    const execution = await window.codeClashDesktop.engine.execute({
      code: program,
      language,
      testCases,
    });
    return {
      ...execution,
      results: Array.isArray(execution?.results)
        ? execution.results.map((result, index) => ({
            ...result,
            input: result.input ?? testCases[index]?.input ?? "",
            output:
              result.actualOutput ??
              result.output ??
              result.stdout ??
              result.error ??
              "",
            expectedOutput:
              result.expectedOutput ??
              testCases[index]?.expectedOutput ??
              "",
          }))
        : [],
    };
  } catch (error) {
    throwSafeLocalExecutionError(error);
  }
}

export async function submitQuestionLocally({
  apiBaseUrl,
  accessToken,
  questionId,
  roomCode,
  question,
  code,
  language,
}) {
  if (!question || typeof code !== "string") {
    throw new TypeError("A question and source code are required for local submission.");
  }
  if (typeof window.codeClashDesktop?.assessment?.submit !== "function") {
    throw new Error("The CodeClash desktop submission service is not available.");
  }

  const executionCode = question.signature?.name
    ? composeProgram(question, code, language)
    : code;
  const testCases = (
    Array.isArray(question.testCases)
      ? question.testCases
      : [
          ...(question.visibleTestCases || []),
          ...(question.hiddenTestCases || []),
        ]
  )
    .filter(
      (testCase) =>
        (testCase.input !== undefined && testCase.input !== null) ||
        (testCase.parameterValues &&
          typeof testCase.parameterValues === "object" &&
          question.signature?.name &&
          Object.keys(testCase.parameterValues).length > 0),
    )
    .map((testCase) => ({
      input: getExecutionInput(testCase, question.signature),
      expectedOutput: String(testCase.expectedOutput ?? ""),
    }));
  return window.codeClashDesktop.assessment.submit({
    apiBaseUrl,
    accessToken,
    roomCode,
    questionId,
    code,
    executionCode,
    testCases,
    language,
  });
}

export async function submitDailyChallengeLocally({
  apiBaseUrl,
  accessToken,
  cycleId,
  question,
  code,
}) {
  if (!question || typeof code !== "string") {
    throw new TypeError("A question and source code are required for local submission.");
  }
  if (typeof window.codeClashDesktop?.assessment?.submitDaily !== "function") {
    throw new Error("The CodeClash desktop submission service is not available.");
  }
  const testCases = (
    Array.isArray(question.testCases)
      ? question.testCases
      : [
          ...(question.visibleTestCases || []),
          ...(question.hiddenTestCases || []),
        ]
  )
    .filter(
      (testCase) =>
        (testCase.input !== undefined && testCase.input !== null) ||
        (testCase.parameterValues &&
          typeof testCase.parameterValues === "object" &&
          question.signature?.name &&
          Object.keys(testCase.parameterValues).length > 0),
    )
    .map((testCase) => ({
      input: getExecutionInput(testCase, question.signature),
      expectedOutput: String(testCase.expectedOutput ?? ""),
    }));
  if (testCases.length === 0) {
    throw new Error("No test cases are available for this question.");
  }

  return window.codeClashDesktop.assessment.submitDaily({
    apiBaseUrl,
    accessToken,
    cycleId,
    questionId: question.id,
    code,
    executionCode: question.signature?.name
      ? composeProgram(question, code, "java")
      : code,
    testCases,
  });
}
