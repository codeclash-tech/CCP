import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  Trophy,
  Swords,
  ArrowRight,
  Code2,
  BookOpen,
  ListChecks,
  Download,
  Timer,
  CheckCircle2,
} from "lucide-react";
import {
  getJoinedRooms,
  getRoomLeaderboard,
} from "../services/battleRoomService";
import api from "../services/api";
import PageSkeleton from "../components/layout/PageSkeleton";
import { challengeTypeLabel } from "../utils/challengeCards";
import "./MyChallenges.css";

function formatWhen(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function MyChallenges() {
  const navigate = useNavigate();
  const [battles, setBattles] = useState([]);
  const [dailyHistory, setDailyHistory] = useState([]);
  const [strictHistory, setStrictHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [joinedResult, historyResult, strictResult] =
      await Promise.allSettled([
        getJoinedRooms(),
        api.get("/weekly-assessments/history"),
        api.get("/learning-strict/history"),
      ]);
    if (joinedResult.status === "fulfilled") {
      setBattles(
        joinedResult.value.data?.rooms || joinedResult.value.rooms || [],
      );
    }
    if (historyResult.status === "fulfilled") {
      const records = (historyResult.value.data?.history || [])
        .filter((item) => item.submission?.status || item.attended)
        .sort(
          (left, right) =>
            new Date(right.cycle?.startAt || 0) -
            new Date(left.cycle?.startAt || 0),
        );
      setDailyHistory(records);
    }
    if (strictResult.status === "fulfilled") {
      setStrictHistory(strictResult.value.data?.attempts || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDaily = async (item) => {
    setSelected({ type: "daily", item });
    setLeaderboard(null);
    setLeaderboardLoading(true);
    setLeaderboardError("");
    try {
      const { data } = await api.get(
        `/weekly-assessments/cycles/${item.cycle.id}/rankings`,
      );
      setLeaderboard(data);
    } catch (loadError) {
      setLeaderboardError(
        loadError.message || "Could not load the leaderboard.",
      );
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const openBattle = async (room) => {
    setSelected({ type: "battle", item: room });
    setLeaderboard(null);
    setLeaderboardLoading(true);
    setLeaderboardError("");
    try {
      const data = await getRoomLeaderboard(room.roomCode);
      setLeaderboard(data);
    } catch (loadError) {
      setLeaderboardError(
        loadError.message || "Could not load the leaderboard.",
      );
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const downloadStrictReport = async (attemptId) => {
    setDownloading(true);
    setError("");
    try {
      const { data } = await api.get(
        `/learning-strict/attempts/${attemptId}/report.pdf`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `CogniClash-report-${attemptId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(
        downloadError.message || "Could not download this report right now.",
      );
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <PageSkeleton label="Loading your challenges" />;

  if (selected) {
    const isDaily = selected.type === "daily";
    const entries = isDaily
      ? leaderboard?.individualRankings || []
      : leaderboard?.leaderboard || [];
    return (
      <main className="my-challenges-page">
        <button
          type="button"
          className="my-challenges-back"
          onClick={() => {
            setSelected(null);
            setLeaderboard(null);
          }}
        >
          â† Back to My Challenges
        </button>
        <header className="my-challenge-detail-header">
          <p className="challenges-eyebrow">
            {isDaily ? "DAILY CHALLENGE" : "COGNICLASH BATTLE"}
          </p>
          <h1>
            {isDaily
              ? selected.item.cycle?.name || "Today's CogniClash Challenge"
              : selected.item.title}
          </h1>
        </header>
        {leaderboardLoading ? (
          <PageSkeleton compact label="Loading leaderboard" rows={3} />
        ) : leaderboardError ? (
          <p className="weekly-error" role="alert">
            {leaderboardError}
          </p>
        ) : entries.length === 0 ? (
          <p className="my-challenges-empty">
            No results have been ranked yet.
          </p>
        ) : (
          <div className="my-challenges-table-wrap">
            <table className="my-challenges-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Participant</th>
                  <th>Organisation</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.candidateId || entry.userId}>
                    <td>{entry.rank}</td>
                    <td>
                      {entry.candidateNameSnapshot ||
                        entry.name ||
                        "Participant"}
                    </td>
                    <td>
                      {entry.organizationNameSnapshot ||
                        entry.organization ||
                        "—"}
                    </td>
                    <td>
                      {Number(entry.score ?? entry.totalScore ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    );
  }

  const hasAnything =
    battles.length > 0 || dailyHistory.length > 0 || strictHistory.length > 0;

  const strictTypeLabel = (contentType) =>
    contentType === "MCQ"
      ? "MCQ"
      : contentType === "CODING"
        ? "Coding"
        : "Concepts";

  return (
    <main className="my-challenges-page">
      <header className="challenges-header">
        <p className="challenges-eyebrow">COGNICLASH</p>
        <h1>My Challenges</h1>
        <p>
          Every challenge you have attended — with its result. Completed
          challenges are removed automatically.
        </p>
      </header>

      {error && (
        <p className="weekly-error" role="alert">
          {error}
        </p>
      )}

      {!hasAnything ? (
        <section className="my-challenges-empty-hero">
          <ClipboardList size={30} aria-hidden="true" />
          <h2>Nothing here yet</h2>
          <p>
            Attend today&apos;s COGNICLASH Challenge or join a battle — your
            attended challenges and results will appear here.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate("/challenges")}
          >
            Browse challenges
          </button>
        </section>
      ) : (
        <div className="my-challenge-grid">
          {/* Strict evaluations (MCQ / Concepts / Coding style) */}
          {strictHistory.map((attempt) => {
            const type = strictTypeLabel(attempt.contentType);
            const TypeIcon =
              type === "MCQ"
                ? ListChecks
                : type === "Coding"
                  ? Code2
                  : BookOpen;
            return (
              <article key={`strict-${attempt.id}`} className="cc-card">
                <div className="cc-card-head">
                  <span className="cc-card-kind">
                    <TypeIcon size={13} aria-hidden="true" />
                    {type}
                  </span>
                  <span className="cc-card-chip">
                    <CheckCircle2 size={12} aria-hidden="true" />
                    {attempt.overallLevel || "Completed"}
                  </span>
                </div>
                <h3 className="cc-card-title">{attempt.moduleTitle}</h3>
                <div className="cc-card-meta">
                  <span className="cc-card-chip">
                    <Timer size={12} aria-hidden="true" />
                    {formatWhen(attempt.completedAt)}
                  </span>
                  <span className="cc-card-chip">
                    Score {attempt.scorePercent}%
                  </span>
                  <button
                    type="button"
                    className="cc-card-enter"
                    onClick={() => downloadStrictReport(attempt.id)}
                    disabled={downloading}
                  >
                    <Download size={14} aria-hidden="true" />
                    {downloading ? "Preparing…" : "Report PDF"}
                  </button>
                </div>
              </article>
            );
          })}

          {/* Daily challenges */}
          {dailyHistory.map((item) => (
            <article
              key={`daily-${item.cycle?.id}`}
              className="cc-card cc-card-gold"
              role="button"
              tabIndex={0}
              onClick={() => openDaily(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openDaily(item);
                }
              }}
            >
              <div className="cc-card-head">
                <span className="cc-card-kind cc-card-kind-gold">
                  <Trophy size={13} aria-hidden="true" />
                  Coding
                </span>
                <span className="cc-card-chip">
                  <CheckCircle2 size={12} aria-hidden="true" />
                  {item.submission?.status === "FINALIZED"
                    ? "Result ready"
                    : "Attended"}
                </span>
              </div>
              <h3 className="cc-card-title">
                {item.cycle?.name || "Today's CogniClash Challenge"}
              </h3>
              <div className="cc-card-meta">
                <span className="cc-card-chip">
                  <Timer size={12} aria-hidden="true" />
                  {formatWhen(item.cycle?.endAt)}
                </span>
                <button
                  type="button"
                  className="cc-card-enter"
                  onClick={(event) => {
                    event.stopPropagation();
                    openDaily(item);
                  }}
                >
                  Leaderboard
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}

          {/* Battles */}
          {battles.map((room) => (
            <article
              key={`battle-${room.id || room.roomCode}`}
              className="cc-card"
              role="button"
              tabIndex={0}
              onClick={() => openBattle(room)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openBattle(room);
                }
              }}
            >
              <div className="cc-card-head">
                <span className="cc-card-kind">
                  <Swords size={13} aria-hidden="true" />
                  Coding
                </span>
                <span className="cc-card-chip">
                  <CheckCircle2 size={12} aria-hidden="true" />
                  {room.submissionStatus === "COMPLETED" ? "Completed" : "Live"}
                </span>
              </div>
              <h3 className="cc-card-title">{room.title}</h3>
              <div className="cc-card-meta">
                <span className="cc-card-chip">
                  <Timer size={12} aria-hidden="true" />
                  {formatWhen(room.submittedAt || room.endDate || room.endTime)}
                </span>
                {Number.isFinite(Number(room.totalScore)) && (
                  <span className="cc-card-chip">
                    Score {Math.round(room.totalScore || 0)}
                  </span>
                )}
                <button
                  type="button"
                  className="cc-card-enter"
                  onClick={(event) => {
                    event.stopPropagation();
                    openBattle(room);
                  }}
                >
                  Leaderboard
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
