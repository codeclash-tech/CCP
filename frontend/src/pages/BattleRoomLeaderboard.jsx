import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BattleRoomShareModal from "../components/battleRoom/BattleRoomShareModal";
// REMOVED: getPublicLeaderboard
import {
  getRoomLeaderboard,
  downloadRoomResultsExcel,
  downloadBattleRoomCertificate,
  closeRoom,
  getRoomResultDelivery,
  retryRoomResultDelivery,
} from "../services/battleRoomService";
import {
  Trophy,
  Medal,
  Clock,
  ArrowLeft,
  Users,
  XCircle,
  FileSpreadsheet,
  RefreshCw,
  Download,
} from "lucide-react";

function readLeaderboardCache(roomCode, userId) {
  if (!roomCode || !userId) return null;
  try {
    const cached = JSON.parse(
      sessionStorage.getItem(`ccp:leaderboard:${userId}:${roomCode}`) || "null",
    );
    return cached?.room && Array.isArray(cached.leaderboard) ? cached : null;
  } catch {
    return null;
  }
}

function writeLeaderboardCache(roomCode, userId, data) {
  if (!roomCode || !userId) return;
  try {
    sessionStorage.setItem(
      `ccp:leaderboard:${userId}:${roomCode}`,
      JSON.stringify({
        room: data.room,
        leaderboard: data.leaderboard || [],
        isCreator: data.isCreator,
      }),
    );
  } catch (error) {
    console.warn("Unable to cache battle room leaderboard:", error.message);
  }
}

function LeaderboardSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 16,
            padding: "10px 0",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          {Array.from({ length: 4 }).map((_, j) => (
            <div
              key={j}
              style={{
                flex: 1,
                height: 14,
                background: "var(--bg-elevated)",
                borderRadius: 4,
                animation: "shimmer 1.5s infinite",
              }}
            />
          ))}
        </div>
      ))}
      <style>{`@keyframes shimmer { 0% { opacity: 0.3; } 50% { opacity: 0.6; } 100% { opacity: 0.3; } }`}</style>
    </div>
  );
}

function getRankDisplay(rank) {
  if (rank === 1)
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Trophy size={16} color="var(--color-warning)" /> #1st
      </div>
    );
  if (rank === 2)
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Medal size={16} color="#c0c0c0" /> #2nd
      </div>
    );
  if (rank === 3)
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Medal size={16} color="#cd7f32" /> #3rd
      </div>
    );
  return "#" + rank;
}

function formatDuration(secs) {
  if (!secs && secs !== 0) return "—";
  secs = Math.round(secs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function BattleRoomLeaderboard() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id || user?._id;
  const cachedLeaderboard = readLeaderboardCache(roomCode, userId);

  const [room, setRoom] = useState(cachedLeaderboard?.room || null);
  const [leaderboard, setLeaderboard] = useState(
    cachedLeaderboard?.leaderboard || [],
  );
  const [loading, setLoading] = useState(!cachedLeaderboard);
  const [error, setError] = useState("");
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [isCreator, setIsCreator] = useState(
    cachedLeaderboard?.isCreator || false,
  );
  const [closing, setClosing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingCertificate, setDownloadingCertificate] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [retryingDelivery, setRetryingDelivery] = useState(false);
  const [resultDelivery, setResultDelivery] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const loadedRoomCodeRef = useRef(null);
  const loadedDeliveryRoomRef = useRef(null);
  const hasLoadedDataRef = useRef(false);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    const isNewRoom = loadedRoomCodeRef.current !== roomCode;
    if (isNewRoom) {
      loadedRoomCodeRef.current = roomCode;
      loadedDeliveryRoomRef.current = null;
      const cached = readLeaderboardCache(roomCode, userId);
      hasLoadedDataRef.current = Boolean(cached);
      setRoom(cached?.room || null);
      setLeaderboard(cached?.leaderboard || []);
      setIsCreator(cached?.isCreator || false);
      setResultDelivery(null);
      setError("");
      setRoomUnavailable(false);
      setLoading(!cached);
    }
    let interval;

    const loadLeaderboard = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const data = await getRoomLeaderboard(roomCode);
        if (!active) return;
        setRoom(data.room);
        setLeaderboard(data.leaderboard || []);
        setIsCreator(data.isCreator);
        writeLeaderboardCache(roomCode, userId, data);
        setError("");
        hasLoadedDataRef.current = true;
        if (
          data.isCreator &&
          data.room?.status === "CLOSED" &&
          loadedDeliveryRoomRef.current !== roomCode
        ) {
          const delivery = await getRoomResultDelivery(roomCode);
          if (active) {
            setResultDelivery(delivery);
            loadedDeliveryRoomRef.current = roomCode;
          }
        } else {
          setResultDelivery(null);
        }
      } catch (err) {
        if (active && /not found/i.test(err.message || "")) {
          setRoomUnavailable(true);
          if (!hasLoadedDataRef.current) {
            setError(
              "This battle room is no longer available. You can still download your certificate if you completed the battle.",
            );
          }
          return;
        }
        if (active && !hasLoadedDataRef.current) {
          setError(err.message || "Failed to load leaderboard.");
        }
      } finally {
        requestInFlight = false;
        if (active) setLoading(false);
      }
    };

    loadLeaderboard();
    interval = setInterval(() => {
      if (document.visibilityState === "visible") loadLeaderboard();
    }, 5000);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") loadLeaderboard();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [navigate, roomCode, refreshVersion, userId]);

  const handleCloseRoom = async () => {
    if (
      !window.confirm(
        "Are you sure you want to close this Battle Room? Participants will no longer be able to continue.",
      )
    )
      return;
    setClosing(true);
    setError("");
    setSuccessMessage("");
    try {
      const data = await closeRoom(roomCode);
      setSuccessMessage(data.message || "Room closed and results were sent.");
      setRefreshVersion((version) => version + 1);
    } catch (err) {
      setError(err.message || "Failed to close room.");
    } finally {
      setClosing(false);
    }
  };

  const handleRetryDelivery = async () => {
    setRetryingDelivery(true);
    setError("");
    setSuccessMessage("");
    try {
      const data = await retryRoomResultDelivery(roomCode);
      setSuccessMessage(data.message || "Result delivery retry finished.");
      setRefreshVersion((version) => version + 1);
    } catch (err) {
      setError(err.message || "Failed to retry result delivery.");
    } finally {
      setRetryingDelivery(false);
    }
  };

  const handleOpenCertificate = () => {
    const participant = leaderboard.find(
      (row) => row.isCurrentUser && row.status === "COMPLETED",
    );
    if (!participant || !room) return;
    setSelectedCertificate({
      room,
      rank: participant.rank,
      totalParticipants: leaderboard.length,
      completedAt: participant.submittedAt,
    });
  };

  const handleDownloadCertificate = async () => {
    setDownloadingCertificate(true);
    setError("");
    try {
      const file = await downloadBattleRoomCertificate(roomCode);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `codeclash-certificate-${roomCode}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message || "Failed to download your certificate.");
    } finally {
      setDownloadingCertificate(false);
    }
  };

  const handleDownloadResults = async () => {
    setDownloading(true);
    setError("");
    try {
      const file = await downloadRoomResultsExcel(roomCode);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `room-results-${roomCode}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message || "Failed to download room results.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="leaderboard-page"
      style={{
        padding: "24px 32px",
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "var(--font-ui)",
      }}
    >
      <div
        style={{
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              color: "var(--text-primary)",
              fontSize: 20,
              fontFamily: "var(--font-ui)",
              margin: "0 0 4px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Battle Room Leaderboard
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              fontFamily: "var(--font-ui)",
              margin: 0,
            }}
          >
            Room Key:{" "}
            <span
              style={{
                color: "var(--color-warning)",
                fontWeight: 700,
                letterSpacing: 3,
                fontFamily: "var(--font-code)",
              }}
            >
              {roomCode}
            </span>
            {room && room.status ? (
              <span
                style={{
                  marginLeft: 12,
                  color:
                    room.status === "ACTIVE"
                      ? "var(--color-success)"
                      : room.status === "CLOSED"
                        ? "var(--color-danger)"
                        : "var(--color-warning)",
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {room.status}
              </span>
            ) : null}
            {room && room.participantCount > 0 ? (
              <span
                style={{
                  marginLeft: 12,
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Users size={13} />
                {room.participantCount} participants
              </span>
            ) : null}
            {room && room.timeLimit ? (
              <span
                style={{
                  marginLeft: 12,
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Clock size={13} />
                {room.scheduledDate && room.startTime && room.endTime
                  ? `${new Intl.DateTimeFormat(undefined, {
                      timeZone: room.timezone || "UTC",
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(room.startTime))} – ${new Intl.DateTimeFormat(undefined, {
                      timeZone: room.timezone || "UTC",
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(room.endTime))}`
                  : `${room.timeLimit} ${room.timeLimitUnit || "minutes"}`}
              </span>
            ) : null}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isCreator ? (
            <button
              onClick={handleDownloadResults}
              disabled={downloading}
              className="btn-secondary"
              style={{
                padding: "8px 16px",
                fontSize: 12,
                opacity: downloading ? 0.65 : 1,
                cursor: downloading ? "wait" : "pointer",
              }}
              title="Download the participant ranks and scores as an Excel workbook"
            >
              <FileSpreadsheet size={13} />
              {downloading ? "Downloading..." : "Download results (Excel)"}
            </button>
          ) : null}
          {isCreator && room && room.status === "ACTIVE" ? (
            <button
              onClick={handleCloseRoom}
              disabled={closing}
              style={{
                background: closing ? "var(--bg-hover)" : "var(--color-danger)",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: 12,
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                cursor: closing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <XCircle size={13} />
              {closing ? "Closing..." : "End Battle"}
            </button>
          ) : null}
          {isCreator && room?.status === "CLOSED" ? (
            <>
              {resultDelivery ? (
                <span
                  style={{
                    alignSelf: "center",
                    color: "var(--text-muted)",
                    fontSize: 12,
                  }}
                  aria-live="polite"
                >
                  Completion emails:{" "}
                  {resultDelivery.counts?.SENT || 0} sent,{" "}
                  {resultDelivery.counts?.FAILED || 0} failed.
                </span>
              ) : null}
              {resultDelivery?.counts?.FAILED > 0 ? (
                <button
                  onClick={handleRetryDelivery}
                  disabled={retryingDelivery}
                  className="btn-secondary"
                  style={{
                    padding: "8px 16px",
                    fontSize: 12,
                    opacity: retryingDelivery ? 0.65 : 1,
                  }}
                >
                  <RefreshCw size={13} />
                  {retryingDelivery ? "Retrying..." : "Retry failed completion emails"}
                </button>
              ) : null}
            </>
          ) : null}
          {room?.status === "CLOSED" &&
          leaderboard.some(
            (row) => row.isCurrentUser && row.status === "COMPLETED",
          ) ? (
            <button
              onClick={handleOpenCertificate}
              className="btn-primary"
              style={{
                padding: "8px 16px",
                fontSize: 12,
              }}
            >
              <Download size={13} />
              Certificates
            </button>
          ) : null}
          <button
            onClick={() => {
              if (
                room &&
                (room.status === "ACTIVE" || room.status === "UPCOMING")
              ) {
                navigate("/battle-room/" + roomCode + "/challenge");
              } else {
                navigate("/battle-room");
              }
            }}
            className="btn-secondary"
            style={{ padding: "8px 16px", fontSize: 12 }}
          >
            <ArrowLeft size={13} />
            {room && room.status === "ACTIVE"
              ? "Back to Battle"
              : "Back to Rooms"}
          </button>
        </div>
      </div>

      {successMessage && (
        <div
          role="status"
          style={{
            color: "var(--color-success)",
            background: "rgba(46, 160, 67, 0.1)",
            border: "1px solid rgba(46, 160, 67, 0.3)",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {successMessage}
        </div>
      )}

      {/* Leaderboard table */}
      {loading ? (
        <LeaderboardSkeleton />
      ) : error ? (
        <div style={{ color: "var(--color-danger)" }}>
          {error}
          {roomUnavailable ? (
            <button
              onClick={handleDownloadCertificate}
              disabled={downloadingCertificate}
              className="btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 12,
                padding: "8px 16px",
                fontSize: 12,
                opacity: downloadingCertificate ? 0.65 : 1,
              }}
            >
              <Download size={13} />
              {downloadingCertificate ? "Downloading..." : "Certificates"}
            </button>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            overflowX: "auto",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              fontSize: 14,
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Trophy size={15} color="var(--color-warning)" />
            Battle Room Leaderboard
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontWeight: 400,
                marginLeft: "auto",
              }}
            >
              {leaderboard.length} participant
              {leaderboard.length === 1 ? "" : "s"}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "50px minmax(140px, 1fr) minmax(140px, 1fr) 90px 110px 90px 90px",
              minWidth: 800,
              gap: 12,
              padding: "8px 16px",
              borderBottom: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              fontSize: 11,
              fontFamily: "var(--font-ui)",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            <div style={{ textAlign: "center" }}>Rank</div>
            <div>Name</div>
            <div>Organization</div>
            <div style={{ textAlign: "right" }}>Score</div>
            <div style={{ textAlign: "center" }}>Tests passed</div>
            <div style={{ textAlign: "center" }}>Time</div>
            <div style={{ textAlign: "center" }}>Status</div>
          </div>

          {leaderboard.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: "var(--text-muted)",
                fontFamily: "var(--font-ui)",
                fontSize: 13,
              }}
            >
              No participants have joined this battle yet.
            </div>
          ) : (
            leaderboard.map((row) => (
              <div
                key={row.userId || row.rank}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "50px minmax(140px, 1fr) minmax(140px, 1fr) 90px 110px 90px 90px",
                  minWidth: 800,
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border-color)",
                  background: row.isCurrentUser
                    ? "var(--accent-blue-soft)"
                    : "transparent",
                  alignItems: "center",
                  fontSize: 13,
                  fontFamily: "var(--font-ui)",
                }}
              >
                <div
                  style={{
                    color:
                      row.rank <= 3
                        ? "var(--color-warning)"
                        : "var(--text-muted)",
                    fontWeight: row.rank <= 3 ? 700 : 400,
                    textAlign: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                  }}
                >
                  {getRankDisplay(row.rank)}
                </div>
                <div
                  style={{
                    color: row.isCurrentUser
                      ? "var(--accent-blue-bright)"
                      : "var(--text-primary)",
                    fontWeight: row.isCurrentUser ? 600 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name}
                  {row.isCurrentUser && (
                    <span
                      style={{
                        color: "var(--text-faint)",
                        fontSize: 10,
                        marginLeft: 6,
                      }}
                    >
                      (you)
                    </span>
                  )}
                </div>
                <div
                  style={{
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.organization}
                </div>
                <div
                  style={{
                    color: "var(--accent-blue-bright)",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  {Math.round(row.totalScore)}
                </div>
                <div
                  style={{ color: "var(--text-muted)", textAlign: "center" }}
                >
                  {row.totalPassed}/{row.totalTestCases ?? row.totalQuestions}
                </div>
                <div
                  style={{ color: "var(--text-muted)", textAlign: "center" }}
                >
                  {formatDuration(row.timeToSolve)}
                </div>
                <div style={{ textAlign: "center" }}>
                  <span
                    style={{
                      color:
                        row.status === "DISQUALIFIED"
                          ? "var(--color-danger)"
                          : "var(--color-success)",
                      fontWeight: 600,
                      fontSize: 11,
                    }}
                  >
                    {row.status === "DISQUALIFIED"
                      ? "Disqualified"
                      : "Completed"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <BattleRoomShareModal
        isOpen={Boolean(selectedCertificate)}
        onClose={() => setSelectedCertificate(null)}
        result={selectedCertificate}
        userName={
          leaderboard.find((row) => row.isCurrentUser)?.name || user?.name
        }
      />
    </div>
  );
}
