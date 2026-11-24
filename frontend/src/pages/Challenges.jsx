import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LockKeyhole, Trophy, Swords, ArrowRight, Timer } from "lucide-react";
import api from "../services/api";
import PageSkeleton from "../components/layout/PageSkeleton";
import "./Challenges.css";

export default function Challenges() {
  const navigate = useNavigate();
  const [daily, setDaily] = useState(null);
  const [activeRooms, setActiveRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [dailyResult, roomsResult] = await Promise.allSettled([
        api.get("/weekly-assessments/current"),
        api.get("/battle-rooms/joined-rooms"),
      ]);
      if (
        dailyResult.status === "fulfilled" &&
        dailyResult.value.data?.cycle &&
        dailyResult.value.data?.question
      ) {
        setDaily(dailyResult.value.data);
      } else {
        setDaily(null);
      }
      if (roomsResult.status === "fulfilled") {
        const now = Date.now();
        setActiveRooms(
          (roomsResult.value.data.rooms || []).filter((room) => {
            const end = room.endDate || room.endTime;
            return (
              ["ACTIVE", "LIVE", "UPCOMING"].includes(room.status) ||
              (end && new Date(end).getTime() > now)
            );
          }),
        );
      }
      setError("");
    } catch (loadError) {
      if (!silent) setError(loadError.message || "Could not load challenges.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => load(true), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading) {
    return <PageSkeleton label="Loading challenges" />;
  }

  return (
    <main className="challenges-page">
      <header className="challenges-header">
        <p className="challenges-eyebrow">CODECLASH CHALLENGES</p>
        <h1>Challenges</h1>
        <p>
          Take on today&apos;s CodeClash Challenge or join a live battle with a
          key from your organisation.
        </p>
      </header>

      {error && (
        <p className="weekly-error" role="alert">
          {error}
        </p>
      )}

      {daily ? (
        <section
          className="challenges-gold-card"
          role="button"
          tabIndex={0}
          aria-label="Start today's CodeClash Challenge"
          onClick={() => navigate("/weekly-assessment")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              navigate("/weekly-assessment");
            }
          }}
        >
          <div className="challenges-gold-shine" aria-hidden="true" />
          <div className="challenges-gold-content">
            <span className="challenges-gold-badge">
              <LockKeyhole size={15} aria-hidden="true" />
              TODAY&apos;S CODECLASH CHALLENGE
            </span>
            <h2>{daily.cycle?.name || "Today's CodeClash Challenge"}</h2>
            <p>
              One challenge. One day. Compete against every organisation and
              coder on the platform — the leaderboard resets at midnight.
            </p>
            <div className="challenges-gold-footer">
              <span className="challenges-gold-cta">
                Start today&apos;s challenge
                <ArrowRight size={15} aria-hidden="true" />
              </span>
              {daily.cycle?.endAt && (
                <span className="challenges-gold-timer">
                  <Timer size={14} aria-hidden="true" />
                  Closes{" "}
                  {new Date(daily.cycle.endAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })}
                </span>
              )}
            </div>
          </div>
          <Trophy
            className="challenges-gold-trophy"
            size={96}
            aria-hidden="true"
          />
        </section>
      ) : (
        <section className="challenges-empty-gold">
          <LockKeyhole size={26} aria-hidden="true" />
          <h2>No challenge open right now</h2>
          <p>
            Today&apos;s CodeClash Challenge has not started yet. Check back
            when the next challenge opens.
          </p>
        </section>
      )}

      <section className="challenges-battles">
        <h2>Live battles</h2>
        {activeRooms.length === 0 ? (
          <p className="challenges-battles-empty">
            No battles are live right now. When a primary admin publishes a
            battle, it appears here — join with the key shared by your
            organisation.
          </p>
        ) : (
          <div className="challenges-battle-grid">
            {activeRooms.map((room) => (
              <article
                key={room.id || room.roomCode}
                className="challenges-battle-card"
              >
                <div className="challenges-battle-head">
                  <Swords size={17} aria-hidden="true" />
                  <strong>{room.title}</strong>
                </div>
                <p className="challenges-battle-meta">
                  {room.questionCount || 0} question
                  {room.questionCount === 1 ? "" : "s"} · {room.timeLimit}{" "}
                  {room.timeLimitUnit || "minutes"}
                </p>
                <div className="challenges-battle-join">
                  <input
                    aria-label={`Battle key for ${room.title}`}
                    placeholder="Battle key"
                    maxLength={6}
                    onChange={(event) => {
                      event.target.dataset.key =
                        event.target.value.toUpperCase();
                    }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={(event) => {
                      const input = event.target
                        .closest(".challenges-battle-join")
                        .querySelector("input");
                      const key = (input?.dataset.key || input?.value || "")
                        .trim()
                        .toUpperCase();
                      if (key) {
                        navigate(`/battle-room/${key}/challenge`);
                      }
                    }}
                  >
                    Join
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
