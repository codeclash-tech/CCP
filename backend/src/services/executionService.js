import { compareOutput } from "./outputComparator.js";

const DEFAULT_ENGINE_URL =
  "https://secure-code-engine.onrender.com/api/v1/execute";
const DEFAULT_TIMEOUT_MS = 120000;
const SUPPORTED_EXECUTION_LANGUAGES = ["java"];
const WARM_UP_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_TEST_CASES = 3;
const FATAL_TEST_CASE_STATUSES = [
  "COMPILATION_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "SYSTEM_ERROR",
];
let lastWarmUpAt = 0;
let warmUpPromise = null;

function normalizeLanguage(language) {
  const lang = String(language || "")
    .trim()
    .toLowerCase();
  if (SUPPORTED_EXECUTION_LANGUAGES.includes(lang)) {
    return lang;
  }
  throw new Error(`Unsupported execution language: ${language || "(empty)"}. Only Java is supported.`);
}

/**
 * Normalize the Secure Code Engine's top-level output or per-test result
 * format. Top-level output is case-specific only because execute() sends one
 * test case per request.
 */
function normalizeStatus(value, error = "") {
  const status = String(value || "").trim().toUpperCase().replaceAll(" ", "_");
  if (!status) return "";
  const errorText = String(error || "").toLowerCase();
  if (["PASS", "SUCCESS", "OK"].includes(status)) return "PASSED";
  if (["FAIL", "FAILED", "REJECTED"].includes(status)) return "WRONG_ANSWER";
  if (["COMPILE_ERROR", "COMPILATION_ERROR"].includes(status)) {
    return "COMPILATION_ERROR";
  }
  if (["RUNTIME_ERROR", "RUNTIME_EXCEPTION", "RE"].includes(status)) {
    return "RUNTIME_ERROR";
  }
  if (["TLE", "TIMEOUT", "TIMED_OUT"].includes(status)) {
    return "TIME_LIMIT_EXCEEDED";
  }
  if (["MLE", "MEMORY_ERROR"].includes(status)) {
    return "MEMORY_LIMIT_EXCEEDED";
  }
  if (status === "ERROR") {
    if (errorText.includes("compile") || errorText.includes("syntax")) {
      return "COMPILATION_ERROR";
    }
    if (errorText.includes("timeout") || errorText.includes("timed out")) {
      return "TIME_LIMIT_EXCEEDED";
    }
    if (/exception|runtime|stack trace|at [\w.$]+\(/i.test(errorText)) {
      return "RUNTIME_ERROR";
    }
    return "SYSTEM_ERROR";
  }
  return [
    "PASSED",
    "ACCEPTED",
    "WRONG_ANSWER",
    "COMPILATION_ERROR",
    "RUNTIME_ERROR",
    "TIME_LIMIT_EXCEEDED",
    "MEMORY_LIMIT_EXCEEDED",
    "SYSTEM_ERROR",
    "PENDING",
    "PROCESSING",
  ].includes(status)
    ? status
    : "SYSTEM_ERROR";
}

function outputString(value) {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function outputsMatch(actual, expected) {
  return compareOutput(actual, expected).passed;
}

function failedCase(testCase, index, error, status = "SYSTEM_ERROR") {
  return {
    ...(testCase?._id || testCase?.id
      ? { testCaseId: String(testCase._id || testCase.id) }
      : {}),
    testCase: index + 1,
    input: outputString(testCase?.input),
    status,
    executionTime: 0,
    memoryUsed: 0,
    output: "",
    expectedOutput: outputString(testCase?.expectedOutput),
    error: outputString(error),
  };
}

function summarizeResults(results, total, error = "") {
  const passed = results.filter((tc) =>
    ["PASSED", "ACCEPTED"].includes(tc.status),
  ).length;
  const failed = Math.max(0, total - passed);
  const fatalStatus = [
    "SYSTEM_ERROR",
    "COMPILATION_ERROR",
    "RUNTIME_ERROR",
    "TIME_LIMIT_EXCEEDED",
    "MEMORY_LIMIT_EXCEEDED",
  ].find((status) => results.some((tc) => tc.status === status));
  const hasPending = results.some((tc) =>
    ["PENDING", "PROCESSING"].includes(tc.status),
  );
  const status =
    total === 0
      ? "SYSTEM_ERROR"
      : fatalStatus ||
        (hasPending
          ? results.find((tc) =>
              ["PENDING", "PROCESSING"].includes(tc.status),
            ).status
          : passed === total
            ? "ACCEPTED"
            : "WRONG_ANSWER");
  const caseErrors = results
    .filter((tc) => tc.error)
    .map((tc) => `Test case ${tc.testCase}: ${tc.error}`);

  return {
    status,
    accepted: status === "ACCEPTED" && total > 0 && passed === total,
    passed,
    failed,
    total,
    output: results.map((tc) => tc.output).join("\n"),
    error: error || caseErrors.join("\n"),
    executionTime: results.reduce(
      (sum, tc) => sum + (Number(tc.executionTime) || 0),
      0,
    ),
    memoryUsed: results.reduce(
      (peak, tc) => Math.max(peak, Number(tc.memoryUsed) || 0),
      0,
    ),
    results,
  };
}

export function normalizeEngineResponse(raw, submittedTestCases = []) {
  let response;
  let responseError = "";
  try {
    response = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      responseError = raw
        ? "Execution engine returned an invalid response."
        : "No response from execution engine.";
    }
  } catch {
    responseError = "Execution engine returned malformed JSON.";
  }

  const cases = Array.isArray(submittedTestCases) ? submittedTestCases : [];
  if (cases.length === 0) {
    return summarizeResults([], 0, responseError || "No test cases were provided.");
  }
  if (responseError) {
    return summarizeResults(
      cases.map((testCase, index) =>
        failedCase(testCase, index, responseError),
      ),
      cases.length,
      responseError,
    );
  }

  const globalError = response.error ?? response.message ?? "";
  const globalStatus = normalizeStatus(response.status, globalError);
  const topLevelFatalStatus = FATAL_TEST_CASE_STATUSES.includes(globalStatus)
    ? globalStatus
    : "";
  const engineResults = Array.isArray(response.results) ? response.results : null;
  const malformedResults =
    Object.hasOwn(response, "results") && !Array.isArray(response.results);
  const resultCountMismatch =
    !topLevelFatalStatus &&
    (malformedResults ||
      (engineResults !== null && engineResults.length !== cases.length));

  const results = cases.map((testCase, index) => {
    const engineResult = engineResults?.[index];
    const engineCase =
      engineResult && typeof engineResult === "object" && !Array.isArray(engineResult)
        ? engineResult
        : null;
    const caseError = engineCase?.error ?? globalError;
    const caseStatus = normalizeStatus(engineCase?.status, caseError);
    const fatalStatus =
      FATAL_TEST_CASE_STATUSES.includes(caseStatus)
        ? caseStatus
        : topLevelFatalStatus;
    let outputValue;
    if (engineCase) {
      outputValue = engineCase.actualOutput !== undefined
        ? engineCase.actualOutput
        : engineCase.output !== undefined
          ? engineCase.output
          : engineCase.stdout;
    }
    if (
      outputValue === undefined &&
      cases.length === 1 &&
      !resultCountMismatch
    ) {
      outputValue = response.output;
    }
    const expectedValue = testCase?.expectedOutput;
    let status;

    if (fatalStatus) {
      status = fatalStatus;
    } else if (
      outputValue !== undefined &&
      expectedValue !== undefined &&
      !resultCountMismatch
    ) {
      status = outputsMatch(
        outputString(outputValue),
        outputString(expectedValue),
      )
        ? "PASSED"
        : "WRONG_ANSWER";
    } else if (["PENDING", "PROCESSING"].includes(caseStatus)) {
      status = caseStatus;
    } else {
      status = "SYSTEM_ERROR";
    }

    return {
      ...(testCase?._id || testCase?.id
        ? { testCaseId: String(testCase._id || testCase.id) }
        : {}),
      testCase: engineCase?.testCase ?? index + 1,
      input: outputString(testCase?.input),
      status,
      executionTime: engineCase?.executionTime ?? response.executionTime ?? 0,
      memoryUsed: engineCase?.memoryUsed ?? response.memoryUsed ?? 0,
      output: outputValue === undefined ? "" : outputString(outputValue),
      expectedOutput: outputString(expectedValue),
      error: caseError ? outputString(caseError) : "",
    };
  });

  const error = responseError ||
    (malformedResults
      ? "Execution engine returned malformed test results."
      : resultCountMismatch
        ? `Execution engine returned ${engineResults.length} result(s) for ${cases.length} test case(s).`
      : globalError);
  if (resultCountMismatch) {
    results.forEach((result) => {
      result.status = "SYSTEM_ERROR";
      result.error = error;
      result.output = "";
    });
  }
  return summarizeResults(results, cases.length, error);
}

export class ExecutionService {
  constructor(
    engineUrl = process.env.SECURE_CODE_ENGINE_URL || DEFAULT_ENGINE_URL,
    timeoutMs = Number(
      process.env.SECURE_CODE_ENGINE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
    ),
    apiKey = process.env.SECURE_CODE_ENGINE_API_KEY || "",
  ) {
    this.engineUrl = engineUrl;
    this.timeoutMs = Number.isFinite(timeoutMs)
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS;
    this.apiKey = apiKey;
  }

  async execute(code, testCases, language = "java", options = {}) {
    const normalizedLanguage = normalizeLanguage(language).toUpperCase();
    const cases = Array.isArray(testCases) ? testCases : [];
    if (cases.length === 0) {
      return summarizeResults([], 0, "No test cases were provided.");
    }

    // Log execution details only in development mode, redacted for security
    if (process.env.NODE_ENV === "development") {
      console.log("[ExecutionService] Request:", {
        url: this.engineUrl,
        language: normalizedLanguage,
        codeLength: (code || "").length,
        timeLimit: Number(options.timeLimit || 2000),
        memoryLimit: Number(options.memoryLimit || 65536),
        testCaseCount: cases.length,
      });
    }

    const results = new Array(cases.length);
    let nextIndex = 0;
    const runNextCase = async () => {
      while (nextIndex < cases.length) {
        const index = nextIndex++;
        const testCase = cases[index];
        const payload = {
          language: normalizedLanguage,
          code: code || "",
          timeLimit: Number(options.timeLimit || 2000),
          memoryLimit: Number(options.memoryLimit || 65536),
          testCases: [
            {
              input: outputString(testCase?.input),
              expectedOutput: outputString(testCase?.expectedOutput),
            },
          ],
        };
        results[index] = await this.executeSingleCase(
          payload,
          testCase,
          index,
        );
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(MAX_CONCURRENT_TEST_CASES, cases.length) },
        runNextCase,
      ),
    );
    return summarizeResults(results, cases.length);
  }

  async executeSingleCase(payload, testCase, index) {
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : null;

    try {
      const response = await fetch(this.engineUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      let body;
      if (typeof response.text === "function") {
        body = await response.text();
      } else if (typeof response.json === "function") {
        body = await response.json();
      } else {
        return failedCase(
          testCase,
          index,
          "Unrecognized response interface from execution engine.",
        );
      }

      if (!response.ok) {
        let engineError = "";
        try {
          const parsed = typeof body === "string" ? JSON.parse(body) : body;
          engineError = parsed?.error || parsed?.message || parsed?.details || "";
        } catch {
          engineError = "";
        }
        const message = engineError
          ? `Secure Code Engine error: ${engineError}`
          : `Secure Code Engine returned HTTP ${response.status}`;
        return failedCase(testCase, index, message);
      }

      const normalized = normalizeEngineResponse(body, [testCase]);
      if (normalized.results.length !== 1) {
        return failedCase(
          testCase,
          index,
          "Execution engine did not return exactly one test result.",
        );
      }
      return { ...normalized.results[0], testCase: index + 1 };
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[ExecutionService] Error:", {
          name: error.name,
          message: error.message,
          testCase: index + 1,
        });
      }
      return failedCase(
        testCase,
        index,
        error.name === "AbortError"
          ? "Secure Code Engine request timed out."
          : `Secure Code Engine request failed: ${error.message}`,
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async warmUp() {
    if (warmUpPromise) return warmUpPromise;
    if (Date.now() - lastWarmUpAt < WARM_UP_COOLDOWN_MS) {
      return { skipped: true };
    }

    lastWarmUpAt = Date.now();
    warmUpPromise = (async () => {
      const { composeProgram } = await import("./wrapperGenerator.js");
      const program = composeProgram(
        {
          signature: {
            name: "warmUp",
            returnType: "int",
            params: [],
          },
        },
        "class Solution { public int warmUp() { return 1; } }",
        "java",
      );
      const result = await this.execute(
        program,
        [{ input: "", expectedOutput: "1" }],
        "java",
        { timeLimit: 2000, memoryLimit: 65536 },
      );
      if (!result.accepted) {
        throw new Error(result.error || `Judge warm-up returned ${result.status}.`);
      }
      return { skipped: false };
    })();

    try {
      return await warmUpPromise;
    } catch (error) {
      lastWarmUpAt = Date.now() - WARM_UP_COOLDOWN_MS + 60_000;
      throw error;
    } finally {
      warmUpPromise = null;
    }
  }
}

export const executionService = new ExecutionService();
