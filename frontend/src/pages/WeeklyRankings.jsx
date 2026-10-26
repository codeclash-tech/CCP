import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import api from "../services/api";
import {
  getJoinedRooms,
  getMyRooms,
  getRoomLeaderboard,
} from "../services/battleRoomService";
import { useAuth } from "../context/AuthContext";
import PageSkeleton from "../components/layout/PageSkeleton";
import "./WeeklyRankings.css";

function labelDate(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  });
}

function normalizeOrganizationName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function indiaDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const dateParts = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function getVisibleRankingCycleKeys(now = new Date()) {
  const today = indiaDateKey(now);
  const [year, month, day] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);
  return new Set([yesterday, today]);
}

function roomIsActive(room, now = Date.now()) {
  const status = String(room.status || "").toUpperCase();
  if (["CLOSED", "ENDED", "CANCELLED"].includes(status)) return false;
  const startAt = room.startTime || room.startDate;
  const endAt = room.endTime || room.endDate;
  const start = startAt ? new Date(startAt).getTime() : null;
  const end = endAt ? new Date(endAt).getTime() : null;
  if (Number.isFinite(end) && now >= end) return false;
  if (Number.isFinite(start) && now < start) return false;
  return status === "ACTIVE" || status === "LIVE" ||
    (Number.isFinite(start) && Number.isFinite(end));
}

export default function WeeklyRankings() {
  const { user } = useAuth();
  const userId = String(user?.id || user?._id || "");
  const [activeTab, setActiveTab] = useState("rooms");
  const [rooms, setRooms] = useState([]);
  const [selectedRoomCode, setSelectedRoomCode] = useState("");
  const [roomRanking, setRoomRanking] = useState(null);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [history, setHistory] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [globalRankingType, setGlobalRankingType] = useState("individual");
  const [rankings, setRankings] = useState(null);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const rankingsCycleIdRef = useRef("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");

  const loadRooms = useCallback(async () => {
    const [created, joined] = await Promise.allSettled([
      getMyRooms(),
      getJoinedRooms(),
    ]);
    const failures = [created, joined].filter((result) => result.status === "rejected");
    const roomLists = [created, joined]
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value.rooms || []);
    if (!roomLists.length) {
      setRoomError(failures[0]?.reason?.message || "Could not load Battle Rooms.");
      return;
    }
    const uniqueRooms = new Map();
    for (const room of roomLists.flat()) {
      const code = room.roomCode || room.code;
      if (code && roomIsActive(room)) uniqueRooms.set(String(code).toUpperCase(), room);
    }
    const activeRooms = [...uniqueRooms.values()];
    setRooms(activeRooms);
    setSelectedRoomCode((current) =>
      activeRooms.some((room) =>
        String(room.roomCode || room.code).toUpperCase() === current,
      )
        ? current
        : String(activeRooms[0]?.roomCode || activeRooms[0]?.code || "").toUpperCase(),
    );
    setRoomError(
      failures.length === 2
        ? failures[0].reason?.message || "Could not load Battle Rooms."
        : "",
    );
  }, []);

  const loadHistory = useCallback(async (silent = false) => {
    if (!silent) setLoadingHistory(true);
    setError("");
    try {
      const { data } = await api.get("/weekly-assessments/history");
      const records = [...(data.history || [])].sort(
        (left, right) =>
          new Date(right.cycle?.startAt || 0) -
          new Date(left.cycle?.startAt || 0),
      );
      const visibleCycleKeys = getVisibleRankingCycleKeys();
      const recentRecords = records.filter((item) => {
        const cycleKey =
          item.cycle?.cycleKey ||
          (item.cycle?.startAt ? indiaDateKey(new Date(item.cycle.startAt)) : "");
        return visibleCycleKeys.has(cycleKey);
      });
      setHistory(recentRecords);
      setSelectedCycleId((current) =>
        recentRecords.some((item) => String(item.cycle?.id) === current)
          ? current
          : String(recentRecords[0]?.cycle?.id || ""),
      );
    } catch (requestError) {
      setError(requestError.message || "Could not load daily challenge history.");
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  }, []);

  const loadRankings = useCallback(async () => {
    if (!selectedCycleId) {
      rankingsCycleIdRef.current = "";
      setRankings(null);
      setLoadingRankings(false);
      return;
    }
    if (rankingsCycleIdRef.current !== selectedCycleId) {
      rankingsCycleIdRef.current = selectedCycleId;
      setRankings(null);
      setLoadingRankings(true);
    }
    const cycleId = selectedCycleId;
    try {
      const { data } = await api.get(
        `/weekly-assessments/cycles/${cycleId}/rankings`,
      );
      if (rankingsCycleIdRef.current === cycleId) setRankings(data);
    } catch (requestError) {
      if (rankingsCycleIdRef.current === cycleId) {
        setError(requestError.message || "Could not load daily rankings.");
      }
    } finally {
      if (rankingsCycleIdRef.current === cycleId) setLoadingRankings(false);
    }
  }, [selectedCycleId]);

  const loadRoomRanking = useCallback(async () => {
    if (!selectedRoomCode) {
      setRoomRanking(null);
      return;
    }
    setRoomLoading(true);
    try {
      const data = await getRoomLeaderboard(selectedRoomCode);
      setRoomRanking(data);
      setRoomError("");
    } catch (requestError) {
      setRoomError(requestError.message || "Could not load this room leaderboard.");
    } finally {
      setRoomLoading(false);
    }
  }, [selectedRoomCode]);

  useEffect(() => {
    loadRooms();
    loadHistory();
    const roomsInterval = window.setInterval(loadRooms, 30_000);
    const historyInterval = window.setInterval(() => loadHistory(true), 30_000);
    return () => {
      window.clearInterval(roomsInterval);
      window.clearInterval(historyInterval);
    };
  }, [loadHistory, loadRooms]);

  useEffect(() => {
    loadRankings();
    const interval = window.setInterval(loadRankings, 5_000);
    return () => window.clearInterval(interval);
  }, [loadRankings]);

  useEffect(() => {
    loadRoomRanking();
    if (!selectedRoomCode) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadRoomRanking();
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [loadRoomRanking, selectedRoomCode]);

  const currentRanking = rankings?.individualRankings?.find(
    (candidate) => String(candidate.candidateId) === userId,
  );
  const currentOrganizationName = currentRanking?.organizationNameSnapshot;
  const currentOrganizationRanking = rankings?.organizationRankings?.find(
    (organization) => {
      if (currentRanking?.organizationId) {
        return String(organization.organizationId) ===
          String(currentRanking.organizationId);
      }
      return (
        normalizeOrganizationName(currentOrganizationName) !== "" &&
        normalizeOrganizationName(organization.organizationNameSnapshot) ===
          normalizeOrganizationName(currentOrganizationName)
      );
    },
  );

  return (
    <section className="weekly-rankings-page">
      <header className="weekly-rankings-header">
        <div>
          <p className="weekly-eyebrow">LEADERBOARDS</p>
          <h1>Rankings</h1>
          <p>Follow live Battle Room standings and daily Global Challenge rankings.</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (activeTab === "rooms") loadRoomRanking();
            else {
              loadHistory();
              loadRankings();
            }
          }}
          disabled={roomLoading || loadingHistory}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      <div className="weekly-ranking-tabs" role="tablist" aria-label="Ranking types">
        <button
          id="rooms-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "rooms"}
          aria-controls="rooms-panel"
          className={activeTab === "rooms" ? "selected" : ""}
          onClick={() => setActiveTab("rooms")}
        >
          Battle Rooms
        </button>
        <button
          id="global-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "global"}
          aria-controls="global-panel"
          className={activeTab === "global" ? "selected" : ""}
          onClick={() => setActiveTab("global")}
        >
          Daily Global Challenge
        </button>
      </div>

      {activeTab === "rooms" ? (
        <section id="rooms-panel" role="tabpanel" aria-labelledby="rooms-tab">
          {roomError && <p className="weekly-error" role="alert">{roomError}</p>}
          {rooms.length === 0 ? (
            <div className="weekly-ranking-empty">
              <h2>No active Battle Rooms</h2>
              <p>Battle Room leaderboards are available while their rooms are running.</p>
              <Link to="/battle-room">Browse Battle Rooms</Link>
            </div>
          ) : (
            <div className="weekly-rankings-layout">
              <nav className="weekly-history-list" aria-label="Active Battle Rooms">
                {rooms.map((room) => {
                  const roomCode = String(room.roomCode || room.code).toUpperCase();
                  return (
                    <button
                      type="button"
                      key={roomCode}
                      className={roomCode === selectedRoomCode ? "selected" : ""}
                      onClick={() => setSelectedRoomCode(roomCode)}
                    >
                      <strong>{room.title || `Battle Room ${roomCode}`}</strong>
                      <span>{roomCode} · Live</span>
                    </button>
                  );
                })}
              </nav>
              <article className="weekly-ranking-detail">
                {roomRanking ? (
                  <>
                    <h2>{roomRanking.room?.title || `Battle Room ${selectedRoomCode}`}</h2>
                    <p>Leaderboard updates automatically while the room is active.</p>
                    {roomRanking.leaderboard?.length ? (
                      <div className="weekly-ranking-table-wrap">
                        <table className="weekly-ranking-table">
                          <thead>
                            <tr><th>Rank</th><th>Participant</th><th>Organization</th><th>Score</th><th>Passed</th></tr>
                          </thead>
                          <tbody>
                            {roomRanking.leaderboard.map((entry) => (
                              <tr key={entry.userId}>
                                <td>{entry.rank}</td>
                                <td>{entry.name}{entry.isCurrentUser ? " (you)" : ""}</td>
                                <td>{entry.organization || "—"}</td>
                                <td>{Number(entry.totalScore || 0).toFixed(2)}</td>
                                <td>{entry.totalPassed}/{entry.totalTestCases}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p>No completed submissions have been ranked yet.</p>}
                  </>
                ) : roomLoading ? (
                  <PageSkeleton compact label="Loading live leaderboard" rows={2} />
                ) : null}
              </article>
            </div>
          )}
        </section>
      ) : (
        <section id="global-panel" role="tabpanel" aria-labelledby="global-tab">
          {error && <p className="weekly-error" role="alert">{error}</p>}
          {loadingHistory ? <PageSkeleton compact label="Loading daily rankings" /> : history.length === 0 ? (
            <div className="weekly-ranking-empty">
              <h2>No daily rankings yet</h2>
              <p>Daily Global Challenge standings appear when a challenge cycle opens.</p>
            </div>
          ) : (
            <div className="weekly-rankings-layout weekly-rankings-layout-global">
              <article
                className="weekly-ranking-detail"
                id="global-ranking-results"
                role="tabpanel"
                aria-labelledby={
                  globalRankingType === "individual"
                    ? "global-individual-tab"
                    : "global-organization-tab"
                }
              >
                <nav
                  className="weekly-global-type-tabs"
                  role="tablist"
                  aria-label="Global Challenge leaderboard view"
                >
                  <button
                    id="global-individual-tab"
                    type="button"
                    role="tab"
                    aria-selected={globalRankingType === "individual"}
                    aria-controls="global-ranking-results"
                    tabIndex={globalRankingType === "individual" ? 0 : -1}
                    className={globalRankingType === "individual" ? "selected" : ""}
                    onClick={() => setGlobalRankingType("individual")}
                  >
                    Individual
                  </button>
                  <button
                    id="global-organization-tab"
                    type="button"
                    role="tab"
                    aria-selected={globalRankingType === "organization"}
                    aria-controls="global-ranking-results"
                    tabIndex={globalRankingType === "organization" ? 0 : -1}
                    className={globalRankingType === "organization" ? "selected" : ""}
                    onClick={() => setGlobalRankingType("organization")}
                  >
                    Organisation
                  </button>
                </nav>
                {history.length > 1 && (
                  <label className="weekly-cycle-select">
                    <span>Challenge date</span>
                    <select
                      value={selectedCycleId}
                      onChange={(event) => setSelectedCycleId(event.target.value)}
                    >
                      {history.map((item) => (
                        <option
                          key={item.cycle?.id}
                          value={String(item.cycle?.id || "")}
                        >
                          {item.cycle?.name || "Global Challenge"} ·{" "}
                          {labelDate(item.cycle?.startAt || item.cycle?.cycleKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {rankings ? (
                  <>
                    <h2>{rankings.cycle.name}</h2>
                    <p>{labelDate(rankings.cycle.startAt)} · {rankings.cycle.status} · Live updates every 5 seconds</p>
                    {globalRankingType === "individual" && currentRanking && (
                      <div className="weekly-own-rank">
                        <strong>
                          {currentRanking.candidateNameSnapshot
                            ? `${currentRanking.candidateNameSnapshot} · `
                            : "Your rank "}
                          #{currentRanking.rank}
                        </strong>
                        <span>{Number(currentRanking.score || 0).toFixed(2)} points</span>
                        <span>
                          {currentRanking.completedQuestions > 0
                            ? `${currentRanking.completedQuestions}/1 question completed`
                            : "Not attended"}
                        </span>
                      </div>
                    )}
                    {globalRankingType === "individual" && rankings.individualRankings?.length ? (
                      <div className="weekly-ranking-table-wrap">
                        <table className="weekly-ranking-table">
                          <thead>
                            <tr><th>Rank</th><th>Participant</th><th>Organization</th><th>Score</th><th>Completed</th><th>Status</th></tr>
                          </thead>
                          <tbody>
                            {rankings.individualRankings.map((candidate) => {
                              const isCurrentUser =
                                String(candidate.candidateId) === userId;
                              const belongsToCurrentOrganization =
                                Boolean(currentRanking?.organizationId) &&
                                String(candidate.organizationId) ===
                                  String(currentRanking.organizationId);
                              const hasSameOrganizationName =
                                normalizeOrganizationName(currentOrganizationName) !== "" &&
                                normalizeOrganizationName(candidate.organizationNameSnapshot) ===
                                  normalizeOrganizationName(currentOrganizationName);
                              return (
                                <tr
                                  key={candidate.candidateId}
                                  className={
                                    belongsToCurrentOrganization || hasSameOrganizationName
                                      ? "is-user-organization"
                                      : ""
                                  }
                                >
                                  <td>{candidate.rank}</td>
                                  <td>
                                    {candidate.candidateNameSnapshot ||
                                      (candidate.completedQuestions > 0 ? "Participant" : "Not attended")}
                                    {isCurrentUser ? " (you)" : ""}
                                  </td>
                                  <td>{candidate.organizationNameSnapshot || "—"}</td>
                                  <td>{Number(candidate.score || 0).toFixed(2)}</td>
                                  <td>{candidate.completedQuestions}/1</td>
                                  <td>{candidate.status}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    {globalRankingType === "individual" && !rankings.individualRankings?.length && (
                      <p>No participants are ranked in this cycle yet.</p>
                    )}
                    {globalRankingType === "organization" && currentOrganizationRanking && (
                      <div className="weekly-own-rank">
                        <strong>
                          {currentOrganizationRanking.organizationNameSnapshot ||
                            currentOrganizationName ||
                            "Your organization"} · #{currentOrganizationRanking.rank}
                        </strong>
                        <span>{Number(currentOrganizationRanking.finalScore || 0).toFixed(2)} points</span>
                        <span>
                          {currentOrganizationRanking.completedEligibleCandidates}/
                          {currentOrganizationRanking.eligibleCandidates} attended
                        </span>
                      </div>
                    )}
                    {globalRankingType === "organization" && rankings.organizationRankings?.length ? (
                      <div className="weekly-ranking-table-wrap">
                        <table className="weekly-ranking-table">
                          <thead>
                            <tr><th>Rank</th><th>Organisation</th><th>Score</th><th>Attended</th><th>Completion</th></tr>
                          </thead>
                          <tbody>
                            {rankings.organizationRankings.map((organization) => {
                              const belongsToCurrentOrganization =
                                Boolean(currentRanking?.organizationId) &&
                                String(organization.organizationId) ===
                                  String(currentRanking.organizationId);
                              const hasSameOrganizationName =
                                normalizeOrganizationName(currentOrganizationName) !== "" &&
                                normalizeOrganizationName(organization.organizationNameSnapshot) ===
                                  normalizeOrganizationName(currentOrganizationName);
                              return (
                                <tr
                                  key={organization.organizationId}
                                  className={
                                    belongsToCurrentOrganization || hasSameOrganizationName
                                      ? "is-user-organization"
                                      : ""
                                  }
                                >
                                  <td>{organization.rank}</td>
                                  <td>{organization.organizationNameSnapshot || "—"}</td>
                                  <td>{Number(organization.finalScore || 0).toFixed(2)}</td>
                                  <td>
                                    {organization.completedEligibleCandidates}/
                                    {organization.eligibleCandidates}
                                  </td>
                                  <td>{Number(organization.completionRate || 0).toFixed(1)}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    {globalRankingType === "organization" && !rankings.organizationRankings?.length && (
                      <p>No organization rankings are available for this cycle.</p>
                    )}
                  </>
                ) : loadingRankings ? (
                  <PageSkeleton compact label="Loading leaderboard" />
                ) : null}
              </article>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
