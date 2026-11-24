import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Timer, CheckCircle2, XCircle } from "lucide-react";
import api from "../services/api";
import PageSkeleton from "../components/layout/PageSkeleton";
import "./StrictAssessment.css";

/**
 * Strict Evaluation runner for a published learning module.
 * Free for students — launched from the Challenges page.
 * Never teaches, never reveals correct answers before submission.
 */
export default function StrictAssessment() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);

  const start = useCallback(async () => {
    setStarting(true);
    setError("");
    try {
      // strict topics live under the module; the backend picks the module's
      // topics in order — here we start the first (and typically only) topic.
      const { data } = await api.post(
        `/learning-strict/modules/${moduleId}/attempt`,
        { topicId: null },
      );
      setAssessment(data);
      setAnswers(data.savedAnswers || {});
      if (data.expiresAt) {
        setRemainingSeconds(
          Math.max(
            0,
            Math.round((new Date(data.expiresAt) - Date.now()) / 1000),
          ),
        );
      }
    } catch (startError) {
      setError(
        startError.response?.data?.error ||
          startError.message ||
          "Could not start this assessment.",
      );
    } finally {
      setStarting(false);
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    setLoading(true);
    start();
  }, [start]);

  useEffect(() => {
    if (remainingSeconds === null || result) return undefined;
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current === null) return current;
        if (current <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [remainingSeconds, result]);

  const submit = async () => {
    if (!assessment || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const { data } = await api.post(
        `/learning-strict/attempts/${assessment.attemptId}/submit`,
        { answers },
      );
      setResult(data.result);
      setRemainingSeconds(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(
        submitError.response?.data?.error ||
          submitError.message ||
          "Could not submit your answers.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageSkeleton label="Loading assessment" />;

  if (error && !assessment) {
    return (
      <main className="strict-page">
        <button
          className="btn-secondary strict-back"
          onClick={() => navigate("/challenges")}
          type="button"
        >
          <ArrowLeft size={15} /> Back to challenges
        </button>
        <p className="weekly-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (result) {
    return (
      <main className="strict-page">
        <header className="challenges-header">
          <p className="challenges-eyebrow">STRICT EVALUATION RESULT</p>
          <h1>{assessment?.module?.title}</h1>
          <p>
            Your report has been emailed to you and saved in your assessment
            history.
          </p>
        </header>
        <section className="strict-result-card">
          <div className="strict-result-summary">
            <div>
              <span>Overall level</span>
              <strong>{result.overallLevel}</strong>
            </div>
            <div>
              <span>Score</span>
              <strong>{result.scorePercent}%</strong>
            </div>
          </div>
          {result.objectiveResults?.length > 0 && (
            <div className="strict-objectives">
              {result.objectiveResults.map((entry) => (
                <div className="strict-objective-row" key={entry.objectiveKey}>
                  <strong>{entry.objectiveTitle || entry.objectiveKey}</strong>
                  <span>
                    {entry.level} · {entry.scorePercent}%
                  </span>
                </div>
              ))}
            </div>
          )}
          {result.strengths?.length > 0 && (
            <div className="strict-report-block">
              <h2>Strengths</h2>
              <ul>
                {result.strengths.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {result.weaknesses?.length > 0 && (
            <div className="strict-report-block">
              <h2>Weaknesses</h2>
              <ul>
                {result.weaknesses.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {result.knowledgeGaps?.length > 0 && (
            <div className="strict-report-block">
              <h2>Knowledge gaps</h2>
              <ul>
                {result.knowledgeGaps.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {result.misconceptions?.length > 0 && (
            <div className="strict-report-block">
              <h2>Common misconceptions</h2>
              <ul>
                {result.misconceptions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {result.improvementSuggestions?.length > 0 && (
            <div className="strict-report-block">
              <h2>Improvement suggestions</h2>
              <ul>
                {result.improvementSuggestions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {result.appreciation && (
            <div className="strict-appreciation">{result.appreciation}</div>
          )}
        </section>
        <button
          className="btn-secondary strict-back"
          onClick={() => navigate("/challenges")}
          type="button"
        >
          <ArrowLeft size={15} /> Back to challenges
        </button>
      </main>
    );
  }

  const questions = assessment?.questions || [];

  return (
    <main className="strict-page">
      <header className="challenges-header">
        <p className="challenges-eyebrow">STRICT EVALUATION</p>
        <h1>{assessment?.module?.title}</h1>
        <p>{assessment?.topic?.title}</p>
        {remainingSeconds !== null && (
          <p
            className={`strict-timer${remainingSeconds < 60 ? " strict-timer-warning" : ""}`}
          >
            <Timer size={15} /> {Math.floor(remainingSeconds / 60)}:
            {String(remainingSeconds % 60).padStart(2, "0")} remaining
          </p>
        )}
      </header>
      {error && (
        <p className="weekly-error" role="alert">
          {error}
        </p>
      )}
      <section className="strict-questions">
        {questions.map((question, index) => (
          <article className="strict-question-card" key={question.key}>
            <h2>
              Question {index + 1}
              <span className="strict-question-difficulty">
                {question.difficulty}
              </span>
            </h2>
            <p>{question.prompt}</p>
            {question.options?.length ? (
              <div className="strict-options">
                {question.options.map((option, optionIndex) => (
                  <label className="strict-option" key={optionIndex}>
                    <input
                      type="radio"
                      name={question.key}
                      checked={answers[question.key] === optionIndex}
                      onChange={() =>
                        setAnswers((current) => ({
                          ...current,
                          [question.key]: optionIndex,
                        }))
                      }
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : (
              <label className="strict-answer">
                Your answer
                <textarea
                  rows={5}
                  maxLength={5000}
                  value={answers[question.key] || ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.key]: event.target.value,
                    }))
                  }
                />
              </label>
            )}
          </article>
        ))}
      </section>
      <div className="strict-submit-row">
        <button
          className="btn-primary"
          disabled={submitting}
          onClick={submit}
          type="button"
        >
          {submitting ? "Submitting…" : "Submit assessment"}
        </button>
        <p className="strict-submit-note">
          <CheckCircle2 size={14} /> Answers are saved as you select them; a
          refresh resumes this same attempt. <XCircle size={14} /> No hints are
          provided during the evaluation.
        </p>
      </div>
    </main>
  );
}
