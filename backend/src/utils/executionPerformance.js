import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

const requestStorage = new AsyncLocalStorage();
const enabled = () => process.env.BATTLE_ROOM_PERF_LOGS === "true";

function clock() {
  const monotonicMs = performance.now();
  return {
    timestamp: new Date(performance.timeOrigin + monotonicMs).toISOString(),
    monotonicMs,
  };
}

function recordPhase(trace, name, start, end = clock()) {
  trace.phases.push({
    name,
    startTimestamp: start.timestamp,
    startMonotonicMs: start.monotonicMs,
    endTimestamp: end.timestamp,
    endMonotonicMs: end.monotonicMs,
    durationMs: Number((end.monotonicMs - start.monotonicMs).toFixed(3)),
  });
}

function safeRoutePath(path) {
  return path.replace(
    /\/battle-rooms\/[^/?]+\/(run|submit)(?=[?#]|$)/i,
    "/battle-rooms/:roomCode/$1",
  );
}

export function beginExecutionPhase(name) {
  const trace = requestStorage.getStore();
  if (!trace || !enabled()) return () => {};

  const start = clock();
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    recordPhase(trace, name, start);
  };
}

export async function measureExecutionPhase(name, operation) {
  const finish = beginExecutionPhase(name);
  try {
    return await operation();
  } finally {
    finish();
  }
}

export function executionPerformanceMiddleware(req, res, next) {
  const path = req.originalUrl || req.url || "";
  if (
    !enabled() ||
    !/\/battle-rooms\/[^/?]+\/(?:run|submit)(?:[?#]|$)/i.test(path)
  ) {
    next();
    return;
  }

  const received = clock();
  const trace = {
    requestId: req.requestId || "missing",
    method: req.method,
    path: safeRoutePath(req.path),
    phases: [],
    requestReceived: received,
    responseStarted: null,
  };
  recordPhase(trace, "HTTP_REQUEST_RECEIVED", received, received);

  requestStorage.run(trace, () => {
    const originalJson = res.json;
    res.json = function instrumentedJson(...args) {
      if (!trace.responseStarted) trace.responseStarted = clock();
      const serializationStart = clock();
      try {
        return originalJson.apply(this, args);
      } finally {
        recordPhase(trace, "RESPONSE_SERIALIZATION", serializationStart);
      }
    };

    res.once("finish", () => {
      const finished = clock();
      const requestDurationMs = Number(
        (finished.monotonicMs - received.monotonicMs).toFixed(3),
      );
      if (trace.responseStarted) {
        recordPhase(trace, "CONTROLLER_RESPONSE", trace.responseStarted, finished);
      }

      const phaseDuration = (name) =>
        Number(
          trace.phases
            .filter((phase) => phase.name === name)
            .reduce((total, phase) => total + phase.durationMs, 0)
            .toFixed(3),
        );
      const summary = {
        REQUEST_TOTAL: requestDurationMs,
        BACKEND_TOTAL: requestDurationMs,
        AUTH: phaseDuration("AUTH"),
        ROOM_DB: phaseDuration("ROOM_LOOKUP"),
        SUBMISSION_DB: phaseDuration("SUBMISSION_LOOKUP"),
        QUESTION_DB: phaseDuration("QUESTION_LOOKUP"),
        TEST_PREPARATION: phaseDuration("TEST_PREPARATION"),
        ENGINE_WAIT: phaseDuration("ENGINE_WAIT"),
        ENGINE_BODY_READ: phaseDuration("ENGINE_BODY_READ"),
        NORMALIZATION: phaseDuration("NORMALIZATION"),
        SCORING: phaseDuration("SCORING"),
        FIRST_DB_WRITE: phaseDuration("FIRST_DB_WRITE"),
        OTHER_DB: phaseDuration("OTHER_DB"),
        RESPONSE_SERIALIZATION: phaseDuration("RESPONSE_SERIALIZATION"),
      };

      console.info(
        "[ExecutionPerf] " +
          JSON.stringify({
            event: "request_complete",
            requestId: trace.requestId,
            method: trace.method,
            path: trace.path,
            statusCode: res.statusCode,
            phases: trace.phases,
            summary,
          }),
      );
    });

    next();
  });
}
