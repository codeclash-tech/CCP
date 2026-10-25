import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Plus,
  RefreshCw,
  Save,
  Send,
  X,
} from "lucide-react";
import api from "../services/api";
import PageSkeleton from "../components/layout/PageSkeleton";
import "./WeeklyAdminAssessment.css";

function toIstDateTimeInput(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() + 330 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

function fromIstDateTimeInput(value) {
  if (!value) return "";
  const parsed = new Date(`${value}:00+05:30`);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Choose a valid start date and time.");
  }
  return parsed.toISOString();
}

function dateLabel(value) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function RankingTable({ rankings = [] }) {
  if (!rankings.length) return <p>No participants are ranked in this cycle yet.</p>;
  return (
    <div className="weekly-admin-table-wrap">
      <table className="weekly-admin-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Participant</th>
            <th>Organization</th>
            <th>Score</th>
            <th>Completed</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((entry) => (
            <tr key={entry.candidateId}>
              <td>{entry.rank}</td>
              <td>{entry.candidateNameSnapshot}</td>
              <td>{entry.organizationNameSnapshot || "—"}</td>
              <td>{Number(entry.score || 0).toFixed(2)}</td>
              <td>{entry.completedQuestions}/1</td>
              <td>{entry.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GlobalChallengeAdmin({ view = "setup" }) {
  const [challenge, setChallenge] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [name, setName] = useState("Global Challenge");
  const [startAt, setStartAt] = useState("");
  const [questionIds, setQuestionIds] = useState([]);
  const [questionSearch, setQuestionSearch] = useState("");
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [rankings, setRankings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSetup = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const cyclesResponse = await api.get("/weekly-assessments/admin/cycles");
      const loadedCycles = cyclesResponse.data.cycles || [];
      setCycles(loadedCycles);
      setSelectedCycleId((current) =>
        loadedCycles.some((cycle) => String(cycle._id) === current)
          ? current
          : String(loadedCycles[0]?._id || ""),
      );
      if (view === "rankings") return;

      const [challengeResponse, firstQuestionsResponse] = await Promise.all([
        api.get("/weekly-assessments/admin/global-challenge"),
        api.get("/challenges", { params: { page: 1, limit: 100 } }),
      ]);
      const saved = challengeResponse.data.globalChallenge;
      const currentCycle = challengeResponse.data.currentCycle;
      if (currentCycle) {
        setCycles((current) => [
          currentCycle,
          ...current.filter((cycle) => String(cycle._id) !== String(currentCycle._id)),
        ]);
      }
      const pageCount = firstQuestionsResponse.data.pagination?.pages || 1;
      const otherQuestionPages = await Promise.all(
        Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
          api.get("/challenges", {
            params: { page: index + 2, limit: 100 },
          }),
        ),
      );
      const savedValues = saved?.published ? saved : (saved?.draft || saved);
      setChallenge(saved);
      setQuestions(
        [
          ...(firstQuestionsResponse.data.challenges || []),
          ...otherQuestionPages.flatMap((response) => response.data.challenges || []),
        ].filter((item) => item.isActive),
      );
      setName(savedValues?.name || "Global Challenge");
      setStartAt(
        savedValues?.startAt
          ? toIstDateTimeInput(savedValues.startAt)
          : saved?.draft
            ? ""
            : toIstDateTimeInput(Date.now() + 60 * 1000),
      );
      setQuestionIds((savedValues?.questionIds || []).map((item) =>
        String(item?._id || item),
      ));
    } catch (requestError) {
      setError(requestError.message || "Could not load global challenge settings.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [view]);

  const loadRankings = useCallback(async () => {
    if (view !== "rankings" || !selectedCycleId) {
      setRankings(null);
      return;
    }
    try {
      const { data } = await api.get(
        `/weekly-assessments/admin/cycles/${selectedCycleId}/results`,
      );
      setRankings(data);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Could not load global challenge rankings.");
    }
  }, [selectedCycleId, view]);

  useEffect(() => {
    loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    if (view !== "rankings") return undefined;
    loadRankings();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadRankings();
    }, 5_000);
    const cyclesInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadSetup(true);
    }, 30_000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(cyclesInterval);
    };
  }, [loadRankings, loadSetup, view]);

  const toggleQuestion = (id) => {
    setQuestionIds((selected) =>
      selected.includes(id)
        ? selected.filter((questionId) => questionId !== id)
        : [...selected, id],
    );
  };

  const moveQuestion = (index, offset) => {
    setQuestionIds((selected) => {
      const destination = index + offset;
      if (destination < 0 || destination >= selected.length) return selected;
      const reordered = [...selected];
      [reordered[index], reordered[destination]] = [
        reordered[destination],
        reordered[index],
      ];
      return reordered;
    });
  };

  const loadQuestionPreview = async (id) => {
    setPreviewLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/challenges/${id}`);
      setPreviewQuestion(data.challenge);
    } catch (previewError) {
      setError(previewError.message || "Could not load the question preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const saveQueue = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.put("/weekly-assessments/admin/global-challenge", {
        name: challenge.name,
        startAt: challenge.startAt,
        questionIds,
      });
      await loadSetup(true);
      setNotice("Upcoming question queue saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save the question queue.");
    } finally {
      setSaving(false);
    }
  };

  const publishChallenge = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.put("/weekly-assessments/admin/global-challenge", {
        name: name.trim(),
        startAt: startAt ? fromIstDateTimeInput(startAt) : null,
        questionIds,
      });
      await api.post("/weekly-assessments/admin/global-challenge/publish");
      await loadSetup(true);
      setNotice("Global Challenge published.");
    } catch (publishError) {
      setError(publishError.message || "Could not publish the Global Challenge.");
    } finally {
      setSaving(false);
    }
  };

  const selectedQuestions = questionIds
    .map((id) => questions.find((question) => String(question._id || question.id) === id))
    .filter(Boolean);
  const availableQuestions = questions.filter((question) =>
    !questionIds.includes(String(question._id || question.id)) &&
      `${question.title} ${question.difficulty} ${question._id || question.id}`
        .toLowerCase()
        .includes(questionSearch.trim().toLowerCase()),
  );
  const title = view === "rankings" ? "Global Challenge Rankings" : "Global Challenge";
  const currentCycle = cycles.find((cycle) =>
    cycle.isGlobalChallenge &&
      new Date(cycle.startAt) <= Date.now() &&
      new Date(cycle.endAt) > Date.now(),
  );
  const currentAssignment = currentCycle?.questionAssignments?.[0];
  const currentQuestionId = String(currentAssignment?.challengeId || "");
  const nextDayNumber = currentCycle && challenge?.startAt
    ? Math.floor(
        (new Date(currentCycle.startAt).getTime() -
          new Date(challenge.startAt).getTime()) /
          (24 * 60 * 60 * 1000),
      ) + 2
    : 1;
  const savedQueueIds = (challenge?.questionIds || []).map(
    (question) => String(question?._id || question),
  );
  const queueChanged = challenge?.published &&
    JSON.stringify(questionIds) !== JSON.stringify(savedQueueIds);
  const questionsNotAdded = availableQuestions.filter(
    (question) => String(question._id || question.id) !== currentQuestionId,
  );
  const questionById = new Map(
    questions.map((question) => [String(question._id || question.id), question]),
  );

  return (
    <main className="weekly-admin-page weekly-global-admin-page">
      <header className="weekly-admin-header weekly-super-admin-header">
        <div>
          <p className="weekly-eyebrow">SUPER ADMIN</p>
          <h1>{title}</h1>
        </div>
        <div className="weekly-super-admin-actions">
          {view === "rankings" ? (
            <Link className="btn-secondary" to="/admin">Global Challenge</Link>
          ) : (
            <Link className="btn-secondary" to="/admin/rankings">Rankings &amp; history</Link>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => view === "rankings" ? loadRankings() : loadSetup()}
            disabled={loading}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </header>

      {error && <p className="weekly-admin-alert" role="alert">{error}</p>}
      {notice && <p className="weekly-admin-notice" role="status">{notice}</p>}

      {loading ? <PageSkeleton compact label="Loading global challenge" /> : view === "rankings" ? (
        <section className="weekly-admin-card">
          <label className="weekly-data-toolbar">
            Daily cycle
            <select
              value={selectedCycleId}
              onChange={(event) => setSelectedCycleId(event.target.value)}
            >
              {cycles.map((cycle) => (
                <option key={cycle._id} value={cycle._id}>
                  {cycle.cycleKey} · {cycle.name} · {cycle.status}
                </option>
              ))}
            </select>
          </label>
          {rankings ? (
            <>
              <h2>{rankings.cycle.name}</h2>
              <p>
                {dateLabel(rankings.cycle.startAt)} – {dateLabel(rankings.cycle.endAt)}
                {" · "}{rankings.cycle.status}
              </p>
              <RankingTable rankings={rankings.individualRankings} />
            </>
          ) : cycles.length ? (
            <PageSkeleton compact label="Loading daily rankings" rows={2} />
          ) : (
            <p>No daily cycles have started yet.</p>
          )}
        </section>
      ) : (
        <>
          <section className="weekly-admin-card weekly-global-today">
            <div className="weekly-section-heading">
              <h2>Today’s Question</h2>
              {challenge?.published && (
                <span className={`weekly-status status-${challenge.status.toLowerCase()}`}>
                  {challenge.status}
                </span>
              )}
            </div>
            {challenge?.published ? (
              currentAssignment?.questionSnapshot ? (
                <>
                  <button
                    type="button"
                    className="weekly-current-question"
                    onClick={() => setPreviewQuestion({
                      ...currentAssignment.questionSnapshot,
                      _id: currentQuestionId,
                    })}
                  >
                    <span>{currentAssignment.questionTitleSnapshot}</span>
                    <Eye size={16} />
                  </button>
                  <p className="weekly-current-question-meta">
                    {dateLabel(currentCycle.startAt)} – {dateLabel(currentCycle.endAt)}
                    {" · Asia/Kolkata"}
                  </p>
                </>
              ) : (
                <p className="weekly-current-question-empty">
                  {challenge.status === "SCHEDULED"
                    ? `The challenge starts ${dateLabel(challenge.startAt)}.`
                    : "Today’s question will appear here when its daily cycle opens."}
                </p>
              )
            ) : (
              <div className="weekly-global-first-publish">
                <label>
                  Challenge name
                  <input
                    maxLength={160}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  Start date and time
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(event) => setStartAt(event.target.value)}
                  />
                </label>
                <p>Asia/Kolkata</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={publishChallenge}
                  disabled={
                    saving ||
                    !name.trim() ||
                    !startAt ||
                    !questionIds.length ||
                    selectedQuestions.length !== questionIds.length
                  }
                >
                  <Send size={15} /> {saving ? "Publishing…" : "Publish Challenge"}
                </button>
              </div>
            )}
          </section>

          <section className="weekly-admin-card weekly-global-queue">
            <div className="weekly-section-heading">
              <h2>Question Queue</h2>
              {challenge?.published && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={saveQueue}
                  disabled={saving || !queueChanged}
                >
                  <Save size={15} /> {saving ? "Saving…" : "Save queue"}
                </button>
              )}
            </div>
            <ol className="weekly-admin-question-list">
              {questionIds.map((id, index) => {
                const question = questionById.get(id);
                return (
                  <li className="weekly-admin-question-row" key={id}>
                    <span className="weekly-rotation-index">{nextDayNumber + index}</span>
                    <span className="weekly-rotation-name">
                      <strong>{question?.title || "Unavailable question"}</strong>
                      <small>{question?.difficulty || "Question"}</small>
                    </span>
                    <div className="weekly-rotation-row-actions">
                      <button
                        type="button"
                        className="weekly-rotation-order"
                        onClick={() => moveQuestion(index, -1)}
                        disabled={saving || index === 0}
                        aria-label={`Move ${question?.title || "question"} up`}
                      ><ArrowUp size={15} /></button>
                      <button
                        type="button"
                        className="weekly-rotation-order"
                        onClick={() => moveQuestion(index, 1)}
                        disabled={saving || index === questionIds.length - 1}
                        aria-label={`Move ${question?.title || "question"} down`}
                      ><ArrowDown size={15} /></button>
                      <button
                        type="button"
                        className="weekly-rotation-remove"
                        onClick={() => toggleQuestion(id)}
                        disabled={saving}
                        aria-label={`Remove ${question?.title || "question"} from the queue`}
                      ><X size={16} /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {!questionIds.length && (
              <p className="weekly-rotation-empty">The queue is empty. Add questions below.</p>
            )}
            {challenge?.published && challenge.status === "COMPLETED" && !questionIds.length && (
              <p className="weekly-admin-notice">The question queue is complete.</p>
            )}
          </section>

          <section className="weekly-admin-card weekly-global-available">
            <div className="weekly-section-heading">
              <h2>Unadded Questions</h2>
              <Link className="btn-secondary" to="/admin/questions">Create question</Link>
            </div>
            <label className="weekly-rotation-search">
              <input
                type="search"
                value={questionSearch}
                onChange={(event) => setQuestionSearch(event.target.value)}
                placeholder="Search questions"
                aria-label="Search unadded questions"
              />
            </label>
            <div className="weekly-admin-question-list">
              {questionsNotAdded.length ? questionsNotAdded.map((question) => {
                const id = String(question._id || question.id);
                return (
                  <div className="weekly-admin-question-row" key={id}>
                    <span className="weekly-rotation-name">
                      <strong>{question.title}</strong>
                      <small>{question.difficulty || "Question"}</small>
                    </span>
                    <div className="weekly-rotation-row-actions">
                      <button
                        type="button"
                        className="weekly-rotation-order"
                        onClick={() => loadQuestionPreview(id)}
                        disabled={previewLoading}
                      ><Eye size={15} /> Preview</button>
                      <button
                        type="button"
                        className="weekly-rotation-add"
                        onClick={() => toggleQuestion(id)}
                        disabled={saving}
                      ><Plus size={15} /> Add</button>
                    </div>
                  </div>
                );
              }) : (
                <p className="weekly-rotation-empty">
                  {questions.length
                    ? questionSearch
                      ? "No questions match your search."
                      : "All available questions are in the queue."
                    : "No active questions are available."}
                </p>
              )}
            </div>
          </section>
        </>
      )}

      {previewQuestion && (
        <div className="weekly-question-preview-backdrop">
          <section
            className="weekly-question-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="weekly-question-preview-title"
          >
            <header>
              <div>
                <p>{previewQuestion.difficulty || "Question"} · {previewQuestion.category || "Custom"}</p>
                <h2 id="weekly-question-preview-title">{previewQuestion.title}</h2>
              </div>
              <button
                type="button"
                className="weekly-rotation-order"
                onClick={() => setPreviewQuestion(null)}
                aria-label="Close question preview"
              ><X size={17} /></button>
            </header>
            <p className="weekly-question-preview-description">{previewQuestion.description}</p>
            {previewQuestion.constraints && (
              <section><h3>Constraints</h3><p>{previewQuestion.constraints}</p></section>
            )}
            {(previewQuestion.examples || []).map((example, index) => (
              <section key={`${index}-${example.input}`}>
                <h3>Example {index + 1}</h3>
                <pre>
                  <strong>Input</strong>{"\n"}{example.input}
                  {"\n"}<strong>Output</strong>{"\n"}{example.output}
                </pre>
                {example.explanation && <p>{example.explanation}</p>}
              </section>
            ))}
            <footer>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPreviewQuestion(null)}
              >Close</button>
              {!questionIds.includes(String(previewQuestion._id || previewQuestion.id)) &&
                String(previewQuestion._id || previewQuestion.id) !== currentQuestionId && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      toggleQuestion(String(previewQuestion._id || previewQuestion.id));
                      setPreviewQuestion(null);
                    }}
                  ><Plus size={15} /> Add to Queue</button>
                )}
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
