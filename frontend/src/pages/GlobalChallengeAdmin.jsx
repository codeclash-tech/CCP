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

function datePart(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "long",
    timeZone: "Asia/Kolkata",
  });
}

function timePart(value) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
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
      const pageCount = firstQuestionsResponse.data.pagination?.pages || 1;
      const otherQuestionPages = await Promise.all(
        Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
          api.get("/challenges", {
            params: { page: index + 2, limit: 100 },
          }),
        ),
      );
      const savedValues = saved?.draft || saved;
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

  const showCurrentQuestion = () => {
    const snapshot = currentAssignment?.questionSnapshot;
    if (!snapshot || !currentAssignment?.challengeId) {
      setError("The current cycle does not contain its question snapshot.");
      return;
    }
    setPreviewQuestion({
      ...snapshot,
      _id: String(currentAssignment.challengeId),
    });
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

  const saveDraft = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.put("/weekly-assessments/admin/global-challenge", {
        name: name.trim(),
        startAt: startAt ? fromIstDateTimeInput(startAt) : null,
        questionIds,
      });
      await loadSetup(true);
      setNotice("Draft saved. It has not been published.");
    } catch (saveError) {
      setError(saveError.message || "Could not save the draft.");
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

  const title = view === "rankings" ? "Global Challenge Rankings" : "Global Challenge";
  const hasStarted =
    challenge?.published && challenge.startAt && new Date(challenge.startAt) <= new Date();
  const currentCycle = cycles.find((cycle) =>
    cycle.isGlobalChallenge &&
      new Date(cycle.startAt) <= Date.now() &&
      new Date(cycle.endAt) > Date.now(),
  );
  const currentAssignment = currentCycle?.questionAssignments?.[0];
  const publishedUpcomingQuestions = (challenge?.questionIds || []).filter(
    (question) => question && typeof question === "object",
  );

  return (
    <section className="weekly-admin-page">
      <header className="weekly-admin-header">
        <div>
          <p className="weekly-eyebrow">SUPER ADMIN</p>
          <h1>{title}</h1>
          <p>
            {view === "rankings"
              ? "Live participant standings for each daily cycle."
              : "Schedule a daily challenge and manage its first-in, first-out question queue."}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => view === "rankings" ? loadRankings() : loadSetup()}
          disabled={loading}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {error && <p className="weekly-admin-alert" role="alert">{error}</p>}
      {notice && <p className="weekly-admin-notice" role="status">{notice}</p>}

      {loading ? <p>Loading global challenge…</p> : view === "rankings" ? (
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
              <p>{dateLabel(rankings.cycle.startAt)} – {dateLabel(rankings.cycle.endAt)} · {rankings.cycle.status} · Updates every 5 seconds</p>
              <RankingTable rankings={rankings.individualRankings} />
            </>
          ) : <p>{cycles.length ? "Loading rankings…" : "No global challenge cycles have started yet."}</p>}
        </section>
      ) : (
        <>
          <nav className="weekly-admin-tabs" aria-label="Global Challenge sections">
            <Link to="/admin/weekly-assessment" aria-current="page">Configuration &amp; management</Link>
            <Link to="/admin/rankings">Rankings &amp; history</Link>
          </nav>

          {challenge?.published && (
            <section className="weekly-admin-card weekly-global-management">
              <div className="weekly-admin-heading">
                <div>
                  <h2>Active Challenge Management</h2>
                  <p>{challenge.name}</p>
                </div>
                <span className={`weekly-status status-${challenge.status.toLowerCase()}`}>
                  {challenge.status}
                </span>
              </div>
              <h3>Today’s Challenge</h3>
              {currentCycle ? (
                <>
                  <p>
                    <strong>{currentAssignment?.questionTitleSnapshot || "Assigned question"}</strong>
                    {" · "}{currentCycle.status}
                  </p>
                  <p>{dateLabel(currentCycle.startAt)} – {dateLabel(currentCycle.endAt)} · Asia/Kolkata</p>
                  <div className="weekly-admin-actions">
                    {currentAssignment?.challengeId && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={showCurrentQuestion}
                      >
                        <Eye size={15} /> View Question
                      </button>
                    )}
                    <Link className="btn-secondary" to="/admin/rankings">View Rankings</Link>
                  </div>
                </>
              ) : (
                <p>
                  {challenge.status === "SCHEDULED"
                    ? `Starts ${dateLabel(challenge.startAt)}.`
                    : "No daily cycle is currently open."}
                </p>
              )}
              <h3>Upcoming Rotation</h3>
              {publishedUpcomingQuestions.length ? (
                <ol className="weekly-management-queue">
                  {publishedUpcomingQuestions.map((question, index) => {
                    const dayNumber = currentCycle
                      ? Math.floor(
                          (new Date(currentCycle.startAt).getTime() -
                            new Date(challenge.startAt).getTime()) /
                            (24 * 60 * 60 * 1000),
                        ) + index + 2
                      : index + 1;
                    return (
                      <li key={String(question._id || question.id)}>
                        <span>Day {dayNumber} → {question.title}</span>
                        <small>{question.difficulty || "Question"} · {String(question._id || question.id)}</small>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p>
                  {challenge.status === "COMPLETED"
                    ? "ROTATION COMPLETED — no more questions are queued."
                    : currentCycle
                      ? "No upcoming questions are queued. Today's assigned question will remain available until the cycle ends."
                      : "No upcoming questions are queued."}
                </p>
              )}
            </section>
          )}

          <details
            className="weekly-admin-card weekly-published-edit"
            open={!challenge?.published || Boolean(challenge?.draft)}
          >
            <summary>
              {challenge?.published
                ? "Edit configuration and upcoming rotation"
                : "Create challenge draft"}
            </summary>
            <form className="weekly-create-cycle" onSubmit={(event) => event.preventDefault()}>
            <h2>{challenge?.published ? "Update Challenge Draft" : "Create Challenge Draft"}</h2>
            <section className="weekly-admin-flow-section">
              <h3>1. Challenge Configuration</h3>
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
                  disabled={Boolean(hasStarted)}
                  onChange={(event) => setStartAt(event.target.value)}
                />
              </label>
              <p className="weekly-rotation-help">Time zone: Asia/Kolkata. The daily cycle repeats every 24 hours from this start time.</p>
              {hasStarted && (
                <p className="weekly-admin-notice">
                  The start time is fixed after launch. Publishing rotation changes affects only upcoming days; today's question remains unchanged.
                </p>
              )}
            </section>

            <fieldset className="weekly-rotation-editor">
              <legend>2. Question Rotation</legend>
              <p className="weekly-rotation-help">
                Questions run once in the order shown. Day 1 starts at the configured start time; the next question is used at each following daily cycle. The rotation does not repeat automatically.
              </p>
              <div className="weekly-rotation-selected">
                {questionIds.length ? questionIds.map((id, index) => {
                  const question = questions.find((item) => String(item._id || item.id) === id);
                  return (
                    <div className="weekly-rotation-row" key={id}>
                      <span className="weekly-rotation-index">Day {index + 1}</span>
                      <span className="weekly-rotation-name">
                        <strong>{question?.title || "Unavailable question"}</strong>
                        <small>{question?.difficulty || "Question"} · ID: {id}</small>
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
                          aria-label={`Remove ${question?.title || "question"} from the rotation`}
                          title="Remove from queue"
                        ><X size={16} /></button>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="weekly-rotation-empty">No questions selected. Add active saved questions below.</p>
                )}
              </div>
              <div className="weekly-rotation-available-heading">
                <strong>Search and add active questions</strong>
                <Link to="/admin/questions">Create a question</Link>
              </div>
              <label className="weekly-rotation-search">
                Search by title, difficulty, or ID
                <input
                  type="search"
                  value={questionSearch}
                  onChange={(event) => setQuestionSearch(event.target.value)}
                  placeholder="Search active questions"
                />
              </label>
              <div className="weekly-rotation-available">
                {availableQuestions.length ? availableQuestions.map((question) => {
                  const id = String(question._id || question.id);
                  return (
                    <div className="weekly-rotation-row" key={id}>
                      <span className="weekly-rotation-name">
                        <strong>{question.title}</strong>
                        <small>{question.difficulty || "Question"} · ID: {id}</small>
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
                        ? "No active questions match that search."
                        : "Every active saved question is already in the rotation."
                      : "No active questions are saved yet."}
                  </p>
                )}
              </div>
            </fieldset>

            <section className="weekly-admin-flow-section weekly-challenge-review">
              <h3>3. Review</h3>
              <h4>Challenge</h4>
              <p><strong>Name:</strong> {name.trim() || "Not set"}</p>
              <p><strong>Date:</strong> {startAt ? datePart(fromIstDateTimeInput(startAt)) : "Not set"}</p>
              <p><strong>Time:</strong> {startAt ? timePart(fromIstDateTimeInput(startAt)) : "Not set"}</p>
              <p><strong>Time zone:</strong> Asia/Kolkata</p>
              <h4>Question Rotation</h4>
              {questionIds.length ? (
                <ol className="weekly-review-rotation">
                  {questionIds.map((id, index) => {
                    const question = questions.find(
                      (item) => String(item._id || item.id) === id,
                    );
                    return (
                      <li key={id}>
                        Day {index + 1} → {question?.title || `Unavailable question (${id})`}
                      </li>
                    );
                  })}
                </ol>
              ) : <p>No questions selected.</p>}
              <p className="weekly-status-summary">
                Current state: {challenge?.published ? challenge.status : "DRAFT"}
              </p>
              <div className="weekly-admin-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={saveDraft}
                  disabled={saving}
                ><Save size={15} /> {saving ? "Saving…" : "Save Draft"}</button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={publishChallenge}
                  disabled={
                    saving ||
                    !name.trim() ||
                    !startAt ||
                    questionIds.length === 0 ||
                    selectedQuestions.length !== questionIds.length
                  }
                ><Send size={15} /> {saving ? "Publishing…" : "Publish Challenge"}</button>
              </div>
            </section>
            </form>
          </details>

          <section className="weekly-admin-card">
            <h2>Daily Cycle History</h2>
            {cycles.length ? (
              <div className="weekly-cycle-list">
                {cycles.slice(0, 12).map((cycle) => (
                  <div className="weekly-cycle-row" key={cycle._id}>
                    <span>
                      <strong>{cycle.cycleKey} · {cycle.questionAssignments?.[0]?.questionTitleSnapshot || cycle.name}</strong>
                      <small>{dateLabel(cycle.startAt)} – {dateLabel(cycle.endAt)}</small>
                    </span>
                    <span className={`weekly-status status-${cycle.status?.toLowerCase()}`}>{cycle.status}</span>
                  </div>
                ))}
              </div>
            ) : <p>No daily cycles have started yet.</p>}
            <Link className="weekly-admin-history-link" to="/admin/rankings">View rankings and history</Link>
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
                <pre><strong>Input</strong>{"\n"}{example.input}{"\n"}<strong>Output</strong>{"\n"}{example.output}</pre>
                {example.explanation && <p>{example.explanation}</p>}
              </section>
            ))}
            <p className="weekly-question-preview-id">Question ID: {previewQuestion._id || previewQuestion.id}</p>
            <footer>
              <button type="button" className="btn-secondary" onClick={() => setPreviewQuestion(null)}>Close</button>
              {!questionIds.includes(String(previewQuestion._id || previewQuestion.id)) && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    toggleQuestion(String(previewQuestion._id || previewQuestion.id));
                    setPreviewQuestion(null);
                  }}
                ><Plus size={15} /> Add to Rotation</button>
              )}
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
