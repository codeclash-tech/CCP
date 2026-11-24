import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  PlusCircle,
  Swords,
  RefreshCw,
  KeyRound,
  Users,
  ArrowRight,
} from "lucide-react";
import api from "../services/api";
import { getMyRooms, getRoomLeaderboard } from "../services/battleRoomService";
import PageSkeleton from "../components/layout/PageSkeleton";
import { formatDate } from "../utils/helpers";
import { useAuth } from "../context/AuthContext";
import "./Organisation.css";

function roomStatusLabel(room, now = Date.now()) {
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

function statusColor(status) {
  if (status === "Live") return "var(--color-success, #34d399)";
  if (status === "Completed") return "var(--text-muted)";
  return "var(--color-warning, #f59e0b)";
}

export default function Organisation() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("create");
  const [profile, setProfile] = useState(null);
  const [license, setLicense] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [profileResult, roomsResult] = await Promise.allSettled([
      api.get("/weekly-assessments/organization/profile"),
      getMyRooms(),
    ]);
    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value.data?.organization || null);
      setLicense(profileResult.value.data?.license || null);
    }
    if (roomsResult.status === "fulfilled") {
      setRooms(roomsResult.value.rooms || []);
    } else {
      setError(roomsResult.reason?.message || "Could not load your battles.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openRoom = async (room) => {
    setSelectedRoom(room);
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

  const remainingDays = license
    ? Math.max(
        0,
        Math.ceil(
          (new Date(license.expiresAt).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : null;

  if (loading) return <PageSkeleton label="Loading organisation" />;

  if (selectedRoom) {
    return (
      <main className="organisation-page">
        <button
          type="button"
          className="my-challenges-back"
          onClick={() => {
            setSelectedRoom(null);
            setLeaderboard(null);
          }}
        >
          ← Back to My Battles
        </button>
        <header className="challenges-header">
          <p className="challenges-eyebrow">BATTLE LEADERBOARD</p>
          <h1>{selectedRoom.title}</h1>
          <p>
            Key {selectedRoom.roomCode} · {selectedRoom.participantCount || 0}{" "}
            participant
            {selectedRoom.participantCount === 1 ? "" : "s"}
          </p>
        </header>
        {leaderboardLoading ? (
          <PageSkeleton compact label="Loading leaderboard" rows={3} />
        ) : leaderboardError ? (
          <p className="weekly-error" role="alert">
            {leaderboardError}
          </p>
        ) : leaderboard?.leaderboard?.length ? (
          <div className="my-challenges-table-wrap">
            <table className="my-challenges-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Participant</th>
                  <th>Organisation</th>
                  <th>Score</th>
                  <th>Passed</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.leaderboard.map((entry) => (
                  <tr key={entry.userId}>
                    <td>{entry.rank}</td>
                    <td>{entry.name || "Participant"}</td>
                    <td>{entry.organization || "—"}</td>
                    <td>{Number(entry.totalScore || 0).toFixed(2)}</td>
                    <td>
                      {entry.totalPassed}/{entry.totalTestCases}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="my-challenges-empty">
            No completed submissions have been ranked yet.
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="organisation-page">
      <header className="organisation-header">
        <div className="organisation-header-main">
          <div className="organisation-badge">
            <Building2 size={18} aria-hidden="true" />
          </div>
          <div>
            <p className="challenges-eyebrow">ORGANISATION</p>
            <h1>
              {profile?.name || user?.organization || "Your organisation"}
            </h1>
          </div>
          {remainingDays !== null && (
            <span
              className={`organisation-expiry${remainingDays <= 7 ? " organisation-expiry-warning" : ""}`}
            >
              {remainingDays} day{remainingDays === 1 ? "" : "s"} of license
              remaining
            </span>
          )}
        </div>
      </header>

      {error && (
        <p className="weekly-error" role="alert">
          {error}
        </p>
      )}

      <div
        className="organisation-tabs"
        role="tablist"
        aria-label="Organisation sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "create"}
          className={activeTab === "create" ? "selected" : ""}
          onClick={() => setActiveTab("create")}
        >
          <PlusCircle size={15} /> Create Challenges
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "battles"}
          className={activeTab === "battles" ? "selected" : ""}
          onClick={() => setActiveTab("battles")}
        >
          <Swords size={15} /> My Battles
        </button>
      </div>

      {activeTab === "create" && (
        <section className="organisation-create-card">
          <div className="organisation-create-copy">
            <h2>Create a new battle</h2>
            <p>
              Build a private CodeClash battle with your own questions, test
              cases, and schedule. Once created, the battle is published and
              every participant can join with its key.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate("/battle-room/create")}
            >
              <PlusCircle size={16} /> Create battle
            </button>
          </div>
          <Swords
            className="organisation-create-art"
            size={110}
            strokeWidth={1}
            aria-hidden="true"
          />
        </section>
      )}

      {activeTab === "battles" && (
        <section>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 19 }}>Battles you created</h2>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginLeft: "auto" }}
              onClick={load}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          {rooms.length === 0 ? (
            <p className="my-challenges-empty">
              You haven&apos;t created any battles yet. Create your first battle
              to publish it to participants.
            </p>
          ) : (
            <div className="organisation-battle-grid">
              {rooms.map((room) => {
                const status = roomStatusLabel(room);
                return (
                  <article
                    key={room.id || room.roomCode}
                    className="my-challenge-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => openRoom(room)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openRoom(room);
                      }
                    }}
                  >
                    <div className="my-challenge-card-head">
                      <KeyRound size={16} aria-hidden="true" />
                      <span className="my-challenge-card-kind">
                        {room.roomCode}
                      </span>
                      <span
                        className="my-challenge-status"
                        style={{
                          color: statusColor(status),
                          borderColor: statusColor(status),
                        }}
                      >
                        {status}
                      </span>
                    </div>
                    <h3>{room.title}</h3>
                    <p className="my-challenge-card-date">
                      {room.questionCount || 0} question
                      {room.questionCount === 1 ? "" : "s"} · Created{" "}
                      {formatDate(room.createdAt)}
                    </p>
                    <p className="my-challenge-card-date">
                      <Users size={12} style={{ verticalAlign: "-2px" }} />{" "}
                      {room.participantCount || 0} participants
                    </p>
                    <div className="my-challenge-card-footer">
                      <span>View leaderboard</span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
