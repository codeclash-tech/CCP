import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { joinRoom, getMyRooms, getJoinedRooms, shareKey } from "../services/battleRoomService";
import { formatDate } from "../utils/helpers";
import RoomKeyModal from "../components/battleRoom/RoomKeyModal";
import {
  Swords,
  PlusCircle,
  LogIn,
  Trophy,
  KeyRound,
  Loader2,
  Share2,
  Copy,
  Check,
  Menu,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { isMobileDevice } from "../utils/device";

const ROOM_LIST_CACHE_TTL = 30_000;

function readRoomListCache(kind, userId) {
  if (!userId) return null;
  try {
    const cached = JSON.parse(
      sessionStorage.getItem(`ccp:${kind}-rooms:${userId}`) || "null",
    );
    if (!Array.isArray(cached?.rooms) || !Number.isFinite(cached.fetchedAt)) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function writeRoomListCache(kind, userId, rooms) {
  if (!userId) return;
  try {
    sessionStorage.setItem(
      `ccp:${kind}-rooms:${userId}`,
      JSON.stringify({ rooms, fetchedAt: Date.now() }),
    );
  } catch (error) {
    console.warn("Unable to cache battle room list:", error.message);
  }
}

function RoomListSkeleton({ joined = false }) {
  const columns = joined
    ? "100px 1fr 80px 80px 100px"
    : "100px 1fr 90px 70px 90px 90px";
  return (
    <div aria-label="Loading rooms" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="room-list-row"
          style={{
            display: "grid",
            gridTemplateColumns: columns,
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          {Array.from({ length: joined ? 5 : 6 }, (_, cell) => (
            <div
              key={cell}
              style={{
                height: 14,
                maxWidth: cell === 1 ? 260 : 90,
                borderRadius: 4,
                background: "var(--bg-card)",
                opacity: 0.75,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function getRoomStatusLabel(room, now = Date.now()) {
  if (room.submissionStatus === "COMPLETED") return "Completed";
  if (room.submissionStatus === "DISQUALIFIED") return "Disqualified";

  const startTime = room.startDate || room.startTime;
  const endTime = room.endDate || room.endTime;
  const start = startTime ? new Date(startTime).getTime() : NaN;
  const end = endTime ? new Date(endTime).getTime() : NaN;

  if (
    room.status === "ACTIVE" ||
    room.status === "LIVE" ||
    (Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= now &&
      now < end)
  ) {
    return "Live";
  }
  if (room.status === "CLOSED" || (Number.isFinite(end) && end <= now)) {
    return "Completed";
  }
  return "Upcoming";
}

function getStatusColor(status) {
  if (status === "Live") return "var(--color-success)";
  if (status === "Completed" || status === "Disqualified") {
    return status === "Disqualified"
      ? "var(--color-danger)"
      : "var(--text-muted)";
  }
  return "var(--color-warning)";
}

function CopyableCode({ code, onCopyError }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e) => {
    e.stopPropagation();
    onCopyError("");
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onCopyError("Couldn't copy the room key. Please select and copy it manually.");
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy room key ${code}`}
      title="Copy room key"
      style={{
        border: 0,
        padding: 0,
        background: "transparent",
        font: "inherit",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        color: "var(--color-warning)",
        fontWeight: 700,
        letterSpacing: 2,
        fontFamily: "var(--font-code)",
      }}
    >
      {code}
      {copied ? <Check size={12} color="var(--color-success)" /> : <Copy size={11} style={{ opacity: 0.5 }} />}
    </button>
  );
}

export default function BattleRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [joinCode, setJoinCode] = useState(location.state?.joinRoomCode || "");
  const [joinOrganization, setJoinOrganization] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || "create-join",
  );
  const userId = user?.id || user?._id;
  const myRoomsCache = useMemo(
    () => readRoomListCache("my", userId),
    [userId],
  );
  const joinedRoomsCache = useMemo(
    () => readRoomListCache("joined", userId),
    [userId],
  );
  const [roomTabsOpen, setRoomTabsOpen] = useState(false);
  const [myRooms, setMyRooms] = useState(() => myRoomsCache?.rooms || []);
  const [joinedRooms, setJoinedRooms] = useState(
    () => joinedRoomsCache?.rooms || [],
  );
  const [hasMyRooms, setHasMyRooms] = useState(Boolean(myRoomsCache));
  const [hasJoinedRooms, setHasJoinedRooms] = useState(
    Boolean(joinedRoomsCache),
  );
  const [loadingMyRooms, setLoadingMyRooms] = useState(
    !myRoomsCache && (location.state?.activeTab || "create-join") === "my-rooms",
  );
  const [loadingJoinedRooms, setLoadingJoinedRooms] = useState(
    !joinedRoomsCache &&
      (location.state?.activeTab || "create-join") === "joined-rooms",
  );
  const [myRoomsError, setMyRoomsError] = useState("");
  const [joinedRoomsError, setJoinedRoomsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [shareRoom, setShareRoom] = useState(null);
  const [shareRoomCode, setShareRoomCode] = useState("");
  const createdRoomRefreshRef = useRef(null);
  const roomListRequestsRef = useRef({ my: null, joined: null });
  const roomListFetchedAtRef = useRef({
    my: myRoomsCache?.fetchedAt || 0,
    joined: joinedRoomsCache?.fetchedAt || 0,
  });

  const handleJoin = async () => {
    if (isMobileDevice()) {
      setJoinError(
        "Tests can only be attended using a desktop or PC. You have not joined the battle and will not be disqualified.",
      );
      return;
    }
    if (joinOrganization.trim().length < 2 || joinOrganization.trim().length > 120) {
      setJoinError("Enter your organization (2-120 characters) before joining.");
      return;
    }
    if (!joinCode.trim()) {
      setJoinError("Please enter a room key.");
      return;
    }

    setJoinError("");
    setJoining(true);
    try {
      await joinRoom(joinCode.trim().toUpperCase(), joinOrganization.trim());
      navigate(`/battle-room/${joinCode.trim().toUpperCase()}/challenge`);
    } catch (err) {
      setJoinError(err.message || "Failed to join room. Check the key and try again.");
    } finally {
      setJoining(false);
    }
  };

  const handleViewLeaderboard = async () => {
    if (!joinCode.trim()) {
      setJoinError("Please enter a room key to view leaderboard.");
      return;
    }
    navigate(`/battle-room/${joinCode.trim().toUpperCase()}/leaderboard`);
  };

  const loadMyRooms = useCallback(async (force = false) => {
    if (roomListRequestsRef.current.my) {
      return roomListRequestsRef.current.my;
    }
    if (
      !force &&
      Date.now() - roomListFetchedAtRef.current.my < ROOM_LIST_CACHE_TTL
    ) {
      return;
    }

    if (!hasMyRooms) setLoadingMyRooms(true);
    setMyRoomsError("");
    const request = (async () => {
      try {
        const data = await getMyRooms();
        const rooms = data.rooms || [];
        setMyRooms(rooms);
        setHasMyRooms(true);
        roomListFetchedAtRef.current.my = Date.now();
        writeRoomListCache("my", userId, rooms);
      } catch (err) {
        setMyRoomsError(err.message || "Failed to load your rooms.");
      } finally {
        setLoadingMyRooms(false);
        roomListRequestsRef.current.my = null;
      }
    })();
    roomListRequestsRef.current.my = request;
    return request;
  }, [hasMyRooms, userId]);

  const loadJoinedRooms = useCallback(async (force = false) => {
    if (roomListRequestsRef.current.joined) {
      return roomListRequestsRef.current.joined;
    }
    if (
      !force &&
      Date.now() - roomListFetchedAtRef.current.joined < ROOM_LIST_CACHE_TTL
    ) {
      return;
    }

    if (!hasJoinedRooms) setLoadingJoinedRooms(true);
    setJoinedRoomsError("");
    const request = (async () => {
      try {
        const data = await getJoinedRooms();
        const rooms = data.rooms || [];
        setJoinedRooms(rooms);
        setHasJoinedRooms(true);
        roomListFetchedAtRef.current.joined = Date.now();
        writeRoomListCache("joined", userId, rooms);
      } catch (err) {
        setJoinedRoomsError(err.message || "Failed to load joined rooms.");
      } finally {
        setLoadingJoinedRooms(false);
        roomListRequestsRef.current.joined = null;
      }
    })();
    roomListRequestsRef.current.joined = request;
    return request;
  }, [hasJoinedRooms, userId]);

  useEffect(() => {
    if (activeTab === "my-rooms") {
      const createdRoomCode = location.state?.createdRoomCode;
      const forceRefresh =
        Boolean(createdRoomCode) &&
        createdRoomRefreshRef.current !== createdRoomCode;
      if (forceRefresh) createdRoomRefreshRef.current = createdRoomCode;
      loadMyRooms(forceRefresh);
    } else if (activeTab === "joined-rooms") {
      loadJoinedRooms();
    }
  }, [activeTab, loadJoinedRooms, loadMyRooms, location.state]);

  useEffect(() => {
    const refreshStaleRoomList = () => {
      if (document.visibilityState !== "visible") return;
      if (activeTab === "my-rooms") loadMyRooms();
      if (activeTab === "joined-rooms") loadJoinedRooms();
    };
    document.addEventListener("visibilitychange", refreshStaleRoomList);
    return () =>
      document.removeEventListener("visibilitychange", refreshStaleRoomList);
  }, [activeTab, loadJoinedRooms, loadMyRooms]);

  const handleShareKey = useCallback(async (e, room) => {
    e.stopPropagation();
    setActionError("");
    try {
      const data = await shareKey(room.roomCode);
      setShareRoom(room);
      setShareRoomCode(data.roomKey || room.roomCode);
      setShowKeyModal(true);
    } catch (err) {
      setActionError(err.message || "Failed to get the room key.");
    }
  }, []);

  return (
    <div className="battle-room-page" style={{ padding: "24px 32px", margin: "0 auto", width: "100%", boxSizing: "border-box", fontFamily: "var(--font-ui)" }}>
      <div style={{ marginBottom: 32, padding: "28px 32px", background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 12 }}>
        <h1 style={{ color: "var(--text-primary)", fontSize: 22, margin: "0 0 8px", fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Swords size={24} color="var(--accent-blue-bright)" />
          Battle Room
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          Create your own coding war room with custom challenges. Share the key for others to join and compete!
          Rooms are private — only people with the key can join.
        </p>
      </div>

      <div className="battle-room-tabs-wrap">
        <button
          className="battle-room-tabs-toggle"
          type="button"
          aria-expanded={roomTabsOpen}
          aria-controls="battle-room-tabs"
          onClick={() => setRoomTabsOpen((open) => !open)}
        >
          <Menu size={17} />
          {activeTab === "create-join"
            ? "Create / Join"
            : activeTab === "my-rooms"
              ? "My Rooms"
              : "Joined Rooms"}
        </button>
        <div
          id="battle-room-tabs"
          className="battle-room-tabs"
          data-open={roomTabsOpen}
        >
          {[
            { key: "create-join", label: "Create / Join", icon: <PlusCircle size={14} /> },
            { key: "my-rooms", label: "My Rooms", icon: <KeyRound size={14} /> },
            { key: "joined-rooms", label: "Joined Rooms", icon: <LogIn size={14} /> },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setRoomTabsOpen(false);
              }}
              className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
              aria-pressed={activeTab === tab.key}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          style={{
            color: "var(--color-danger)",
            background: "rgba(218, 54, 51, 0.1)",
            border: "1px solid rgba(218, 54, 51, 0.3)",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {actionError}
        </div>
      )}

      {activeTab === "create-join" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 12, padding: 24 }}>
            <h2 style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-ui)", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Create New Battle
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Design your own Java challenges with custom test cases, set a time limit, and generate a private room key for others to join.
            </p>
            <Link
              to="/battle-room/create"
              className="btn-primary"
              style={{ textDecoration: "none", display: "inline-flex" }}
            >
              <PlusCircle size={16} />
              Create Room
            </Link>
          </div>

          <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 12, padding: 24 }}>
            <h2 style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-ui)", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Join Battle
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>
              Enter the room key and your organization. Your verified account supplies your name and email; the organization you enter is recorded for this battle.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                Joining as <strong>{user?.name}</strong> · {user?.email}
              </div>
              <input
                type="text"
                value={joinOrganization}
                onChange={(e) => {
                  setJoinOrganization(e.target.value);
                  setJoinError("");
                }}
                placeholder="Enter your organization"
                maxLength={120}
                autoComplete="organization"
                required
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  color: "var(--text-primary)",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter Room Key (e.g. ABC123)"
                maxLength={6}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  color: "var(--text-primary)",
                  fontSize: 16,
                  fontFamily: "var(--font-code)",
                  textAlign: "center",
                  letterSpacing: 4,
                  fontWeight: 700,
                  outline: "none",
                }}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
              {joinError && (
                <div role="alert" style={{ color: "var(--color-danger)", fontSize: 12, fontFamily: "var(--font-ui)" }}>
                  {joinError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {joining ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <LogIn size={14} />}
                  {joining ? "Joining..." : "Join Battle"}
                </button>
                <button
                  onClick={handleViewLeaderboard}
                  className="btn-secondary"
                >
                  <Trophy size={14} />
                  Leaderboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "my-rooms" && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: 14, fontFamily: "var(--font-ui)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={15} color="var(--accent-blue-bright)" />
            Rooms You Created
          </div>
          {myRoomsError && hasMyRooms ? (
            <div role="alert" style={{ padding: "10px 16px", color: "var(--color-danger)", fontSize: 12 }}>
              {myRoomsError} Showing saved results.{" "}
              <button type="button" className="btn-secondary" onClick={() => loadMyRooms(true)} style={{ padding: "4px 8px", fontSize: 11 }}>
                Retry
              </button>
            </div>
          ) : null}
          {loadingMyRooms && !hasMyRooms ? (
            <RoomListSkeleton />
          ) : myRoomsError && !hasMyRooms ? (
            <div role="alert" style={{ padding: 24, textAlign: "center", color: "var(--color-danger)", fontFamily: "var(--font-ui)", fontSize: 13 }}>
              <p style={{ marginBottom: 12 }}>{myRoomsError}</p>
              <button type="button" className="btn-secondary" onClick={() => loadMyRooms(true)}>
                Try again
              </button>
            </div>
          ) : myRooms.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-ui)", fontSize: 13 }}>
              You haven't created any rooms yet.
            </div>
          ) : (
            <div className="room-list-scroll room-list-created">
              <div className="room-list-row room-list-header" style={{ display: "grid", gridTemplateColumns: "100px 1fr 90px 70px 90px 90px", gap: 12, padding: "8px 16px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: 11, fontFamily: "var(--font-ui)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                <div>Key</div>
                <div>Title</div>
                <div>Status</div>
                <div>Players</div>
                <div>Created</div>
                <div>Actions</div>
              </div>
              {myRooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => {
                    if (room.status === "UPCOMING") navigate(`/battle-room/${room.roomCode}`);
                    else if (room.status === "ACTIVE") navigate(`/battle-room/${room.roomCode}/challenge`);
                    else navigate(`/battle-room/${room.roomCode}/leaderboard`);
                  }}
                  className="room-list-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px 1fr 90px 70px 90px 90px",
                    gap: 12,
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--border-color)",
                    fontSize: 12,
                    fontFamily: "var(--font-ui)",
                    alignItems: "center",
                    cursor: "pointer",
                    background:
                      room.roomCode === location.state?.createdRoomCode
                        ? "var(--accent-blue-soft)"
                        : undefined,
                  }}
                >
                  <CopyableCode
                    code={room.roomCode}
                    onCopyError={setActionError}
                  />
                  <div style={{ color: "var(--text-primary)" }}>{room.title}</div>
                  <div style={{ color: getStatusColor(getRoomStatusLabel(room)), fontWeight: 600 }}>
                    {getRoomStatusLabel(room)}
                  </div>
                  <div style={{ color: "var(--text-muted)", textAlign: "center" }}>{room.participantCount || 0}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    {formatDate(room.createdAt)}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={(e) => handleShareKey(e, room)}
                      title="Share key"
                      style={{ background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.3)", color: "var(--color-warning)", borderRadius: 5, padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontSize: 11 }}
                    >
                      <Share2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "joined-rooms" && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: 14, fontFamily: "var(--font-ui)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <LogIn size={15} color="var(--accent-blue-bright)" />
            Rooms You Joined
          </div>
          {joinedRoomsError && hasJoinedRooms ? (
            <div role="alert" style={{ padding: "10px 16px", color: "var(--color-danger)", fontSize: 12 }}>
              {joinedRoomsError} Showing saved results.{" "}
              <button type="button" className="btn-secondary" onClick={() => loadJoinedRooms(true)} style={{ padding: "4px 8px", fontSize: 11 }}>
                Retry
              </button>
            </div>
          ) : null}
          {loadingJoinedRooms && !hasJoinedRooms ? (
            <RoomListSkeleton joined />
          ) : joinedRoomsError && !hasJoinedRooms ? (
            <div role="alert" style={{ padding: 24, textAlign: "center", color: "var(--color-danger)", fontFamily: "var(--font-ui)", fontSize: 13 }}>
              <p style={{ marginBottom: 12 }}>{joinedRoomsError}</p>
              <button type="button" className="btn-secondary" onClick={() => loadJoinedRooms(true)}>
                Try again
              </button>
            </div>
          ) : joinedRooms.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-ui)", fontSize: 13 }}>
              You haven't joined any rooms yet.
            </div>
          ) : (
            <div className="room-list-scroll room-list-joined">
              <div className="room-list-row room-list-header" style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px 80px 100px", gap: 12, padding: "8px 16px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: 11, fontFamily: "var(--font-ui)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                <div>Key</div>
                <div>Title</div>
                <div>Score</div>
                <div>Status</div>
                <div>Submitted</div>
              </div>
              {joinedRooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => {
                    if (room.status === "ACTIVE" && room.submissionStatus !== "COMPLETED" && room.submissionStatus !== "DISQUALIFIED") {
                      navigate(`/battle-room/${room.roomCode}/challenge`);
                    } else {
                      navigate(`/battle-room/${room.roomCode}/leaderboard`);
                    }
                  }}
                  className="room-list-row"
                  style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px 80px 100px", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border-color)", fontSize: 12, fontFamily: "var(--font-ui)", alignItems: "center", cursor: "pointer" }}
                >
                  <span style={{ color: "var(--color-warning)", fontWeight: 700, letterSpacing: 2, fontFamily: "var(--font-code)" }}>
                    {room.roomCode}
                  </span>
                  <div style={{ color: "var(--text-primary)" }}>{room.title}</div>
                  <div style={{ color: "var(--accent-blue-bright)", textAlign: "center", fontWeight: 600 }}>
                    {Math.round(room.totalScore || 0)}
                  </div>
                  <div style={{ color: getStatusColor(getRoomStatusLabel(room)), fontWeight: 600 }}>
                    {getRoomStatusLabel(room)}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    {room.submittedAt ? formatDate(room.submittedAt) : "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <RoomKeyModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        roomCode={shareRoomCode}
        room={shareRoom}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
