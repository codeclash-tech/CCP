const enabled = import.meta.env.VITE_BATTLE_ROOM_PERF_LOGS === "true";
const traces = new Map();

function now() {
  const monotonicMs = performance.now();
  return {
    timestamp: new Date(performance.timeOrigin + monotonicMs).toISOString(),
    monotonicMs,
  };
}

function log(event, trace, extra = {}) {
  console.info(
    "[ExecutionPerf] " +
      JSON.stringify({
        event,
        traceId: trace.id,
        requestId: trace.requestId || null,
        ...extra,
      }),
  );
}

export function beginExecutionTrace(action) {
  if (!enabled) return null;

  const click = now();
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const trace = { id, action, click, attempts: [] };
  traces.set(id, trace);
  log("USER_CLICK", trace, { action, ...click });
  return id;
}

export function currentExecutionTraceId() {
  if (!enabled || traces.size === 0) return null;
  return [...traces.keys()].at(-1) || null;
}

export function recordExecutionRequestStart(traceId, requestId) {
  const trace = traces.get(traceId);
  if (!trace) return null;
  const attempt = {
    index: trace.attempts.length + 1,
    requestId,
    requestStart: now(),
  };
  trace.attempts.push(attempt);
  log("API_REQUEST_START", trace, {
    attempt: attempt.index,
    ...attempt.requestStart,
  });
  return attempt.index;
}

export function recordExecutionResponseHeaders(traceId, attemptIndex, statusCode) {
  const trace = traces.get(traceId);
  const attempt = trace?.attempts.find(({ index }) => index === attemptIndex);
  if (!trace || !attempt || attempt.responseHeaders) return;
  attempt.responseHeaders = now();
  log("API_RESPONSE_HEADERS", trace, {
    attempt: attempt.index,
    statusCode,
    ...attempt.responseHeaders,
    durationMs: Number(
      (attempt.responseHeaders.monotonicMs - attempt.requestStart.monotonicMs).toFixed(3),
    ),
  });
}

export function recordExecutionResponseBody(traceId, attemptIndex, statusCode) {
  const trace = traces.get(traceId);
  const attempt = trace?.attempts.find(({ index }) => index === attemptIndex);
  if (!trace || !attempt || attempt.responseBody) return;
  attempt.responseBody = now();
  log("API_RESPONSE_BODY_COMPLETE", trace, {
    attempt: attempt.index,
    statusCode,
    ...attempt.responseBody,
    durationMs: Number(
      (attempt.responseBody.monotonicMs - attempt.requestStart.monotonicMs).toFixed(3),
    ),
  });
}

export function finishExecutionTrace(traceId) {
  const trace = traces.get(traceId);
  if (!trace) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const completed = now();
      log("UI_PROCESSING_COMPLETE", trace, {
        ...completed,
        durationMs: Number(
          (completed.monotonicMs - trace.click.monotonicMs).toFixed(3),
        ),
      });
      traces.delete(traceId);
    });
  });
}
