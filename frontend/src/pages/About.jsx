import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Brain,
  ExternalLink,
  Lightbulb,
  Swords,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getPlatformStats } from "../services/platformService";
import { DOWNLOAD_URL, isDesktopRuntime } from "../utils/desktopDownload";
import { MonitorSmartphone, ShieldCheck, Download } from "lucide-react";
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
  const isDesktop = isDesktopRuntime();
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
            <Brain size={15} /> A product by AMUX
          </span>
          <h1>Measure skill, not just practice.</h1>
          <p>
            CogniClash is AMUX's skill-evaluation product. Organizations and
            learners use it to run coding battles, daily challenges, and concept
            evaluations — every attempt scored, ranked, and reported. Whether
            you're a creator looking to host an evaluation or a participant
            ready to prove your ability, CogniClash has you covered.
          </p>
          <div className="about-hero-actions">
            {isDesktop ? (
              <Link className="btn-primary" to="/register">
                Get started <ArrowRight size={16} />
              </Link>
            ) : (
              <Link className="btn-primary" to="/install-desktop">
                <Download size={16} /> Get the desktop app
              </Link>
            )}
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
          aria-label="CogniClash community"
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
            {statsError ? (
              statsError
            ) : stats ? (
              "Join the battle now!"
            ) : statsLoading ? (
              <span
                className="loading-skeleton about-stats-note-skeleton"
                aria-label="Loading community totals"
              />
            ) : (
              ""
            )}
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
            {isDesktop ? (
              <Link to="/battle-room/create" className="about-card-link">
                Create a battle <ArrowRight size={15} />
              </Link>
            ) : (
              <Link to="/install-desktop" className="about-card-link">
                Available in the desktop app <ArrowRight size={15} />
              </Link>
            )}
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
            {isDesktop ? (
              <Link to="/battle-room" className="about-card-link">
                Find a battle <ArrowRight size={15} />
              </Link>
            ) : (
              <Link to="/install-desktop" className="about-card-link">
                Available in the desktop app <ArrowRight size={15} />
              </Link>
            )}
          </article>
        </div>
      </section>

      <section className="about-platform">
        <div className="about-platform-icon">
          <BarChart3 size={22} />
        </div>
        <div>
          <span className="about-eyebrow">Built for practical practice</span>
          <h2>Focused evaluations, with clear outcomes.</h2>
          <p>
            CogniClash brings challenge authoring, timed problem solving, code
            execution, and result tracking together. It gives creators a
            straightforward way to run an evaluation and gives participants a
            clear place to prove what they can do.
          </p>
        </div>
      </section>

      {!isDesktop && (
        <section className="about-web-desktop-note">
          <div className="about-web-desktop-card">
            <span className="about-card-icon">
              <MonitorSmartphone size={21} />
            </span>
            <h3>Web for practice, desktop for strict evaluations</h3>
            <p>
              Everything you see on this site is the same interface you get
              inside the CogniClash desktop app. Practice and browsing work on
              the web; strict evaluations and graded coding tests open in a
              proctored desktop environment, so they run in the Windows app
              only. Starting one from the web takes you straight to the
              install page.
            </p>
            <div className="about-web-desktop-actions">
              <a
                className="btn-primary"
                href={DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={15} /> Download for Windows
              </a>
              <Link to="/install-desktop" className="btn-secondary">
                <ShieldCheck size={14} /> How install &amp; strict mode works
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="about-cta">
        <div>
          <h2>Ready to join the next challenge?</h2>
          <p>
            {isDesktop
              ? "Create an account to host a battle or take part in one."
              : "Install the desktop app to host a battle or take part in one."}
          </p>
        </div>
        {isDesktop ? (
          <Link className="btn-primary" to="/register">
            Join CogniClash <ArrowRight size={16} />
          </Link>
        ) : (
          <a
            className="btn-primary"
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={16} /> Get CogniClash
          </a>
        )}
      </section>
      <p className="about-byline">
        CogniClash is a product of{" "}
        <a href="https://amux.in" target="_blank" rel="noreferrer">
          AMUX
        </a>
        .
      </p>
    </div>
  );
}
