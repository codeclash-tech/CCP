import { useState, useRef, useEffect, useCallback } from "react";
import { getStatusColor } from "../../utils/helpers";
import {
  CheckCircle2,
  XCircle,
  Terminal,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  AlertTriangle,
} from "lucide-react";

const STATUS_LABELS = {
  ACCEPTED: "Accepted",
  PASSED: "Accepted",
  FAILED: "Wrong Answer",
  REJECTED: "Wrong Answer",
  WRONG_ANSWER: "Wrong Answer",
  COMPILE_ERROR: "Compilation Error",
  COMPILATION_ERROR: "Compilation Error",
  RUNTIME_ERROR: "Runtime Error",
  TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
  MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded",
  SYSTEM_ERROR: "System Error",
  PENDING: "Pending",
  PROCESSING: "Processing",
};

function formatStatus(status) {
  return STATUS_LABELS[status] || String(status || "Processing").replaceAll("_", " ");
}

// Individual display box for code results (Input, Output, Expected)
const CodeDataBox = ({ label, value, isError = false, isSuccess = false }) => (
  <div style={{ marginBottom: 16 }}>
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-muted)",
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <div
      style={{
        background: isError
          ? "rgba(218,54,51,0.08)"
          : isSuccess
            ? "rgba(44, 187, 93, 0.08)"
            : "rgba(0,0,0,0.15)",
        border: `1px solid ${
          isError
            ? "rgba(218,54,51,0.2)"
            : isSuccess
              ? "rgba(44, 187, 93, 0.2)"
              : "var(--border-color)"
        }`,
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "var(--font-code)",
        fontSize: 13,
        color: isError ? "var(--color-danger)" : "var(--text-primary)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {value !== undefined && value !== null && value !== "" ? (
        value
      ) : (
        <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
          Empty
        </span>
      )}
    </div>
  </div>
);

export default function Console({
  result,
  resultAuthority = "LOCAL",
  isOpen,
  onToggle,
  height = 320,
  onHeightChange,
}) {
  const [activeTestCaseIndex, setActiveTestCaseIndex] = useState(0);

  // Smooth window-level drag handling
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const onDragStart = useCallback(
    (e) => {
      e.preventDefault();
      draggingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = height;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "row-resize";
    },
    [height],
  );

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingRef.current) return;
      const delta = startYRef.current - e.clientY;
      const next = Math.min(
        Math.max(startHeightRef.current + delta, 120),
        window.innerHeight - 150,
      );
      if (onHeightChange) onHeightChange(next);
    };

    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onHeightChange]);

  // Safely extract metadata
  const results = Array.isArray(result?.results) ? result.results : [];
  const total = Math.max(Number(result?.total) || 0, results.length);
  const passed = results.filter((testCase) =>
    ["PASSED", "ACCEPTED"].includes(testCase.status),
  ).length;
  const failed = Math.max(0, total - passed);
  const isFatalStatus = [
    "COMPILATION_ERROR",
    "RUNTIME_ERROR",
    "TIME_LIMIT_EXCEEDED",
    "MEMORY_LIMIT_EXCEEDED",
    "SYSTEM_ERROR",
  ].includes(result?.status);
  const status = isFatalStatus
    ? result.status
    : !result
      ? "PROCESSING"
      : result.status === "PENDING" || result.status === "PROCESSING"
        ? result.status
        : total === 0
          ? "SYSTEM_ERROR"
          : passed === total && failed === 0
            ? "ACCEPTED"
            : "WRONG_ANSWER";
  const allPassed = status === "ACCEPTED" && passed === total && failed === 0;
  const globalError = result?.error || "";

  const displayedTestCases = results
    .map((testCase, index) => ({ testCase, index }))
  const activeTestCaseEntry =
    displayedTestCases[activeTestCaseIndex] || displayedTestCases[0];
  const activeTestCase = activeTestCaseEntry?.testCase;

  useEffect(() => {
    setActiveTestCaseIndex(0);
  }, [result]);

  return (
    <div
      style={{
        borderTop: "1px solid var(--border-color)",
        background: "var(--bg-card)",
        display: "flex",
        flexDirection: "column",
        height: isOpen ? height : "auto",
        minHeight: 40,
        position: "relative",
      }}
    >
      {/* Resizer Handle */}
      {isOpen && (
        <div
          onMouseDown={onDragStart}
          style={{
            height: 6,
            cursor: "row-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-elevated)",
            borderBottom: "1px solid var(--border-color)",
            userSelect: "none",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--border-strong)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "var(--bg-elevated)")
          }
        >
          <GripHorizontal color="var(--text-faint)" size={14} />
        </div>
      )}

      {/* Console Header Toggle */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "var(--bg-card)",
          borderBottom: isOpen ? "1px solid var(--border-color)" : "none",
          cursor: "pointer",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              color: isOpen ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: 14,
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "color 0.2s ease",
            }}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            <Terminal
              color={isOpen ? "var(--accent-blue-bright)" : "var(--text-muted)"}
              size={14}
            />
            Console
          </span>

          {/* Mini Status Summary in header */}
          {result && !isOpen && (
            <span
              style={{
                color: getStatusColor(status),
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginLeft: 12,
              }}
            >
              {allPassed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {formatStatus(status)}
            </span>
          )}
        </div>
      </div>

      {/* Main Console Content */}
      {isOpen && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "var(--bg-elevated)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              borderBottom: "1px solid var(--border-color)",
              padding: "12px 16px",
              background: "var(--bg-card)",
            }}
          >
            <strong style={{ color: "var(--text-primary)", fontSize: 14 }}>
              {resultAuthority === "OFFICIAL"
                ? "Final result"
                : "Preview result"}
            </strong>
            {result && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: getStatusColor(status), fontSize: 13, fontWeight: 700 }}>
                  {formatStatus(status)}
                </span>
                <span style={{ color: "var(--color-success)", fontSize: 12 }}>
                  {passed} passed
                </span>
                <span style={{ color: failed > 0 ? "var(--color-danger)" : "var(--text-muted)", fontSize: 12 }}>
                  {failed} failed
                </span>
                {total > 0 && (
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {total} total
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: 16,
              fontFamily: "var(--font-ui)",
            }}
          >
            {globalError && (
              <details open={results.length === 0} style={{ marginBottom: 14, color: "var(--text-primary)" }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  Error Details
                </summary>
                <CodeDataBox isError label="Execution Error" value={globalError} />
              </details>
            )}
            {results.length === 0 && !globalError ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  textAlign: "center",
                  padding: 40,
                  fontSize: 13,
                }}
              >
                You must run your code first to see results.
              </div>
            ) : results.length === 0 && globalError ? (
              <div style={{ color: "var(--color-danger)", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <AlertTriangle size={16} />
                {formatStatus(status)}
              </div>
            ) : activeTestCase ? (
              // Results UI (LeetCode Style)
              <div>
                {/* Sub-tabs for each Test Case */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 16,
                    flexWrap: "wrap",
                  }}
                >
                  {displayedTestCases.map(({ testCase: tc, index: resultIndex }, index) => {
                    const isPassedCase =
                      tc.status === "PASSED" || tc.status === "ACCEPTED";
                    return (
                      <button
                        key={resultIndex}
                        onClick={() => setActiveTestCaseIndex(index)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 14px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          background:
                            activeTestCaseIndex === index
                              ? "rgba(0,0,0,0.2)"
                              : "transparent",
                          border:
                            activeTestCaseIndex === index
                              ? "1px solid var(--border-color)"
                              : "1px solid transparent",
                          color:
                            activeTestCaseIndex === index
                              ? "var(--text-primary)"
                              : "var(--text-muted)",
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background:                             isPassedCase
                              ? "var(--color-success)"
                              : "var(--color-danger)",
                          }}
                        />
                        {tc.isHidden ? "Hidden " : ""}
                        Test case {tc.testCase ?? resultIndex + 1}
                      </button>
                    );
                  })}
                </div>

                {/* Active Test Case Data */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div
                    role="status"
                    style={{
                      color:
                        activeTestCase.status === "PASSED" ||
                        activeTestCase.status === "ACCEPTED"
                          ? "var(--color-success)"
                          : "var(--color-danger)",
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 14,
                    }}
                  >
                    {formatStatus(activeTestCase.status)}
                    {activeTestCase.executionTime !== undefined &&
                      ` · ${activeTestCase.executionTime} ms`}
                  </div>

                  {activeTestCase.isHidden ? (
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      Hidden test-case details are not shown.
                    </div>
                  ) : (
                    <>
                      <CodeDataBox
                        label={`Input · Test case ${activeTestCase.testCase ?? activeTestCaseEntry.index + 1}`}
                        value={activeTestCase.input ?? activeTestCase.testCase}
                      />

                      <CodeDataBox
                        isError={
                          activeTestCase.status !== "PASSED" &&
                          activeTestCase.status !== "ACCEPTED"
                        }
                        label="Actual Output"
                        value={activeTestCase.output}
                      />

                      <CodeDataBox
                        isSuccess={true}
                        label="Expected Output"
                        value={activeTestCase.expectedOutput}
                      />
                    </>
                  )}

                  {!activeTestCase.isHidden && activeTestCase.error && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>
                        Failure Reason
                      </summary>
                      <CodeDataBox isError label="Error" value={activeTestCase.error} />
                    </details>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
