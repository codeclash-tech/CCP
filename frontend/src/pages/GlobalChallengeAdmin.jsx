import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, Save, X } from "lucide-react";
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

      const [challengeResponse, questionsResponse] = await Promise.all([
        api.get("/weekly-assessments/admin/global-challenge"),
        api.get("/challenges", { params: { page: 1, limit: 100 } }),
      ]);
      const saved = challengeResponse.data.globalChallenge;
      setChallenge(saved);
      setQuestions(
        (questionsResponse.data.challenges || []).filter((item) => item.isActive),
      );
      setName(saved?.name || "Global Challenge");
      setStartAt(
        saved?.startAt
          ? toIstDateTimeInput(saved.startAt)
          : toIstDateTimeInput(Date.now() + 60 * 1000),
      );
      setQuestionIds((saved?.questionIds || []).map((item) =>
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

  const selectedQuestions = questionIds
    .map((id) => questions.find((question) => String(question._id || question.id) === id))
    .filter(Boolean);
  const availableQuestions = questions.filter((question) =>
    !questionIds.includes(String(question._id || question.id)),
  );

  const saveChallenge = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.put(
        "/weekly-assessments/admin/global-challenge",
        {
          name: name.trim(),
          startAt: fromIstDateTimeInput(startAt),
          questionIds,
        },
      );
      setChallenge(data.globalChallenge);
      setNotice("Global challenge saved. The next queued question will be used for each new day.");
      await loadSetup(true);
    } catch (saveError) {
      setError(saveError.message || "Could not save the global challenge.");
    } finally {
      setSaving(false);
    }
  };

  const title = view === "rankings" ? "Global Challenge Rankings" : "Global Challenge";
  const hasStarted = challenge && new Date(challenge.startAt) <= new Date();

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
          <form className="weekly-admin-card weekly-create-cycle" onSubmit={saveChallenge}>
            <h2>{challenge ? "Manage global challenge" : "Create global challenge"}</h2>
            <label>
              Challenge name
              <input
                required
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Initial start date and time (Asia/Kolkata)
              <input
                required
                type="datetime-local"
                value={startAt}
                disabled={Boolean(hasStarted)}
                onChange={(event) => setStartAt(event.target.value)}
              />
            </label>
            {hasStarted && (
              <p className="weekly-admin-notice">
                The start time is fixed after launch. Queue changes apply to upcoming days; today's question remains unchanged.
              </p>
            )}
            <fieldset className="weekly-rotation-editor">
              <legend>Daily question queue</legend>
              <p className="weekly-rotation-help">
                The first question is used today and removed from the queue.
                Each following question is used once on the next day. Questions
                are never repeated automatically.
              </p>
              <div className="weekly-rotation-selected">
                {selectedQuestions.length ? selectedQuestions.map((question) => {
                  const id = String(question._id || question.id);
                  return (
                    <div className="weekly-rotation-row" key={id}>
                      <span className="weekly-rotation-index">
                        {questionIds.indexOf(id) + 1}
                      </span>
                      <span className="weekly-rotation-name">
                        <strong>{question.title}</strong>
                        <small>{question.difficulty || "Question"} · {question.category || "Custom"}</small>
                      </span>
                      <button
                        type="button"
                        className="weekly-rotation-remove"
                        onClick={() => toggleQuestion(id)}
                        disabled={saving}
                        aria-label={`Remove ${question.title} from the rotation`}
                        title="Remove from queue"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  );
                }) : (
                  <p className="weekly-rotation-empty">
                    No questions in the rotation yet. Add an active question below.
                  </p>
                )}
              </div>
              <div className="weekly-rotation-available-heading">
                <strong>Available questions</strong>
                <Link to="/admin/questions">Create a question</Link>
              </div>
              <div className="weekly-rotation-available">
                {availableQuestions.length ? availableQuestions.map((question) => {
                  const id = String(question._id || question.id);
                  return (
                    <div className="weekly-rotation-row" key={id}>
                      <span className="weekly-rotation-name">
                        <strong>{question.title}</strong>
                        <small>{question.difficulty || "Question"} · {question.category || "Custom"}</small>
                      </span>
                      <button
                        type="button"
                        className="weekly-rotation-add"
                        onClick={() => toggleQuestion(id)}
                        disabled={saving}
                      >
                        <Plus size={15} /> Queue
                      </button>
                    </div>
                  );
                }) : (
                  <p className="weekly-rotation-empty">
                    {questions.length
                      ? "Every active saved question is already in the rotation."
                      : "No active questions are saved yet."}
                  </p>
                )}
              </div>
            </fieldset>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || (!challenge && questionIds.length === 0) || !startAt}
            >
              <Save size={15} /> {saving ? "Saving…" : "Save rotation"}
            </button>
          </form>

          <section className="weekly-admin-card">
            <h2>Daily cycle schedule</h2>
            {challenge ? (
              <>
                <p>Starts {dateLabel(challenge.startAt)} and advances once every 24 hours in Asia/Kolkata.</p>
                {challenge.activeQuestionId?.title && (
                  <p>Today's question: <strong>{challenge.activeQuestionId.title}</strong></p>
                )}
                <p>{questionIds.length} question{questionIds.length === 1 ? "" : "s"} remain in the queue.</p>
              </>
            ) : (
              <p>After saving, the first queued question starts at the selected time. Each remaining question is used once, in queue order.</p>
            )}
            {cycles.length > 0 && (
              <div className="weekly-cycle-list">
                {cycles.slice(0, 12).map((cycle) => (
                  <div className="weekly-cycle-row" key={cycle._id}>
                    <span>
                      <strong>{cycle.name}</strong>
                      <small>{dateLabel(cycle.startAt)} – {dateLabel(cycle.endAt)}</small>
                    </span>
                    <span className={`weekly-status status-${cycle.status?.toLowerCase()}`}>
                      {cycle.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
