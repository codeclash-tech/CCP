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

export default function About() {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    getPlatformStats()
      .then((result) => {
        if (isCurrent) setStats(result);
      })
      .catch((error) => {
        if (isCurrent) {
          setStatsError(
            error.message || "Platform statistics could not be loaded.",
          );
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
            CodeClash helps people turn programming questions into focused,
            timed coding battles. Creators set the challenge; participants
            solve it, see how they did, and learn through the experience.
          </p>
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
        <div className="about-hero-mark" aria-hidden="true">
          <div className="about-mark-ring">
            <Swords size={58} strokeWidth={1.4} />
          </div>
          <span>Think. Code. Compete.</span>
        </div>
      </section>

      <section className="about-stats" aria-label="CodeClash community">
        <div className="about-stat-card">
          <span className="about-stat-icon"><Users size={19} /></span>
          <div>
            <strong>{stats ? formatCount(stats.memberCount) : "—"}</strong>
            <span>Registered members</span>
          </div>
        </div>
        <div className="about-stat-card">
          <span className="about-stat-icon"><Lightbulb size={19} /></span>
          <div>
            <strong>{stats ? formatCount(stats.creatorCount) : "—"}</strong>
            <span>Battle creators</span>
          </div>
        </div>
        <p className="about-stats-note" aria-live="polite">
          {statsError
            ? statsError
            : stats
              ? "Members are counted by account. Creators are counted once per email, no matter how many battles they create."
              : "Loading current community totals…"}
        </p>
      </section>

      <section className="about-section">
        <div className="about-section-heading">
          <span className="about-eyebrow">One platform, two ways to take part</span>
          <h2>Create a challenge or take one on.</h2>
        </div>
        <div className="about-audience-grid">
          <article className="about-audience-card">
            <span className="about-card-icon"><Lightbulb size={21} /></span>
            <h3>For creators</h3>
            <p>
              Build a battle around your own coding questions, choose its
              settings, and share access with the people you want to challenge.
              Track participation and review results from one place.
            </p>
            <ul>
              <li><CheckCircle2 size={16} /> Create and configure coding battles</li>
              <li><CheckCircle2 size={16} /> Share a room with participants</li>
              <li><CheckCircle2 size={16} /> Review submissions and results</li>
            </ul>
            <Link to="/battle-room/create" className="about-card-link">
              Create a battle <ArrowRight size={15} />
            </Link>
          </article>
          <article className="about-audience-card">
            <span className="about-card-icon"><Swords size={21} /></span>
            <h3>For challengers</h3>
            <p>
              Join a battle with its room code, solve problems in the coding
              editor, and submit your work within the challenge rules. Follow
              your results and sharpen your problem-solving skills.
            </p>
            <ul>
              <li><CheckCircle2 size={16} /> Join a shared coding challenge</li>
              <li><CheckCircle2 size={16} /> Write, run, and submit solutions</li>
              <li><CheckCircle2 size={16} /> See your score and leaderboard</li>
            </ul>
            <Link to="/battle-room" className="about-card-link">
              Find a battle <ArrowRight size={15} />
            </Link>
          </article>
        </div>
      </section>

      <section className="about-platform">
        <div className="about-platform-icon"><BarChart3 size={22} /></div>
        <div>
          <span className="about-eyebrow">Built for practical practice</span>
          <h2>Focused coding battles, with clear outcomes.</h2>
          <p>
            CodeClash brings challenge authoring, timed problem solving, code
            execution, and result tracking together. It gives creators a
            straightforward way to run an exercise and gives challengers a
            clear place to put their skills to work.
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
        <a href="https://amux.in" target="_blank" rel="noreferrer">AMUX</a>.
      </p>
    </div>
  );
}
