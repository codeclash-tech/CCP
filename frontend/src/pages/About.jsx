import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  ExternalLink,
  Lightbulb,
  Swords,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getPlatformStats } from "../services/platformService";
import "./About.css";

function formatCount(value) {
  return new Intl.NumberFormat().format(value);
}

const PLATFORM_STATS_CACHE_MS = 5 * 60 * 1000;
let cachedPlatformStats = null;
let cachedPlatformStatsAt = 0;
let platformStatsRequest = null;

function loadPlatformStats() {
  if (!platformStatsRequest) {
    platformStatsRequest = getPlatformStats()
      .then((result) => {
        cachedPlatformStats = result;
        cachedPlatformStatsAt = Date.now();
        return result;
      })
      .finally(() => {
        platformStatsRequest = null;
      });
  }
  return platformStatsRequest;
}

export default function About() {
  const [stats, setStats] = useState(cachedPlatformStats);
  const [statsLoading, setStatsLoading] = useState(!cachedPlatformStats);
  const [statsError, setStatsError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    if (
      cachedPlatformStats &&
      Date.now() - cachedPlatformStatsAt < PLATFORM_STATS_CACHE_MS
    ) {
      setStatsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    if (cachedPlatformStats) setStatsLoading(false);
    loadPlatformStats()
      .then((result) => {
        if (isCurrent) {
          setStats(result);
          setStatsLoading(false);
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setStatsError(
            error.message || "Platform statistics could not be loaded.",
          );
          setStatsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero-copy">
          <span className="about-eyebrow">
            <Code2 size={15} /> A product by AMUX
          </span>
          <h1>Make coding practice a shared challenge.</h1>
          <p>
            CodeClash is a AMUX's product that lets you create and take part in
            coding challenges. It provides a platform for developers to test
            their skills, learn from others, and engage in friendly competition.
            Whether you're a creator looking to host a challenge or a challenger
            eager to test your abilities, CodeClash has you covered.
          </p>
          <p></p>
          <div className="about-hero-actions">
            <Link className="btn-primary" to="/register">
              Get started <ArrowRight size={16} />
            </Link>
            <a
              className="about-amux-link"
              href="https://amux.in"
              target="_blank"
              rel="noreferrer"
            >
              Meet AMUX <ExternalLink size={14} />
            </a>
          </div>
        </div>
        <aside
          className="about-hero-stats"
          aria-label="CodeClash community"
          aria-busy={statsLoading}
        >
          <div className="about-stat-card">
            <span className="about-stat-icon">
              <Users size={19} />
            </span>
            <div>
              {stats ? (
                <strong>{formatCount(stats.memberCount)}</strong>
              ) : statsLoading ? (
                <span className="about-stat-skeleton" aria-label="Loading" />
              ) : (
                <strong>—</strong>
              )}
              <span>Verified members</span>
            </div>
          </div>
          <div className="about-stat-card">
            <span className="about-stat-icon">
              <Lightbulb size={19} />
            </span>
            <div>
              {stats ? (
                <strong>{formatCount(stats.creatorCount)}</strong>
              ) : statsLoading ? (
                <span className="about-stat-skeleton" aria-label="Loading" />
              ) : (
                <strong>—</strong>
              )}
              <span>Battle creators</span>
            </div>
          </div>
          <p className="about-stats-note" aria-live="polite">
            {statsError
              ? statsError
              : stats
                ? "Join the battle now!"
                : statsLoading
                  ? "Loading community totals…"
                  : ""}
          </p>
        </aside>
      </section>

      <section className="about-section">
        <div className="about-section-heading">
          <span className="about-eyebrow">
            One platform, two ways to take part
          </span>
          <h2>Create a challenge or take one on.</h2>
        </div>
        <div className="about-audience-grid">
          <article className="about-audience-card">
            <span className="about-card-icon">
              <Lightbulb size={21} />
            </span>
            <h3>For creators</h3>
            <p>
              Build a battle around your own coding questions, choose its
              settings, and share access with the people you want to challenge.
              Track participation and review results from one place.
            </p>
            <ul>
              <li>
                <CheckCircle2 size={16} /> Create and configure coding battles
              </li>
              <li>
                <CheckCircle2 size={16} /> Share a room with participants
              </li>
              <li>
                <CheckCircle2 size={16} /> Review submissions and results
              </li>
            </ul>
            <Link to="/battle-room/create" className="about-card-link">
              Create a battle <ArrowRight size={15} />
            </Link>
          </article>
          <article className="about-audience-card">
            <span className="about-card-icon">
              <Swords size={21} />
            </span>
            <h3>For challengers</h3>
            <p>
              Join a battle with its room code, solve problems in the coding
              editor, and submit your work within the challenge rules. Follow
              your results and sharpen your problem-solving skills.
            </p>
            <ul>
              <li>
                <CheckCircle2 size={16} /> Join a shared coding challenge
              </li>
              <li>
                <CheckCircle2 size={16} /> Write, run, and submit solutions
              </li>
              <li>
                <CheckCircle2 size={16} /> See your score and leaderboard
              </li>
            </ul>
            <Link to="/battle-room" className="about-card-link">
              Find a battle <ArrowRight size={15} />
            </Link>
          </article>
        </div>
      </section>

      <section className="about-platform">
        <div className="about-platform-icon">
          <BarChart3 size={22} />
        </div>
        <div>
          <span className="about-eyebrow">Built for practical practice</span>
          <h2>Focused coding battles, with clear outcomes.</h2>
          <p>
            CodeClash brings challenge authoring, timed problem solving, code
            execution, and result tracking together. It gives creators a
            straightforward way to run an exercise and gives challengers a clear
            place to put their skills to work.
          </p>
        </div>
      </section>

      <section className="about-cta">
        <div>
          <h2>Ready to join the next challenge?</h2>
          <p>Create an account to host a battle or take part in one.</p>
        </div>
        <Link className="btn-primary" to="/register">
          Join CodeClash <ArrowRight size={16} />
        </Link>
      </section>
      <p className="about-byline">
        CodeClash is a product of{" "}
        <a href="https://amux.in" target="_blank" rel="noreferrer">
          AMUX
        </a>
        .
      </p>
    </div>
  );
}
