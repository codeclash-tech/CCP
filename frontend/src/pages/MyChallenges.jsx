import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw,
  Swords,
  Trophy,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import {
  getJoinedRooms,
  getMyRooms,
  getRoomLeaderboard,
} from "../services/battleRoomService";
import api from "../services/api";
import PageSkeleton from "../components/layout/PageSkeleton";
import "./MyChallenges.css";

function roomStatusLabel(room, now = Date.now()) {
  if (room.submissionStatus === "COMPLETED") return "Completed";
  if (room.submissionStatus === "DISQUALIFIED") return "Disqualified";
  const start = room.startDate || room.startTime;
  const end = room.endDate || room.endTime;
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  if (
    room.status === "ACTIVE" ||
    (Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      startMs <= now &&
      now < endMs)
  ) {
    return "Live";
  }
  if (room.status === "CLOSED" || (Number.isFinite(endMs) && endMs <= now)) {
    return "Completed";
  }
  return "Upcoming";
}

function DailyChallengeCard({ item, onOpen }) {
  const result = item.submission?.status === "FINALIZED";
  return (
    <article
      className="my-challenge-card my-challenge-card-daily"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
        }
      }}
    >
      <div className="my-challenge-card-head">
        <Trophy size={17} aria-hidden="true" />
        <span className="my-challenge-card-kind">Daily Challenge</span>
        <span
          className={`my-challenge-status status-${result ? "completed" : "live"}`}
        >
          {result ? "Completed" : "Live"}
        </span>
      </div>
      <h3>{item.cycle?.name || "Today's CodeClash Challenge"}</h3>
      <p className="my-challenge-card-date">
        {item.cycle?.endAt
          ? new Date(item.cycle.endAt).toLocaleDateString("en-IN", {
              dateStyle: "medium",
            })
          : ""}
      </p>
      <div className="my-challenge-card-footer">
        <span>Leaderboard</span>
        <ArrowRight size={14} aria-hidden="true" />
      </div>
    </article>
  );
}

function BattleCard({ room, onOpen }) {
  const status = roomStatusLabel(room);
  return (
    <article
      className="my-challenge-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(room)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(room);
        }
      }}
    >
      <div className="my-challenge-card-head">
        <Swords size={17} aria-hidden="true" />
        <span className="my-challenge-card-kind">CodeClash Battle</span>
        <span className={`my-challenge-status status-${status.toLowerCase()}`}>
          {status}
        </span>
      </div>
      <h3>{room.title}</h3>
      <p className="my-challenge-card-date">
        Key {room.roomCode} ·{" "}
        {room.submittedAt
          ? new Date(room.submittedAt).toLocaleDateString("en-IN", {
              dateStyle: "medium",
            })
          : "Not submitted"}
      </p>
      {Number.isFinite(Number(room.totalScore)) && (
        <p className="my-challenge-card-score">
          Score <strong>{Math.round(room.totalScore || 0)}</strong>
        </p>
      )}
      <div className="my-challenge-card-footer">
        <span>Leaderboard</span>
        <ArrowRight size={14} aria-hidden="true" />
      </div>
    </article>
  );
}

export default function MyChallenges() {
  const navigate = useNavigate();
  const [battles, setBattles] = useState([]);
  const [dailyHistory, setDailyHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [joinedResult, historyResult] = await Promise.allSettled([
      getJoinedRooms(),
      api.get("/weekly-assessments/history"),
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
          ← Back to My Challenges
        </button>
        <header className="my-challenge-detail-header">
          <p className="challenges-eyebrow">
            {isDaily ? "DAILY CHALLENGE" : "CODECLASH BATTLE"}
          </p>
          <h1>
            {isDaily
              ? selected.item.cycle?.name || "Today's CodeClash Challenge"
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

  const hasAnything = battles.length > 0 || dailyHistory.length > 0;

  return (
    <main className="my-challenges-page">
      <header className="challenges-header">
        <p className="challenges-eyebrow">YOUR HISTORY</p>
        <h1>My Challenges</h1>
        <p>
          Every CodeClash Challenge and battle you have attended — with its
          leaderboard. Completed challenges are removed automatically.
        </p>
        <button
          type="button"
          className="btn-secondary"
          style={{ marginTop: 12 }}
          onClick={load}
        >
          <RefreshCw size={14} /> Refresh
        </button>
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
            Attend today&apos;s CodeClash Challenge or join a battle — your
            attended challenges and leaderboards will appear here.
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
          {dailyHistory.map((item) => (
            <DailyChallengeCard
              key={`daily-${item.cycle?.id}`}
              item={item}
              onOpen={openDaily}
            />
          ))}
          {battles.map((room) => (
            <BattleCard
              key={`battle-${room.id || room.roomCode}`}
              room={room}
              onOpen={openBattle}
            />
          ))}
        </div>
      )}
    </main>
  );
}
