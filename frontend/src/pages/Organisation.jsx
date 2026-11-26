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
  Pencil,
  Trash2,
  Activity,
  Code2,
} from "lucide-react";
import api from "../services/api";
import {
  getMyRooms,
  getRoomLeaderboard,
  deleteRoom,
} from "../services/battleRoomService";
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
  const [notice, setNotice] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [deletingCode, setDeletingCode] = useState("");

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
      setError(
        roomsResult.reason?.message || "Could not load your challenges.",
      );
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

  const handleDelete = async (room) => {
    if (
      !window.confirm(
        `Delete "${room.title}"? Participants will lose access and this cannot be undone.`,
      )
    )
      return;
    setDeletingCode(room.roomCode);
    setError("");
    setNotice("");
    try {
      await deleteRoom(room.roomCode);
      setNotice("Challenge deleted.");
      setRooms((current) =>
        current.filter((item) => item.roomCode !== room.roomCode),
      );
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete this challenge.");
    } finally {
      setDeletingCode("");
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
          ← Back to My Hosted challenges
        </button>
        <header className="challenges-header">
          <p className="challenges-eyebrow">CHALLENGE MONITOR</p>
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
            <Building2 size={30} aria-hidden="true" />
          </div>
          <div>
            <p className="challenges-eyebrow">
              {profile?.name || user?.organization || "YOUR ORGANISATION"}
            </p>
            <h1 className="organisation-welcome">
              Welcome, {user?.name || "there"}
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
      {notice && (
        <p className="weekly-admin-notice" role="status">
          {notice}
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
          <PlusCircle size={15} /> Create a new battle
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "battles"}
          className={activeTab === "battles" ? "selected" : ""}
          onClick={() => setActiveTab("battles")}
        >
          <Swords size={15} /> My Hosted challenges
        </button>
      </div>

      {activeTab === "create" && (
        <section className="organisation-create-card">
          <div className="organisation-create-copy">
            <h2>Create a new battle</h2>
            <p>
              Build a private COGNICLASH battle with your own questions, test
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
          <span className="organisation-create-brand">
            <Code2 size={14} aria-hidden="true" />
            CogniClash
          </span>
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
            <h2 style={{ margin: 0, fontSize: 19 }}>Challenges you hosted</h2>
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
              You haven&apos;t hosted any challenges yet. Create your first
              battle to publish it to participants.
            </p>
          ) : (
            <div className="organisation-battle-grid">
              {rooms.map((room) => {
                const status = roomStatusLabel(room);
                return (
                  <article key={room.id || room.roomCode} className="cc-card">
                    <div className="cc-card-head">
                      <span className="cc-card-kind">
                        <KeyRound size={13} aria-hidden="true" />
                        {room.roomCode}
                      </span>
                      <span
                        className="cc-card-chip"
                        style={{ color: statusColor(status) }}
                      >
                        {status}
                      </span>
                    </div>
                    <h3 className="cc-card-title">{room.title}</h3>
                    <p className="cc-card-desc">
                      {room.questionCount || 0} question
                      {room.questionCount === 1 ? "" : "s"} · Created{" "}
                      {formatDate(room.createdAt)} ·{" "}
                      {room.participantCount || 0} participants
                    </p>
                    <div className="cc-card-meta">
                      <button
                        type="button"
                        className="cc-card-save"
                        title="Edit challenge"
                        onClick={() =>
                          navigate(`/battle-room/${room.roomCode}/edit`)
                        }
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        className="cc-card-save"
                        title="Monitor challenge"
                        onClick={() => openRoom(room)}
                      >
                        <Activity size={13} /> Monitor
                      </button>
                      <button
                        type="button"
                        className="cc-card-save"
                        title="Delete challenge"
                        disabled={deletingCode === room.roomCode}
                        onClick={() => handleDelete(room)}
                      >
                        <Trash2 size={13} />
                        {deletingCode === room.roomCode
                          ? "Deleting…"
                          : "Delete"}
                      </button>
                      <button
                        type="button"
                        className="cc-card-enter"
                        style={{ marginLeft: "auto" }}
                        onClick={() => openRoom(room)}
                      >
                        <Users size={13} /> Leaderboard
                        <ArrowRight size={13} />
                      </button>
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
