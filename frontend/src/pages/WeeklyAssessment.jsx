import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Play, Send } from "lucide-react";
import api from "../services/api";
import { executeVisibleCasesLocally } from "../services/localExecutionService";
import { runSolution as runOnWeb } from "../services/submissionService";
import CodeEditorSandbox from "../components/editor/CodeEditorSandbox";
import "./WeeklyAssessment.css";

function formatDate(value) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
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

export default function WeeklyAssessment() {
  const [assessment, setAssessment] = useState(null);
  const [code, setCode] = useState("");
  const [localResult, setLocalResult] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [recoverableSubmissions, setRecoverableSubmissions] = useState([]);
  const [recoveredResult, setRecoveredResult] = useState(null);
  const [retryingId, setRetryingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isDesktop =
    typeof window !== "undefined" &&
    typeof window.codeClashDesktop?.engine?.execute === "function";

  const loadAssessment = useCallback(async ({ preserveError = false } = {}) => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

  useEffect(() => {
    if (!assessment?.cycle?.endAt) return undefined;
    const refreshDelay = Math.max(
      0,
      new Date(assessment.cycle.endAt).getTime() - Date.now() + 1000,
    );
    const timer = window.setTimeout(loadAssessment, refreshDelay);
    return () => window.clearTimeout(timer);
  }, [assessment?.cycle?.endAt, loadAssessment]);

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
      const { data } = await api.post("/weekly-assessments/submit", { code });
      setSubmissionResult(data.result);
      try {
        localStorage.removeItem(key);
      } catch (storageError) {
        console.warn("Unable to clear completed submission source:", storageError.message);
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
      await loadAssessment({ preserveError: true });
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
      const { data } = await api.post(
        `/weekly-assessments/retry/${submission.id}`,
        { code: saved.code },
      );
      try {
        localStorage.removeItem(key);
      } catch (storageError) {
        console.warn("Unable to clear recovered submission source:", storageError.message);
      }
      setRecoveredResult({
        ...data.result,
        dayNumber: submission.dayNumber,
        questionTitle: submission.questionTitle,
      });
      await loadAssessment({ preserveError: true });
    } catch (retryError) {
      setError(retryError.message || "Could not recover this weekly submission.");
      const submissionId = retryError.response?.data?.submissionId;
      if (submissionId) {
        localStorage.setItem(key, JSON.stringify({ code: saved.code, submissionId }));
      }
      await loadAssessment();
    } finally {
      setRetryingId("");
    }
  };

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
        {recoveredResult && (
          <section className="weekly-result weekly-authoritative-result" aria-live="polite">
            <h3><CheckCircle2 size={16} /> Recovered daily result · {recoveredResult.status}</h3>
            <p>{recoveredResult.passed} / {recoveredResult.total} test cases passed · {recoveredResult.score.toFixed(2)} points</p>
          </section>
        )}
        {recoverableSubmissions.length > 0 && (
          <section className="weekly-recovery-list">
            <h2>Recoverable daily submission</h2>
            <p>Your submission can be retried for 24 hours after today’s challenge closes, using only its original saved source.</p>
            {recoverableSubmissions.map((submission) => (
              <div className="weekly-recovery-row" key={submission.id}>
                <span>{submission.questionTitle}</span>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => retrySavedSubmission(submission)}
                  disabled={Boolean(retryingId)}
                >
                  {retryingId === String(submission.id) ? "Retrying…" : "Retry saved submission"}
                </button>
              </div>
            ))}
          </section>
        )}
      </section>
    );
  }

  const hasFinalSubmission =
    Boolean(submissionResult) || assessment.submission?.status === "FINALIZED";
  const canRetry =
    assessment.submission?.status === "RETRYABLE" ||
    assessment.submission?.status === "JUDGING";

  return (
    <section className="weekly-page">
      <header className="weekly-heading">
        <p className="weekly-eyebrow">GLOBAL CHALLENGE · {assessment.cycle.cycleKey}</p>
        <h1>{assessment.cycle.name}</h1>
        <div className="weekly-meta">
          <span><Clock3 size={15} /> Today’s challenge</span>
          <span>Closes {formatDate(assessment.cycle.endAt)}</span>
          <span>{assessment.roster.score.toFixed(2)} / 100 points today</span>
        </div>
      </header>

      {error && <p className="weekly-error" role="alert"><AlertCircle size={16} />{error}</p>}
      {recoveredResult && (
        <section className="weekly-result weekly-authoritative-result" aria-live="polite">
          <h3><CheckCircle2 size={16} /> Recovered daily result · {recoveredResult.status}</h3>
          <p>{recoveredResult.passed} / {recoveredResult.total} test cases passed · {recoveredResult.score.toFixed(2)} points</p>
        </section>
      )}
      {recoverableSubmissions.length > 0 && (
        <section className="weekly-recovery-list">
          <h2>Recoverable daily submission</h2>
          <p>Your submission can be retried for 24 hours after today’s challenge closes, using only its original saved source.</p>
          {recoverableSubmissions.map((submission) => (
            <div className="weekly-recovery-row" key={submission.id}>
              <span>{submission.questionTitle}</span>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => retrySavedSubmission(submission)}
                disabled={Boolean(retryingId)}
              >
                {retryingId === String(submission.id) ? "Retrying…" : "Retry saved submission"}
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="weekly-workspace">
        <article className="weekly-question">
          <div className="weekly-question-heading">
            <span className={`weekly-difficulty difficulty-${assessment.question.difficulty?.toLowerCase()}`}>
              {assessment.question.difficulty}
            </span>
            <span>{assessment.question.category}</span>
          </div>
          <h2>{assessment.question.title}</h2>
          <p className="weekly-description">{assessment.question.description}</p>
          {assessment.question.constraints && (
            <section className="weekly-constraints">
              <h3>Constraints</h3>
              <p>{assessment.question.constraints}</p>
            </section>
          )}
          {(assessment.question.examples || []).map((example, index) => (
            <section className="weekly-example" key={`${index}-${example.input}`}>
              <h3>Example {index + 1}</h3>
              <pre><strong>Input</strong>{"\n"}{example.input}</pre>
              <pre><strong>Output</strong>{"\n"}{example.output}</pre>
              {example.explanation && <p>{example.explanation}</p>}
            </section>
          ))}
        </article>

        <article className="weekly-editor-panel">
          <div className="weekly-editor-heading">
            <div><h2>Java solution</h2><span>Run checks the visible examples.</span></div>
            <div className="weekly-actions">
              <button type="button" className="btn-secondary" onClick={runLocally} disabled={running || submitting}>
                <Play size={15} /> {running ? "Running…" : "Run"}
              </button>
              <button type="button" className="btn-primary" onClick={submit} disabled={submitting || running || hasFinalSubmission}>
                <Send size={15} /> {submitting ? "Judging…" : canRetry ? "Retry same code" : "Submit"}
              </button>
            </div>
          </div>
          <div className="weekly-code-editor-host">
            <CodeEditorSandbox
              value={code}
              onChange={setCode}
              readOnly={
                hasFinalSubmission ||
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
          {localResult && (
            <section className="weekly-result" aria-live="polite">
              <h3><Play size={15} /> Run results · {localResult.status}</h3>
              {(localResult.results || []).map((item, index) => (
                <p key={`${index}-${item.status}`} className={item.status === "PASSED" ? "weekly-pass" : "weekly-fail"}>
                  Case {index + 1}: {item.status}
                  {item.output ? <code> · {item.output}</code> : ""}
                </p>
              ))}
            </section>
          )}
          {hasFinalSubmission && (
            <section className="weekly-result weekly-authoritative-result" aria-live="polite">
              <h3><CheckCircle2 size={16} /> Authoritative result · {submissionResult?.resultStatus || submissionResult?.status || assessment.submission.resultStatus}</h3>
              <p>{submissionResult?.passed ?? assessment.submission.passed} / {submissionResult?.total ?? assessment.submission.total} test cases passed</p>
              <p>Daily score: {Number(submissionResult?.score ?? assessment.submission.score).toFixed(2)} / 100</p>
            </section>
          )}
        </article>
      </div>
    </section>
  );
}
