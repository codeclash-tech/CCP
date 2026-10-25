import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import {
  createLocalExecutionTranscript,
  hashSource,
} from "./localExecutionTranscript.js";

const PRODUCTION_API_HOST = "ccp-backend-qylz.onrender.com";
const REQUEST_TIMEOUT_MS = 15_000;
const LOCAL_EXECUTION_PROTOCOL_VERSION = 1;

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

function assertSubmissionRequest(request, assessmentType) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("A desktop submission request is required.");
  }
  if (!/^[a-f\d]{24}$/i.test(request.questionId || "")) {
    throw new TypeError("A valid question ID is required.");
  }
  if (
    assessmentType === "BATTLE_ROOM" &&
    !/^[A-Z0-9]{6}$/i.test(request.roomCode || "")
  ) {
    throw new TypeError("A valid Battle Room code is required.");
  }
  if (
    assessmentType === "DAILY_CHALLENGE" &&
    !/^[a-f\d]{24}$/i.test(request.cycleId || "")
  ) {
    throw new TypeError("A valid Daily Challenge cycle ID is required.");
  }
  if (
    typeof request.code !== "string" ||
    !request.code.trim() ||
    request.code.length > 50_000
  ) {
    throw new TypeError("Java source code must contain 1 to 50000 characters.");
  }
  if (
    typeof request.accessToken !== "string" ||
    request.accessToken.length < 16 ||
    request.accessToken.length > 8_192
  ) {
    throw new TypeError("An authenticated desktop session is required.");
  }
  if (
    typeof request.executionCode !== "string" ||
    !request.executionCode.trim() ||
    !Array.isArray(request.testCases) ||
    request.testCases.length === 0 ||
    request.testCases.length > 50 ||
    request.testCases.some(
      (testCase) =>
        !testCase ||
        typeof testCase.input !== "string" ||
        typeof testCase.expectedOutput !== "string",
    )
  ) {
    throw new TypeError("The local execution test set is invalid.");
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
    const requestId =
      responseBody?.requestId ||
      response.headers?.get?.("x-request-id");
    throw new Error(
      `${message} (HTTP ${response.status}${requestId ? `, request ID: ${requestId}` : ""})`,
    );
  }
  if (!responseBody || typeof responseBody !== "object") {
    throw new Error("The CodeClash backend returned an invalid response.");
  }
  return responseBody;
}

function normalizeGrant(grant) {
  if (
    !grant ||
    typeof grant.nonce !== "string" ||
    !/^[a-f\d]{64}$/i.test(grant.nonce)
  ) {
    throw new Error("The CodeClash backend returned an invalid execution grant.");
  }

  return grant.nonce;
}

function apiEndpoint(apiBaseUrl, endpointPath) {
  const basePath = apiBaseUrl.pathname.replace(/\/+$/, "");
  const endpoint = endpointPath.replace(/^\/+/, "");
  return new URL(`${basePath}/${endpoint}`, apiBaseUrl.origin);
}

async function submitDesktopLocalResult({
  assessmentType,
  fetchImpl = fetch,
  engine,
  isPackaged,
  request,
  clientVersion,
  engineVersion,
}) {
  assertSubmissionRequest(request, assessmentType);
  const apiBaseUrl = getApiBaseUrl(request.apiBaseUrl, isPackaged);
  if (isPackaged && typeof engine?.verifyIntegrity !== "function") {
    throw new Error("The packaged Desktop integrity verifier is unavailable.");
  }
  await engine?.verifyIntegrity?.();
  const sourceHash = hashSource(request.code);
  const executionId = randomUUID();
  const basePath =
    assessmentType === "BATTLE_ROOM"
      ? `battle-rooms/${request.roomCode.toUpperCase()}`
      : "weekly-assessments";
  const grant = await requestJson(
    fetchImpl,
    apiEndpoint(
      apiBaseUrl,
      `${basePath}/${assessmentType === "BATTLE_ROOM" ? "desktop-execution" : "desktop-grant"}`,
    ),
    request.accessToken,
    {
      questionId: request.questionId,
      ...(assessmentType === "BATTLE_ROOM" ? { codeHash: sourceHash } : { sourceHash }),
      ...(assessmentType === "DAILY_CHALLENGE"
        ? { cycleId: request.cycleId }
        : {}),
      executionId,
      clientVersion,
      engineVersion,
      executionProtocolVersion: LOCAL_EXECUTION_PROTOCOL_VERSION,
    },
    REQUEST_TIMEOUT_MS,
  );

  const nonce = normalizeGrant(grant);
  if (
    grant.executionId !== executionId ||
    grant.clientVersion !== clientVersion ||
    grant.engineVersion !== engineVersion ||
    grant.executionProtocolVersion !== LOCAL_EXECUTION_PROTOCOL_VERSION ||
    typeof grant.testCount !== "number" ||
    grant.testCount !== request.testCases.length
  ) {
    throw new Error("The CodeClash backend returned a mismatched execution grant.");
  }

  const executionStartedAt = Date.now();
  const performanceStartedAt = performance.now();
  const execution = await engine.execute({
    code: request.executionCode,
    language: "java",
    testCases: request.testCases,
  });
  const executionFinishedAt = Date.now();
  const { transcript, transcriptHash } = createLocalExecutionTranscript({
    grant: { ...grant, nonce },
    sourceHash,
    execution,
    startedAt: executionStartedAt,
    finishedAt: executionFinishedAt,
    durationMs: performance.now() - performanceStartedAt,
  });

  return requestJson(
    fetchImpl,
    apiEndpoint(apiBaseUrl, `${basePath}/desktop-finalize`),
    request.accessToken,
    { transcript, transcriptHash },
    REQUEST_TIMEOUT_MS,
  );
}

export function submitDesktopQuestion(options) {
  return submitDesktopLocalResult({
    ...options,
    assessmentType: "BATTLE_ROOM",
  }).then((result) => {
    if (!result.questionResult) {
      throw new Error("The CodeClash backend returned an incomplete submission result.");
    }
    return result;
  });
}

export function submitDesktopDailyQuestion(options) {
  return submitDesktopLocalResult({
    ...options,
    assessmentType: "DAILY_CHALLENGE",
  });
}
