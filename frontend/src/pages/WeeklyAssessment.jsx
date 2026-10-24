import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Code2,
  EyeOff,
  LogOut,
  Maximize2,
  Monitor,
  Play,
  Send,
  ShieldAlert,
  Timer,
} from "lucide-react";
import api from "../services/api";
import { getFreshAccessTokenForDesktopSubmission } from "../services/api";
import {
  executeVisibleCasesLocally,
  submitDailyChallengeLocally,
} from "../services/localExecutionService";
import { runSolution as runOnWeb } from "../services/submissionService";
import { API_BASE_URL } from "../utils/constants";
import CodeEditorSandbox from "../components/editor/CodeEditorSandbox";
import Console from "../components/editor/Console";
import ProctorGuard from "../components/editor/ProctorGuard";
import "./WeeklyAssessment.css";

const STARTED_CYCLE_STORAGE_KEY = "ccp-weekly-started-cycle";

function isDesktopLocalResult(submission) {
  return submission?.executionMode === "DESKTOP_LOCAL";
}

function recoveryKey(cycleOrId, dayIndex) {
  const cycleId = typeof cycleOrId === "string" ? cycleOrId : cycleOrId.id;
  return `ccp-weekly-source:${cycleId}:${dayIndex}`;
}

function readSavedSource(key) {
  let value;
  try {
    value = localStorage.getItem(key);
  } catch (storageError) {
    console.warn("Unable to read saved submission source:", storageError.message);
    return null;
  }
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.code === "string") return parsed;
  } catch {
    return { code: value, submissionId: "" };
  }
  return null;
}

function GlobalChallengeTimer({ endAt }) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const updateTime = () => {
      setTimeLeft(Math.max(0, Math.floor((new Date(endAt).getTime() - Date.now()) / 1000)));
    };
    updateTime();
    const intervalId = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(intervalId);
  }, [endAt]);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  return (
    <span className="weekly-challenge-timer" aria-label="Time remaining in today's challenge">
      <Timer size={16} />
      {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
      {String(seconds).padStart(2, "0")}
    </span>
  );
}

export default function WeeklyAssessment() {
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState(null);
  const [code, setCode] = useState("");
  const [localResult, setLocalResult] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [recoverableSubmissions, setRecoverableSubmissions] = useState([]);
  const [retryingId, setRetryingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [challengeStarted, setChallengeStarted] = useState(false);
  const [startedCycleId, setStartedCycleId] = useState("");
  const [fullscreenError, setFullscreenError] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [consoleHeight, setConsoleHeight] = useState(280);
  const isDesktop =
    typeof window !== "undefined" &&
    typeof window.codeClashDesktop?.engine?.execute === "function";

  const loadAssessment = useCallback(async ({ preserveError = false, silent = false } = {}) => {
    if (!silent) setLoading(true);
    if (!preserveError) setError("");
    try {
      const [currentResult, recoveryResult] = await Promise.allSettled([
        api.get("/weekly-assessments/current"),
        api.get("/weekly-assessments/recoverable"),
      ]);
      if (recoveryResult.status === "rejected") throw recoveryResult.reason;
      setRecoverableSubmissions(recoveryResult.value.data.submissions || []);
      if (currentResult.status === "rejected") {
        const currentError = currentResult.reason;
        if (currentError.message === "There is no active daily challenge." ||
          currentError.message === "There is no active weekly assessment.") {
          setAssessment(null);
          setCode("");
          setSubmissionResult(null);
          return;
        }
        throw currentError;
      }
      const { data } = currentResult.value;
      if (!data?.cycle || !data?.question) {
        setAssessment(null);
        setCode("");
        setSubmissionResult(null);
        return;
      }
      setAssessment(data);
      if (data.submission?.status === "FINALIZED") {
        window.dispatchEvent(new Event("ccp-daily-challenge-updated"));
      }
      const key = recoveryKey(data.cycle, data.dayIndex);
      const saved = readSavedSource(key);
      const initialCode = data.question.starterCodes?.java || "";
      setCode(saved?.code ?? initialCode);
      setSubmissionResult(data.submission?.status === "FINALIZED"
        ? { ...data.submission, status: data.submission.resultStatus }
        : null);
      if (data.submission?.status === "FINALIZED") {
        try {
          localStorage.removeItem(key);
        } catch (storageError) {
          console.warn("Unable to clear completed submission source:", storageError.message);
        }
      }
    } catch (requestError) {
      if (!preserveError) {
        setError(requestError.message || "Could not load the active assessment.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

  useEffect(() => {
    if (!assessment?.cycle?.id) return;
    try {
      if (sessionStorage.getItem(STARTED_CYCLE_STORAGE_KEY) === String(assessment.cycle.id)) {
        setStartedCycleId(String(assessment.cycle.id));
      }
    } catch (storageError) {
      console.warn("Unable to restore global challenge session state:", storageError.message);
    }
  }, [assessment?.cycle?.id]);

  const enterChallenge = async () => {
    setFullscreenError("");
    if (!document.fullscreenElement) {
      if (typeof document.documentElement.requestFullscreen !== "function") {
        setFullscreenError("Fullscreen mode is not available in this browser. Use a supported desktop browser to continue.");
        return;
      }
      try {
        await document.documentElement.requestFullscreen();
      } catch (fullscreenRequestError) {
        setFullscreenError(fullscreenRequestError.message || "Fullscreen mode could not be enabled. Allow fullscreen and try again.");
        return;
      }
    }

    if (typeof window.codeClashDesktop?.window?.setChallengeMode === "function") {
      try {
        await window.codeClashDesktop.window.setChallengeMode(true);
      } catch (challengeModeError) {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setFullscreenError(
          challengeModeError.message ||
            "The secure fullscreen challenge window could not be opened.",
        );
        return;
      }
    }

    const cycleId = String(assessment.cycle.id);
    try {
      sessionStorage.setItem(STARTED_CYCLE_STORAGE_KEY, cycleId);
    } catch (storageError) {
      console.warn("Unable to save global challenge session state:", storageError.message);
    }
    setStartedCycleId(cycleId);
    setChallengeStarted(true);
  };

  const exitChallengeMode = async () => {
    if (typeof window.codeClashDesktop?.window?.setChallengeMode === "function") {
      await window.codeClashDesktop.window.setChallengeMode(false);
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
    try {
      sessionStorage.removeItem(STARTED_CYCLE_STORAGE_KEY);
    } catch (storageError) {
      console.warn("Unable to clear global challenge session state:", storageError.message);
    }
    setChallengeStarted(false);
    setStartedCycleId("");
  };

  const endChallenge = async () => {
    if (!window.confirm("End the daily challenge now? Your current code will not be submitted.")) {
      return;
    }
    try {
      await exitChallengeMode();
      navigate("/", { replace: true });
    } catch (exitError) {
      setError(exitError.message || "Could not exit the challenge workspace.");
    }
  };

  const handleIntegrityEvent = async (event) => {
    if (!assessment?.cycle?.id) return;
    try {
      await api.post("/assessment-integrity/events", {
        ...event,
        assessmentType: "DAILY_CHALLENGE",
        assessmentId: assessment.cycle.id,
      });
    } catch (violationError) {
      setError(
        violationError.message ||
          "Integrity evidence could not be recorded. Please check your connection.",
      );
      throw violationError;
    }
  };

  useEffect(() => {
    if (!assessment?.cycle?.endAt) return undefined;
    const refreshDelay = Math.max(
      0,
      new Date(assessment.cycle.endAt).getTime() - Date.now() + 1000,
    );
    const timer = window.setTimeout(loadAssessment, refreshDelay);
    return () => window.clearTimeout(timer);
  }, [assessment?.cycle?.endAt, loadAssessment]);

  useEffect(() => {
    const activeSubmission = [
      "PENDING_VERIFICATION",
      "VERIFYING",
      "JUDGING",
    ].includes(assessment?.submission?.status);
    const activeRecovery = recoverableSubmissions.some((submission) =>
      ["PENDING_VERIFICATION", "VERIFYING", "JUDGING"].includes(
        submission.status,
      ),
    );
    if (!activeSubmission && !activeRecovery) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      loadAssessment({ preserveError: true, silent: true });
    }, 2000);
    return () => window.clearInterval(intervalId);
  }, [assessment?.submission?.status, recoverableSubmissions, loadAssessment]);

  const runLocally = async () => {
    setRunning(true);
    setError("");
    try {
      const result = isDesktop
        ? await executeVisibleCasesLocally({
            question: assessment.question,
            code,
            language: "java",
          })
        : await runOnWeb(assessment.question.id, code, "java");
      setLocalResult(result);
    } catch (runError) {
      setError(runError.message || "Could not run the solution.");
    } finally {
      setRunning(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    const key = recoveryKey(assessment.cycle, assessment.dayIndex);
    try {
      localStorage.setItem(key, JSON.stringify({ code }));
    } catch (storageError) {
      console.warn("Unable to save submission source for recovery:", storageError.message);
    }
    try {
      const data = isDesktop
        ? await submitDailyChallengeLocally({
            apiBaseUrl: API_BASE_URL,
            accessToken: await getFreshAccessTokenForDesktopSubmission(),
            cycleId: String(assessment.cycle.id),
            question: assessment.question,
            code,
          })
        : (await api.post("/weekly-assessments/submit", { code })).data;
      if (!data?.submission?.submissionId || !data.submission.status) {
        throw new Error("The server did not acknowledge this submission. Please retry.");
      }
      setAssessment((current) => current
        ? { ...current, submission: data.submission }
        : current);
      await loadAssessment({ preserveError: true, silent: true });
      window.dispatchEvent(new Event("ccp-daily-challenge-updated"));
      try {
        await exitChallengeMode();
      } catch (exitError) {
        setError(
          `Submission received, but fullscreen could not be closed: ${exitError.message}`,
        );
      }
    } catch (submitError) {
      setError(submitError.message || "Submission could not be finalized. Retry using the unchanged code.");
      const submissionId = submitError.response?.data?.submissionId;
      if (submissionId) {
        try {
          localStorage.setItem(key, JSON.stringify({ code, submissionId }));
        } catch (storageError) {
          console.warn("Unable to save recoverable submission source:", storageError.message);
        }
      }
      await loadAssessment({ preserveError: true, silent: true });
    } finally {
      setSubmitting(false);
    }
  };

  const retrySavedSubmission = async (submission) => {
    const key = recoveryKey(String(submission.cycleId), submission.dayIndex);
    const saved = readSavedSource(key);
    if (!saved?.code) {
      setError("The source for this recoverable submission is not available on this Desktop installation.");
      return;
    }
    setRetryingId(String(submission.id));
    setError("");
    try {
      await api.post(
        `/weekly-assessments/retry/${submission.id}`,
        { code: saved.code },
      );
      await loadAssessment({ preserveError: true, silent: true });
    } catch (retryError) {
      setError(retryError.message || "Could not recover this weekly submission.");
      const submissionId = retryError.response?.data?.submissionId;
      if (submissionId) {
        localStorage.setItem(key, JSON.stringify({ code: saved.code, submissionId }));
      }
      await loadAssessment({ silent: true });
    } finally {
      setRetryingId("");
    }
  };

  const displayedRecoverySubmissions = recoverableSubmissions.filter(
    (submission) =>
      !assessment ||
      String(submission.cycleId) !== String(assessment.cycle.id) ||
      submission.dayIndex !== assessment.dayIndex,
  );

  if (loading) {
    return <section className="weekly-page" aria-busy="true"><p>Loading today’s global challenge…</p></section>;
  }
  if (!assessment) {
    return (
      <section className="weekly-page">
        <header className="weekly-heading">
          <p className="weekly-eyebrow">CODECLASH GLOBAL CHALLENGE</p>
          <h1>Daily challenge</h1>
          <p>No daily challenge is open right now. Check back tomorrow for the next challenge.</p>
        </header>
        {error && <p className="weekly-error" role="alert">{error}</p>}
        {displayedRecoverySubmissions.length > 0 && (
          <section className="weekly-recovery-list">
            <h2>Daily submission status</h2>
            <p>Server verification continues after you leave this page. Submission status and verified results remain available during the recovery window.</p>
            {displayedRecoverySubmissions.map((submission) => (
              <div className="weekly-recovery-row" key={submission.id}>
                <span>
                  {submission.questionTitle} · {submission.status === "FINALIZED"
                    ? `Official result: ${submission.resultStatus}`
                    : submission.status}
                </span>
                {submission.status === "FINALIZED" ? (
                  <span role="status">
                    {submission.passed} / {submission.total} tests · {Number(submission.score).toFixed(2)} points
                  </span>
                ) : submission.canRetry ? (
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => retrySavedSubmission(submission)}
                    disabled={Boolean(retryingId)}
                  >
                    {retryingId === String(submission.id) ? "Submitting retry…" : "Retry saved submission"}
                  </button>
                ) : (
                  <span role="status">Verifying…</span>
                )}
              </div>
            ))}
          </section>
        )}
      </section>
    );
  }

  const hasFinalSubmission =
    Boolean(submissionResult) || assessment.submission?.status === "FINALIZED";
  const isVerifying = [
    "PENDING_VERIFICATION",
    "VERIFYING",
    "JUDGING",
  ].includes(assessment.submission?.status);
  const isDisqualified =
    assessment.roster?.participationStatus === "DISQUALIFIED";
  const serverDisqualified =
    assessment.roster?.participationStatus === "DISQUALIFIED";
  const canRetry =
    assessment.submission?.status === "RETRYABLE";
  const hasStartedChallenge =
    challengeStarted ||
    (startedCycleId === String(assessment.cycle.id) &&
      Boolean(document.fullscreenElement));
  const showInstructions =
    !hasStartedChallenge &&
    !hasFinalSubmission &&
    !isVerifying &&
    !canRetry &&
    !isDisqualified;

  return (
    showInstructions ? (
      <main className="weekly-instructions-page">
        <section className="weekly-instructions-card" aria-labelledby="weekly-instructions-title">
          <div className="weekly-instructions-icon"><ShieldAlert size={28} /></div>
          <p className="weekly-eyebrow">CODECLASH GLOBAL CHALLENGE</p>
          <h1 id="weekly-instructions-title">Before you begin</h1>
          <p className="weekly-instructions-intro">
            Read and follow these rules for the full challenge session.
          </p>

          <ul className="weekly-rules-list">
            <li><Monitor size={19} /><span><strong>Stay in fullscreen.</strong> Continue enters fullscreen; leaving fullscreen during the challenge is a proctoring violation.</span></li>
            <li><EyeOff size={19} /><span><strong>Stay on this page and keep this window focused.</strong> Switching tabs or windows may disqualify your attempt.</span></li>
            <li><Code2 size={19} /><span><strong>Write your solution in the coding editor.</strong> Copy and paste are allowed only inside the editor.</span></li>
            <li><ShieldAlert size={19} /><span><strong>Do not open developer tools or view page source.</strong> These actions are blocked during the challenge.</span></li>
            <li><Clock3 size={19} /><span><strong>Manage your time.</strong> The challenge closes when its countdown reaches zero.</span></li>
          </ul>

          {error && <p className="weekly-error" role="alert"><AlertCircle size={16} />{error}</p>}
          {fullscreenError && <p className="weekly-error" role="alert"><AlertCircle size={16} />{fullscreenError}</p>}
        </section>
        <footer className="weekly-instructions-footer">
          <span>Review the rules before entering the timed challenge workspace.</span>
          <button type="button" className="btn-primary" onClick={enterChallenge}>
            <Maximize2 size={16} /> I am ready for the challenge
          </button>
        </footer>
      </main>
    ) : (
      <main className="weekly-coding-page">
        <header className="weekly-coding-header">
          <div className="weekly-coding-title">
            <span className="weekly-eyebrow">GLOBAL CHALLENGE</span>
            <strong>{assessment.cycle.name}</strong>
          </div>
          <div className="weekly-coding-meta">
            {assessment.cycle.endAt && <GlobalChallengeTimer endAt={assessment.cycle.endAt} />}
            <button
              type="button"
              className="btn-secondary weekly-end-test"
              onClick={endChallenge}
              disabled={submitting}
            >
              <LogOut size={14} /> End test
            </button>
            <span>
              {hasFinalSubmission || !assessment.submission
                ? `${assessment.roster.score.toFixed(2)} / 100 points today`
                : "Score pending server verification"}
            </span>
          </div>
        </header>

        {error && <p className="weekly-error weekly-coding-error" role="alert"><AlertCircle size={16} />{error}</p>}
        {isDisqualified && (
          <section className="weekly-result weekly-authoritative-result weekly-coding-notice" role="alert">
            <h3><AlertCircle size={16} /> Daily challenge disqualified</h3>
            <p>Your official score is 0. This challenge can no longer be submitted.</p>
          </section>
        )}
        {isVerifying && (
          <section className="weekly-result weekly-coding-notice" role="status" aria-live="polite">
            <h3><Clock3 size={16} /> Submission received · Verifying...</h3>
            <p>Your solution is being verified by CodeClash. The official result will appear here when server checks finish.</p>
          </section>
        )}
        {assessment.submission?.status === "RETRYABLE" && (
          <section className="weekly-result weekly-coding-notice" role="alert">
            <h3><AlertCircle size={16} /> Verification could not be completed</h3>
            <p>Retry the exact saved source to request authoritative verification again.</p>
          </section>
        )}
        {displayedRecoverySubmissions.length > 0 && (
          <section className="weekly-recovery-list weekly-coding-notice">
            <h2>Daily submission status</h2>
            <p>Server verification continues after you leave this page. Submission status and verified results remain available during the recovery window.</p>
            {displayedRecoverySubmissions.map((submission) => (
              <div className="weekly-recovery-row" key={submission.id}>
                <span>
                  {submission.questionTitle} · {submission.status === "FINALIZED"
                    ? `${isDesktopLocalResult(submission) ? "Desktop local result" : "Server-verified result"}: ${submission.resultStatus}`
                    : submission.status}
                </span>
                {submission.status === "FINALIZED" ? (
                  <span role="status">
                    {submission.passed} / {submission.total} tests · {Number(submission.score).toFixed(2)} points
                  </span>
                ) : submission.canRetry ? (
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => retrySavedSubmission(submission)}
                    disabled={Boolean(retryingId)}
                  >
                    {retryingId === String(submission.id) ? "Submitting retry…" : "Retry saved submission"}
                  </button>
                ) : (
                  <span role="status">Verifying…</span>
                )}
              </div>
            ))}
          </section>
        )}

        <div className="weekly-challenge-workspace">
          <aside className="weekly-question-panel">
            <div className="weekly-question-panel-heading">
              <span>Problem</span>
              <span className={`weekly-difficulty difficulty-${assessment.question.difficulty?.toLowerCase()}`}>
                {assessment.question.difficulty}
              </span>
            </div>
            <div className="weekly-question-content">
              <div className="weekly-question-heading">{assessment.question.category}</div>
              <h1>{assessment.question.title}</h1>
              <p className="weekly-description">{assessment.question.description}</p>
              {assessment.question.constraints && (
                <section className="weekly-constraints">
                  <h2>Constraints</h2>
                  <p>{assessment.question.constraints}</p>
                </section>
              )}
              {(assessment.question.examples || []).map((example, index) => (
                <section className="weekly-example" key={`${index}-${example.input}`}>
                  <h2>Example {index + 1}</h2>
                  <pre><strong>Input</strong>{"\n"}{example.input}</pre>
                  <pre><strong>Output</strong>{"\n"}{example.output}</pre>
                  {example.explanation && <p>{example.explanation}</p>}
                </section>
              ))}
            </div>
          </aside>

          <section className="weekly-editor-panel">
            <div className="weekly-editor-toolbar">
              <span>Java · Global Challenge</span>
              <div className="weekly-actions">
                <button type="button" className="btn-secondary" onClick={runLocally} disabled={running || submitting || isDisqualified || isVerifying || hasFinalSubmission}>
                  <Play size={14} /> {running ? "Running…" : "Run"}
                </button>
                <button type="button" className="btn-primary" onClick={submit} disabled={submitting || running || isVerifying || hasFinalSubmission || isDisqualified}>
                  <Send size={14} /> {submitting ? "Submitting…" : isVerifying ? "Verifying…" : canRetry ? "Retry same code" : "Submit"}
                </button>
              </div>
            </div>
            <div className="weekly-editor-status" role="status" aria-live="polite">
              {isVerifying ? (
                <><strong>Submission received.</strong> Your solution is being verified by CodeClash.</>
              ) : hasFinalSubmission ? (
                <><strong>{isDesktopLocalResult(submissionResult || assessment.submission) ? "Desktop local result (not independently re-executed)" : "Server-verified result"}:</strong> {submissionResult?.passed ?? assessment.submission.passed}/{submissionResult?.total ?? assessment.submission.total} tests passed · {Number(submissionResult?.score ?? assessment.submission.score).toFixed(2)} points</>
              ) : canRetry ? (
                <>Verification could not be completed. Retry the exact saved source.</>
              ) : (
                <>Run feedback is {isDesktop ? "local" : "visible-case"} and is not authoritative.</>
              )}
            </div>
            <div className="weekly-code-editor-host">
              <CodeEditorSandbox
                value={code}
                onChange={setCode}
                readOnly={
                  hasFinalSubmission ||
                  isDisqualified ||
                  isVerifying ||
                  (canRetry &&
                    Boolean(
                      readSavedSource(
                        recoveryKey(assessment.cycle, assessment.dayIndex),
                      ),
                    ))
                }
                language="java"
                height="100%"
              />
            </div>
            {canRetry && <p className="weekly-retry-note">A recoverable judge attempt exists. Retry is bound to your previously submitted source.</p>}
            <div className="weekly-console">
              <Console
                result={localResult}
                resultAuthority="VISIBLE"
                isOpen={consoleOpen}
                onToggle={() => setConsoleOpen((open) => !open)}
                height={consoleOpen ? Math.max(160, consoleHeight) : 40}
                onHeightChange={setConsoleHeight}
              />
            </div>
            {hasFinalSubmission && (
              <section className="weekly-result weekly-authoritative-result weekly-final-result" aria-live="polite">
                <h3><CheckCircle2 size={16} /> {isDesktopLocalResult(submissionResult || assessment.submission) ? "Desktop local result · not independently re-executed" : "Server-verified result"} · {submissionResult?.resultStatus || submissionResult?.status || assessment.submission.resultStatus}</h3>
                <p>{submissionResult?.passed ?? assessment.submission.passed} / {submissionResult?.total ?? assessment.submission.total} test cases passed</p>
                <p>Daily score: {Number(submissionResult?.score ?? assessment.submission.score).toFixed(2)} / 100</p>
              </section>
            )}
          </section>
        </div>
        <ProctorGuard
          challengeId={assessment.cycle.id}
          assessmentId={assessment.cycle.id}
          assessmentType="DAILY_CHALLENGE"
          challengeLabel="daily challenge"
          onIntegrityEvent={handleIntegrityEvent}
          enabled={Boolean(
            hasStartedChallenge &&
              !hasFinalSubmission &&
              !isVerifying &&
              !serverDisqualified,
          )}
          onExit={() => navigate("/", { replace: true })}
        />
      </main>
    )
  );
}
