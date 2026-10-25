import { Link } from "react-router-dom";
import {
  ArrowRight,
  KeyRound,
  PlusCircle,
  Swords,
  Trophy,
  Mail,
  Terminal,
  CheckCircle2,
  Building2,
  GraduationCap,
  Briefcase,
  LockKeyhole,
} from "lucide-react";
import "../styles/productPages.css";

const cards = [
  {
    icon: PlusCircle,
    title: "Create a Battle Room",
    text: "Add custom Java/DS questions, set time limits, and generate a secure battle key for participants or students.",
    action: "Create Battle Room",
    to: "/battle-room/create",
    badge: "For Hosts & Recruiters",
  },
  {
    icon: KeyRound,
    title: "Join with Key",
    text: "Received an invitation key? Enter your 6-character room code to start solving challenges in real time.",
    action: "Enter Battle",
    to: "/battle-room",
    badge: "For Participants & Coders",
  },
  {
    icon: LockKeyhole,
    title: "Daily Global Challenge",
    text: "Solve today’s shared challenge. Individual scores and organization rankings start fresh every day.",
    action: "Attend today",
    to: "/weekly-assessment",
    badge: "New challenge every day",
  },
  {
    icon: Mail,
    title: "Enterprise & Support",
    text: "Looking for custom platform integration for your startup, university, or academy? Get in touch with our team.",
    action: "Contact Support",
    to: "mailto:helloamux@gmail.com?subject=CodeClash%20Enquiry",
    badge: "Partnerships",
  },
];

const targetAudiences = [
  { icon: Briefcase, label: "Technical Hiring & Interviews" },
  { icon: GraduationCap, label: "Colleges & Universities" },
  { icon: Building2, label: "Bootcamps & Training Centers" },
];

export default function Home() {
  const isDesktop =
    typeof window !== "undefined" && Boolean(window.codeClashDesktop);
  if (isDesktop) {
    return (
      <main className="product-page desktop-dashboard">
        <header className="desktop-dashboard-intro">
          <div>
            <p className="product-eyebrow">CODECLASH · AN AMUX PRODUCT</p>
            <h1>Build skill. Beat the clock.</h1>
            <p>
              A focused coding platform for daily practice, head-to-head battles,
              and measurable progress.
            </p>
          </div>
          <span className="desktop-dashboard-tag">CODING BATTLES</span>
        </header>

        <section className="desktop-daily-challenge" aria-labelledby="desktop-daily-title">
          <div className="desktop-daily-content">
            <span className="desktop-daily-badge">
              <LockKeyhole size={15} aria-hidden="true" />
              DAILY CHALLENGE
            </span>
            <h2 id="desktop-daily-title">A new problem.<br />A sharper you.</h2>
            <p>
              Take on a fresh coding challenge, sharpen your problem-solving
              skills, and see how you stack up on the daily leaderboard.
            </p>
            <div className="desktop-daily-actions">
              <Link className="desktop-daily-primary" to="/weekly-assessment">
                <LockKeyhole size={16} aria-hidden="true" />
                Start today&apos;s challenge
              </Link>
              <Link className="desktop-daily-secondary" to="/rankings">
                View rankings
              </Link>
            </div>
            <span className="desktop-daily-note">
              <Trophy size={15} aria-hidden="true" />
              Your daily progress, recognized.
            </span>
          </div>
        </section>

        <section className="desktop-dashboard-section" aria-labelledby="desktop-battle-title">
          <div className="desktop-dashboard-section-heading">
            <div>
              <p className="product-eyebrow">CHOOSE YOUR NEXT MOVE</p>
              <h2 id="desktop-battle-title">Choose your next battle</h2>
            </div>
            <p>Practice solo or bring your team into the competition.</p>
          </div>
          <div className="desktop-dashboard-quick-links">
            <Link className="desktop-dashboard-quick-link" to="/battle-room">
              <span className="desktop-dashboard-icon"><Swords size={20} /></span>
              <span>
                <strong>Battle Rooms</strong>
                <small>Join a private coding competition.</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="desktop-dashboard-quick-link" to="/battle-room/create">
              <span className="desktop-dashboard-icon"><PlusCircle size={20} /></span>
              <span>
                <strong>Create a Battle Room</strong>
                <small>Set up challenges and invite others.</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="desktop-dashboard-quick-link" to="/rankings">
              <span className="desktop-dashboard-icon"><Trophy size={20} /></span>
              <span>
                <strong>Rankings</strong>
                <small>Follow daily and live room standings.</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>

      </main>
    );
  }
  return (
    <main className="home-page">
      <style>{`
        .home-page {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          padding: 20px var(--page-gutter) 48px;
          font-family: var(--font-ui);
          color: var(--text-primary);
          box-sizing: border-box;
        }

        .home-page * {
          box-sizing: border-box;
        }

        /* HERO */
        .home-hero {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          padding: clamp(28px, 4vw, 52px) clamp(24px, 4vw, 48px);
          margin-bottom: 32px;
          border: 1px solid rgba(59, 130, 246, 0.25);
          border-radius: 20px;
          background:
            radial-gradient(
              ellipse at 88% 12%,
              rgba(0, 119, 255, 0.25),
              transparent 45%
            ),
            radial-gradient(
              ellipse at 10% 100%,
              rgba(0, 212, 255, 0.12),
              transparent 45%
            ),
            linear-gradient(
              120deg,
              #050b1c 0%,
              #07132e 55%,
              #071027 100%
            );
          box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          display: grid;
          grid-template-columns: 1fr 460px;
          gap: 36px;
          align-items: center;
        }

        /* Grid background */
        .home-hero::before {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 0;
          opacity: 0.18;
          background-image:
            linear-gradient(rgba(76, 140, 255, 0.18) 1px, transparent 1px),
            linear-gradient(90deg, rgba(76, 140, 255, 0.18) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(circle at 60% 50%, black 30%, transparent 80%);
          pointer-events: none;
        }

        /* Hero content */
        .home-hero-content {
          position: relative;
          z-index: 1;
        }

        .home-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 100px;
          background: rgba(37, 99, 235, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.3);
          color: var(--accent-blue-bright, #38bdf8);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.3px;
          margin-bottom: 20px;
        }

        .home-hero h1 {
          margin: 0 0 14px;
          color: #f8fafc;
          font-size: clamp(32px, 4vw, 52px);
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -1.5px;
        }

        .home-hero h1 span {
          background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .home-hero-description {
          max-width: 600px;
          margin: 0 0 26px;
          color: #a5b4cc;
          font-size: 15px;
          line-height: 1.75;
        }

        .home-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin-bottom: 32px;
        }

        .home-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 44px;
          padding: 10px 20px;
          border: 1px solid transparent;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          transition:
            opacity 0.2s ease,
            transform 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease,
            border-color 0.2s ease;
        }

        .home-btn:hover {
          transform: translateY(-2px);
        }

        .home-btn.primary {
          color: #fff;
          background: var(--accent-blue-bright, #2563eb);
          box-shadow: 0 4px 18px rgba(37, 99, 235, 0.35);
        }

        .home-btn.primary:hover {
          box-shadow: 0 8px 25px rgba(37, 99, 235, 0.5);
        }

        .home-btn.secondary {
          border-color: rgba(148, 163, 184, 0.25);
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(8px);
        }

        .home-btn.secondary:hover {
          border-color: rgba(56, 189, 248, 0.5);
          background: rgba(56, 189, 248, 0.08);
          color: #ffffff;
        }

        /* Hero Target Audience Bar */
        .home-hero-highlights {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .home-highlight-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 500;
        }

        .home-highlight-item svg {
          color: var(--accent-blue-bright, #38bdf8);
        }

        /* JAVA TERMINAL PREVIEW WIDGET */
        .home-hero-preview {
          position: relative;
          width: 100%;
          border-radius: 12px;
          background: rgba(10, 19, 40, 0.9);
          border: 1px solid rgba(56, 189, 248, 0.25);
          box-shadow:
            0 15px 30px rgba(0, 0, 0, 0.5),
            0 0 30px rgba(37, 99, 235, 0.15);
          backdrop-filter: blur(12px);
          overflow: hidden;
        }

        .preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: rgba(5, 12, 28, 0.85);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .preview-dots {
          display: flex;
          gap: 6px;
        }

        .preview-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .preview-dot.red { background: #ef4444; }
        .preview-dot.yellow { background: #f59e0b; }
        .preview-dot.green { background: #10b981; }

        .preview-title {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
          font-size: 11px;
          font-family: monospace;
          letter-spacing: 0.5px;
        }

        .preview-body {
          padding: 18px 20px;
          font-family: "Fira Code", "Courier New", monospace;
          font-size: 12.5px;
          line-height: 1.6;
          color: #cbd5e1;
        }

        .code-keyword { color: #f472b6; }
        .code-type { color: #38bdf8; }
        .code-func { color: #60a5fa; }
        .code-string { color: #34d399; }
        .code-comment { color: #64748b; font-style: italic; }

        .preview-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 16px;
          padding: 8px 12px;
          border-radius: 6px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #34d399;
          font-size: 12px;
          font-weight: 600;
        }

        /* SECTION HEADING */
        .home-section-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;
        }

        .home-section-heading h2 {
          margin: 0 0 4px;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        .home-section-heading p {
          margin: 0;
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        /* ACTION CARDS */
        .home-cards {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .home-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          min-width: 0;
          min-height: 210px;
          padding: 24px;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          background: var(--bg-elevated);
          transition:
            transform 0.25s ease,
            box-shadow 0.25s ease,
            border-color 0.25s ease;
          overflow: hidden;
        }

        .home-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--accent-blue-bright), transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .home-card-badge {
          position: absolute;
          top: 18px;
          right: 18px;
          padding: 3px 8px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        @media (hover: hover) and (pointer: fine) {
          .home-card:hover {
            transform: translateY(-4px);
            border-color: rgba(56, 189, 248, 0.4);
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
          }

          .home-card:hover::before {
            opacity: 1;
          }

          .home-card:hover .home-card-icon {
            transform: scale(1.08);
            border-color: rgba(56, 189, 248, 0.4);
            background: rgba(37, 99, 235, 0.18);
          }
        }

        .home-card-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border: 1px solid rgba(59, 130, 246, 0.25);
          border-radius: 10px;
          background: rgba(37, 99, 235, 0.1);
          color: var(--accent-blue-bright);
          transition: transform 0.25s ease, border-color 0.25s ease, background 0.25s ease;
        }

        .home-card h3 {
          margin: 16px 0 8px;
          font-size: 16px;
          font-weight: 600;
          line-height: 1.4;
        }

        .home-card p {
          flex: 1;
          margin: 0 0 20px;
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.6;
        }

        .home-card-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--accent-blue-bright);
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
        }

        .home-card-link:hover {
          text-decoration: underline;
        }

        .home-card-link svg {
          transition: transform 0.2s ease;
        }

        .home-card-link:hover svg {
          transform: translateX(4px);
        }

        .home-btn:focus-visible,
        .home-card-link:focus-visible {
          outline: 2px solid #06d6f5;
          outline-offset: 4px;
        }

        /* RESPONSIVE BREAKPOINTS */
        @media (max-width: 1100px) {
          .home-hero {
            grid-template-columns: 1fr;
            gap: 28px;
          }

          .home-hero-preview {
            max-width: 580px;
            margin: 0 auto;
          }
        }

        @media (max-width: 900px) {
          .home-page {
            padding-left: var(--page-gutter-compact);
            padding-right: var(--page-gutter-compact);
          }

          .home-cards {
            gap: 16px;
          }

          .home-card {
            padding: 20px;
          }
        }

        @media (max-width: 720px) {
          .home-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .home-card:last-child {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 520px) {
          .home-page {
            padding: 12px var(--page-gutter-compact) 32px;
          }

          .home-hero {
            padding: 24px 20px;
            margin-bottom: 24px;
            border-radius: 14px;
          }

          .home-eyebrow {
            margin-bottom: 14px;
            font-size: 11px;
          }

          .home-hero h1 {
            font-size: clamp(28px, 7vw, 36px);
            letter-spacing: -1px;
          }

          .home-hero-description {
            font-size: 13px;
            margin-bottom: 20px;
          }

          .home-actions {
            flex-direction: column;
            align-items: stretch;
            margin-bottom: 24px;
          }

          .home-btn {
            width: 100%;
            min-height: 44px;
          }

          .home-hero-preview {
            display: none;
          }

          .home-cards {
            grid-template-columns: 1fr;
            gap: 14px;
          }

          .home-card,
          .home-card:last-child {
            grid-column: auto;
            min-height: auto;
            padding: 20px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .home-card,
          .home-btn,
          .home-card-link svg,
          .home-card-icon {
            transition: none !important;
          }
        }
      `}</style>

      {/* HERO SECTION */}
      <section className="home-hero">
        <div className="home-hero-content">
          <div className="home-eyebrow">
            <Swords size={15} />
            <span>Java Coding Battles</span>
          </div>

          <h1>
            Create Custom Battles.
            <br />
            <span>Assess Java Talent.</span>
          </h1>

          <p className="home-hero-description">
            Host custom Java coding challenges, share secure 6-character room
            keys, and evaluate solutions instantly. Built for technical
            interviews, tech startups, colleges, and training academies.
          </p>

          <div className="home-actions">
            <Link to="/battle-room/create" className="home-btn primary">
              <PlusCircle size={16} />
              Create a Room
              <ArrowRight size={15} />
            </Link>

            <Link to="/battle-room" className="home-btn secondary">
              <KeyRound size={15} />
              Join Room Key
            </Link>
          </div>

          <div className="home-hero-highlights">
            {targetAudiences.map(({ icon: Icon, label }) => (
              <div className="home-highlight-item" key={label}>
                <Icon size={15} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* JAVA CODE TERMINAL PREVIEW WIDGET */}
        <div className="home-hero-preview" aria-hidden="true">
          <div className="preview-header">
            <div className="preview-dots">
              <div className="preview-dot red"></div>
              <div className="preview-dot yellow"></div>
              <div className="preview-dot green"></div>
            </div>
            <div className="preview-title">
              <Terminal size={12} />
              <span>Solution.java</span>
            </div>
          </div>
          <div className="preview-body">
            <div>
              <span className="code-keyword">public class</span>{" "}
              <span className="code-type">Solution</span> &#123;
            </div>
            <div style={{ paddingLeft: "16px" }}>
              <span className="code-keyword">public static</span>{" "}
              <span className="code-type">boolean</span>{" "}
              <span className="code-func">evalClash</span>(
              <span className="code-type">int</span>[] nums,{" "}
              <span className="code-type">int</span> target) &#123;
            </div>
            <div style={{ paddingLeft: "32px" }}>
              <span className="code-comment">
                // Solve. Submit. Compete.
              </span>
            </div>
            <div style={{ paddingLeft: "32px" }}>
              <span className="code-keyword">var</span> seen ={" "}
              <span className="code-keyword">new</span>{" "}
              <span className="code-type">HashSet</span>&lt;
              <span className="code-type">Integer</span>&gt;();
            </div>
            <div style={{ paddingLeft: "32px" }}>
              <span className="code-keyword">for</span> (
              <span className="code-type">int</span> n : nums) &#123;
            </div>
            <div style={{ paddingLeft: "48px" }}>
              <span className="code-keyword">if</span> (seen.contains(target -
              n)) <span className="code-keyword">return true</span>;
            </div>
            <div style={{ paddingLeft: "48px" }}>seen.add(n);</div>
            <div style={{ paddingLeft: "32px" }}>&#125;</div>
            <div style={{ paddingLeft: "32px" }}>
              <span className="code-keyword">return false</span>;
            </div>
            <div style={{ paddingLeft: "16px" }}>&#125;</div>
            <div>&#125;</div>

            <div className="preview-status">
              <span
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <CheckCircle2 size={14} />
                Java Runtime: All 15 Test Cases Passed
              </span>
              <span style={{ color: "#94a3b8", fontWeight: "normal" }}>
                0.02s
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN ACTIONS */}
      <section>
        <div className="home-section-heading">
          <div>
            <h2>Get Started with CodeClash</h2>
            <p>
              Launch custom Java challenges or step into an active battle room.
            </p>
          </div>
        </div>

        <div className="home-cards">
          {cards.map(({ icon: Icon, title, text, action, to, badge }) => (
            <article className="home-card" key={title}>
              <span className="home-card-badge">{badge}</span>

              <div className={`home-card-icon${title === "Daily Global Challenge" ? " home-card-icon-daily" : ""}`}>
                <Icon size={22} />
              </div>

              <h3>{title}</h3>
              <p>{text}</p>

              {to.startsWith("mailto:") ? (
                <a href={to} className="home-card-link">
                  {action}
                  <ArrowRight size={14} />
                </a>
              ) : (
                <Link to={to} className="home-card-link">
                  {action}
                  <ArrowRight size={14} />
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
