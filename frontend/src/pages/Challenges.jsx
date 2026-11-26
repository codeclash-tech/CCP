import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Brain,
  BookOpen,
  ListChecks,
  LockKeyhole,
  Trophy,
  ArrowRight,
  Timer,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import PageSkeleton from "../components/layout/PageSkeleton";
import {
  challengeTypeLabel,
  savedChallengeIds,
  toggleSavedChallenge,
} from "../utils/challengeCards";
import "./Challenges.css";

function formatDeadline(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export function PremiumChallengeCard({
  assessment,
  saved,
  onToggleSave,
  onOpen,
  enterLabel = "Start challenge",
}) {
  const type = challengeTypeLabel(assessment);
  const deadline = formatDeadline(assessment.scheduleEndAt);
  const TypeIcon =
    type === "MCQ" ? ListChecks : type === "Coding" ? Brain : BookOpen;
  return (
    <article className="cc-card">
      <div className="cc-card-head">
        <span className="cc-card-kind">
          <TypeIcon size={13} aria-hidden="true" />
          {type}
        </span>
        <button
          type="button"
          aria-pressed={Boolean(saved)}
          aria-label={saved ? "Remove from saved" : "Save challenge to top"}
          className={`cc-card-save${saved ? " is-saved" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSave(assessment.id);
          }}
        >
          {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      <h3 className="cc-card-title">{assessment.title}</h3>
      <p className="cc-card-desc">
        {assessment.description ||
          assessment.courseTitle ||
          "Sharpen your skills with this timed evaluation."}
      </p>
      <div className="cc-card-meta">
        {deadline && (
          <span className="cc-card-chip">
            <Timer size={12} aria-hidden="true" />
            Ends {deadline}
          </span>
        )}
        <span className="cc-card-chip">
          <CheckCircle2 size={12} aria-hidden="true" />
          Free
        </span>
        <button
          type="button"
          className="cc-card-enter"
          onClick={() => onOpen(assessment)}
        >
          {enterLabel}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export default function Challenges() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userKey = user?.id || user?._id || user?.email || "user";
  const [daily, setDaily] = useState(null);
  const [activeRooms, setActiveRooms] = useState([]);
  const [strictAssessments, setStrictAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedIds, setSavedIds] = useState(() => savedChallengeIds(userKey));

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [dailyResult, roomsResult, strictResult] = await Promise.allSettled(
        [
          api.get("/weekly-assessments/current"),
          api.get("/battle-rooms/joined-rooms"),
          api.get("/learning-strict/assessments"),
        ],
      );
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
      if (strictResult.status === "fulfilled") {
        setStrictAssessments(strictResult.value.data.assessments || []);
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

  const toggleSave = (id) => {
    setSavedIds(toggleSavedChallenge(userKey, id, savedIds));
  };

  const orderedAssessments = useMemo(() => {
    const list = [...strictAssessments];
    list.sort((left, right) => {
      const savedDiff =
        Number(savedIds.has(String(right.id))) -
        Number(savedIds.has(String(left.id)));
      if (savedDiff) return savedDiff;
      const leftEnd = left.scheduleEndAt ? new Date(left.scheduleEndAt) : 0;
      const rightEnd = right.scheduleEndAt ? new Date(right.scheduleEndAt) : 0;
      return leftEnd - rightEnd;
    });
    return list;
  }, [strictAssessments, savedIds]);

  if (loading) {
    return <PageSkeleton label="Loading challenges" />;
  }

  return (
    <main className="challenges-page">
      <header className="challenges-header">
        <p className="challenges-eyebrow">CogniClash</p>
        <h1>Challenges</h1>
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
          aria-label="Start Today's CogniClash Challenge"
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
              TODAY&apos;S CogniClash CHALLENGE
            </span>
            <h2>{daily.cycle?.name || "Today's CogniClash Challenge"}</h2>
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
            Today&apos;s CogniClash Challenge has not started yet. Check back
            when the next challenge opens.
          </p>
        </section>
      )}

      <section className="challenges-battles" style={{ marginTop: 34 }}>
        <h2>All challenges</h2>
        {orderedAssessments.length === 0 ? (
          <p className="challenges-battles-empty">
            No challenges are open right now. When your organisation or the AMUX
            team publishes a challenge, it appears here.
          </p>
        ) : (
          <div className="challenges-battle-grid">
            {orderedAssessments.map((assessment) => (
              <PremiumChallengeCard
                key={assessment.id}
                assessment={assessment}
                saved={savedIds.has(String(assessment.id))}
                onToggleSave={toggleSave}
                onOpen={() => navigate(`/strict-assessment/${assessment.id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
