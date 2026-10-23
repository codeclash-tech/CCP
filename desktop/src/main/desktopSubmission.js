import { createHash } from "node:crypto";
import { normalizeExecutionRequest } from "./executionRequest.js";

const PRODUCTION_API_HOST = "ccp-backend-qylz.onrender.com";
const EXECUTION_TIMEOUT_MS = 300_000;
const SUBMISSION_TIMEOUT_MS = 330_000;
const REQUEST_TIMEOUT_MS = 15_000;

function getApiBaseUrl(rawUrl, isPackaged) {
  let apiUrl;
  try {
    apiUrl = new URL(rawUrl);
  } catch {
    throw new TypeError("A valid CodeClash API URL is required.");
  }

  const isLocalDevelopment =
    !isPackaged &&
    ["localhost", "127.0.0.1"].includes(apiUrl.hostname) &&
    apiUrl.port === "5000" &&
    apiUrl.protocol === "http:";
  const isProduction =
    apiUrl.protocol === "https:" && apiUrl.hostname === PRODUCTION_API_HOST;

  if (
    (!isLocalDevelopment && !isProduction) ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash ||
    !apiUrl.pathname.replace(/\/+$/, "").endsWith("/api")
  ) {
    throw new TypeError("The CodeClash API URL is not an approved endpoint.");
  }
  apiUrl.pathname = apiUrl.pathname.replace(/\/+$/, "");
  return apiUrl;
}

function assertSubmissionRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("A desktop submission request is required.");
  }
  if (!/^[A-Z0-9]{6}$/i.test(request.roomCode || "")) {
    throw new TypeError("A valid Battle Room code is required.");
  }
  if (!/^[a-f\d]{24}$/i.test(request.questionId || "")) {
    throw new TypeError("A valid question ID is required.");
  }
  if (
    typeof request.code !== "string" ||
    !request.code.trim() ||
    request.code.length > 50_000
  ) {
    throw new TypeError("Java source code must contain 1 to 50000 characters.");
  }
  if (
    request.executionCode !== undefined &&
    (typeof request.executionCode !== "string" ||
      !request.executionCode.trim() ||
      request.executionCode.length > 50_000)
  ) {
    throw new TypeError("The Java source for execution is invalid or too long.");
  }
  if (
    typeof request.accessToken !== "string" ||
    request.accessToken.length < 16 ||
    request.accessToken.length > 8_192
  ) {
    throw new TypeError("An authenticated desktop session is required.");
  }
}

async function requestJson(fetchImpl, url, accessToken, body, timeoutMs) {
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      responseBody?.error ||
      responseBody?.message ||
      `The CodeClash backend returned HTTP ${response.status}.`;
    throw new Error(`${message} (HTTP ${response.status})`);
  }
  if (!responseBody || typeof responseBody !== "object") {
    throw new Error("The CodeClash backend returned an invalid response.");
  }
  return responseBody;
}

function normalizeGrant(grant, code) {
  if (
    !grant ||
    typeof grant.nonce !== "string" ||
    !/^[a-f\d]{64}$/i.test(grant.nonce) ||
    !Array.isArray(grant.testCases) ||
    !Number.isInteger(grant.visibleTestCaseCount) ||
    grant.visibleTestCaseCount < 0 ||
    grant.visibleTestCaseCount !== grant.testCases.length
  ) {
    throw new Error("The CodeClash backend returned an invalid execution grant.");
  }

  const executionRequest = normalizeExecutionRequest({
    code,
    language: "JAVA",
    testCases: grant.testCases,
    timeLimit: grant.timeLimit,
    memoryLimit: grant.memoryLimit,
  });
  return {
    nonce: grant.nonce,
    visibleTestCaseCount: grant.visibleTestCaseCount,
    executionRequest,
  };
}

export async function submitDesktopQuestion({
  engine,
  fetchImpl = fetch,
  isPackaged,
  request,
}) {
  assertSubmissionRequest(request);
  if (!engine || typeof engine.execute !== "function") {
    throw new TypeError("The local Java engine is not available.");
  }
  const apiBaseUrl = getApiBaseUrl(request.apiBaseUrl, isPackaged);
  const roomPath = `/battle-rooms/${request.roomCode.toUpperCase()}`;
  const grant = await requestJson(
    fetchImpl,
    new URL(`${roomPath}/desktop-execution`, apiBaseUrl),
    request.accessToken,
    {
      questionId: request.questionId,
      codeHash: createHash("sha256").update(request.code, "utf8").digest("hex"),
    },
    REQUEST_TIMEOUT_MS,
  );
  const normalizedGrant = normalizeGrant(
    grant,
    request.executionCode ?? request.code,
  );
  try {
    await engine.execute(normalizedGrant.executionRequest);
  } catch (error) {
    console.error("Local execution failed during Desktop submission:", error);
    throw new Error("Code execution is currently unavailable.");
  }
  const submission = await requestJson(
    fetchImpl,
    new URL(`${roomPath}/submit`, apiBaseUrl),
    request.accessToken,
    {
      questionId: request.questionId,
      code: request.code,
      language: "java",
      desktopNonce: normalizedGrant.nonce,
    },
    SUBMISSION_TIMEOUT_MS,
  );

  if (!submission.questionResult) {
    throw new Error("The CodeClash backend returned an incomplete submission result.");
  }
  return submission;
}
