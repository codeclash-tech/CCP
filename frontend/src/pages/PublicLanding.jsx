import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowDown,
  ChevronRight,
  Menu,
  X,
  Download,
  MonitorSmartphone,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import desktopPackage from "../../../desktop/package.json";
import brandIcon from "../../../desktop/assets/codeclash.ico";
import { DOWNLOAD_URL, isMobileDevice } from "../utils/desktopDownload";
import "./PublicLanding.css";

const pillars = [
  {
    number: "01",
    title: "Measure with clarity",
    description:
      "Set clear expectations and give every participant a focused, consistent evaluation experience.",
  },
  {
    number: "02",
    title: "Understand progress",
    description:
      "Bring progress and outcomes together so individuals and teams can make informed next steps.",
  },
  {
    number: "03",
    title: "Fit your process",
    description:
      "Organize evaluation experiences around your group, schedule, and goals.",
  },
];

const audiences = [
  ["For organizations", "Create a consistent way to understand capability."],
  ["For educators", "Support fair, structured evaluation for every learner."],
  ["For teams", "Align people around clear expectations and outcomes."],
];

const steps = [
  ["Set the context", "Choose an evaluation experience that fits your goals."],
  ["Take part", "Give each participant a clear, focused experience."],
  ["Review outcomes", "Use results to guide meaningful next steps."],
];

export default function PublicLanding() {
  const [downloadNotice, setDownloadNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  function handleDownloadClick(event) {
    if (isMobileDevice()) {
      event.preventDefault();
      setDownloadNotice(
        "The CogniClash desktop app is available on Windows. Open this page on a desktop computer to download it.",
      );
      return;
    }

    setDownloadNotice("");
    setMenuOpen(false);
  }

  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="public-landing" id="home">
      <nav className="public-landing-nav" aria-label="Main navigation">
        <a
          className="public-landing-brand"
          href="#home"
          aria-label="CogniClash home"
          onClick={closeMenu}
        >
          <img src={brandIcon} alt="" />
          <span>CogniClash</span>
        </a>
        <div className="public-landing-nav-links">
          <a href="#experience" onClick={closeMenu}>
            Platform
          </a>
          <a href="#how-it-works" onClick={closeMenu}>
            How it works
          </a>
          <Link to="/about" onClick={closeMenu}>
            About
          </Link>
          <Link to="/terms" onClick={closeMenu}>
            Terms
          </Link>
          <Link to="/login" onClick={closeMenu}>
            Sign in
          </Link>
          <Link
            className="public-landing-nav-download"
            to="/register"
            onClick={closeMenu}
          >
            Create account
          </Link>
        </div>
        <button
          type="button"
          className="public-landing-menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      {menuOpen && (
        <div className="public-landing-mobile-menu" role="menu">
          <a href="#experience" onClick={closeMenu}>
            Platform
          </a>
          <a href="#how-it-works" onClick={closeMenu}>
            How it works
          </a>
          <Link to="/about" onClick={closeMenu}>
            About
          </Link>
          <Link to="/terms" onClick={closeMenu}>
            Terms
          </Link>
          <Link to="/login" onClick={closeMenu}>
            Sign in
          </Link>
          <Link to="/register" onClick={closeMenu}>
            Create account
          </Link>
          <Link to="/install-desktop" onClick={closeMenu}>
            <Download size={14} aria-hidden="true" />
            Install desktop app
          </Link>
        </div>
      )}
      {downloadNotice && (
        <p className="public-landing-download-notice" role="status">
          {downloadNotice}
        </p>
      )}

      <section
        className="public-landing-hero"
        aria-labelledby="public-landing-title"
      >
        <div className="public-landing-hero-copy">
          <p className="public-landing-eyebrow">
            A clearer standard for evaluation
          </p>
          <h1 id="public-landing-title">
            Evaluate with clarity.
            <br />
            <span>Understand potential.</span>
          </h1>
          <p className="public-landing-description">
            CogniClash brings structured evaluations into one calm, consistent
            workspace. Set clear expectations, give people a comfortable way
            to take part, and make better-informed decisions with results you
            can understand.
          </p>
          <div className="public-landing-actions">
            <Link
              className="public-landing-download"
              to="/register"
              onClick={closeMenu}
            >
              Get started — it&apos;s free <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <Link className="public-landing-secondary-link" to="/login">
              Sign in
            </Link>
            <a className="public-landing-secondary-link" href="#experience">
              Discover the platform <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
          <p className="public-landing-version">
            Web platform <span aria-hidden="true">|</span> Windows app v{" "}
            {desktopPackage.version}
          </p>
        </div>

        <div
          className="public-landing-preview"
          aria-label="CogniClash app preview"
        >
          <div className="public-landing-preview-topbar">
            <div className="public-landing-preview-brand">
              <img src={brandIcon} alt="" />
              <span>CogniClash</span>
            </div>
            <span className="public-landing-preview-status">
              <i /> EVALUATION OVERVIEW
            </span>
          </div>
          <div className="public-landing-preview-body">
            <div className="public-landing-preview-kicker">
              EVALUATION SNAPSHOT
            </div>
            <h2>
              Clear expectations.
              <br />Meaningful outcomes.
            </h2>
            <p>A considered experience for every participant.</p>
            <div className="public-landing-preview-challenge">
              <span className="public-landing-preview-icon">
                <CheckCircle2 size={17} aria-hidden="true" />
              </span>
              <span>
                <strong>Evaluation progress</strong>
                <small>Clear status at every step</small>
              </span>
              <span className="public-landing-preview-arrow">
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="public-landing-preview-challenge secondary">
              <span className="public-landing-preview-icon crossed">
                <ShieldCheck size={16} aria-hidden="true" />
              </span>
              <span>
                <strong>Consistent process</strong>
                <small>One workspace for your group</small>
              </span>
              <span className="public-landing-preview-arrow">
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </div>
            <div className="public-landing-preview-summary">
              <span>PARTICIPANT EXPERIENCE</span>
              <strong>Structured · Fair · Actionable</strong>
            </div>
          </div>
          <div className="public-landing-preview-footer">
            <span>
              <i /> Evaluation workspace
            </span>
            <span>READY</span>
          </div>
        </div>
      </section>

      <section
        className="public-landing-positioning"
        aria-label="Product promise"
      >
        <span>CONSISTENT EVALUATIONS</span>
        <b aria-hidden="true">/</b>
        <span>CLEAR EXPECTATIONS</span>
        <b aria-hidden="true">/</b>
        <span>CONFIDENT DECISIONS</span>
      </section>

      <section className="public-landing-section" id="experience">
        <div className="public-landing-section-heading">
          <p className="public-landing-eyebrow">
            Designed for fair, thoughtful evaluation
          </p>
          <h2>
            One considered experience.
            <br />
            <span>From start to outcome.</span>
          </h2>
          <p>
            CogniClash helps organizations deliver a clear, consistent process
            for individuals and groups, with a familiar experience across web
            and desktop.
          </p>
        </div>
        <div className="public-landing-pillars">
          {pillars.map((pillar) => (
            <article className="public-landing-pillar" key={pillar.number}>
              <span className="public-landing-pillar-number">
                {pillar.number}
              </span>
              <div className="public-landing-pillar-mark" aria-hidden="true">
                {pillar.number === "01" ? (
                  <CheckCircle2 size={18} aria-hidden="true" />
                ) : pillar.number === "02" ? (
                  <ShieldCheck size={18} aria-hidden="true" />
                ) : (
                  "+"
                )}
              </div>
              <h3>{pillar.title}</h3>
              <p>{pillar.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-landing-how" id="how-it-works">
        <div className="public-landing-how-heading">
          <p className="public-landing-eyebrow">
            A simple path from setup to insight
          </p>
          <h2>
            Set. Evaluate. <span>Understand.</span>
          </h2>
        </div>
        <div className="public-landing-steps">
          {steps.map(([title, description], index) => (
            <article className="public-landing-step" key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="public-landing-audience"
        aria-labelledby="public-landing-audience-title"
      >
        <div>
          <p className="public-landing-eyebrow">
            Made for people who develop talent together
          </p>
          <h2 id="public-landing-audience-title">
            Your people.
            <br />
            <span>Your next step, made clearer.</span>
          </h2>
        </div>
        <div className="public-landing-audience-list">
          {audiences.map(([title, description]) => (
            <article key={title}>
              <ChevronRight size={16} aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="public-landing-desktop-note"
        id="supervised-evaluations"
      >
        <div className="public-landing-desktop-note-card">
          <div className="public-landing-desktop-note-icon" aria-hidden="true">
            <MonitorSmartphone size={22} />
          </div>
          <div>
            <p className="public-landing-eyebrow">
              A secure option for supervised evaluations
            </p>
            <h2>Some evaluations are best completed on desktop</h2>
            <p>
              Most of the platform is available right here on the web. When an
              evaluation requires a supervised environment, CogniClash guides
              participants to its Windows desktop app, using the same account
              and familiar experience.
            </p>
            <div className="public-landing-desktop-note-actions">
              <Link className="public-landing-download" to="/install-desktop">
                Learn about the desktop app{" "}
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
              <span className="public-landing-desktop-note-hint">
                <ShieldCheck size={14} aria-hidden="true" />
                Secure · Supervised · Free to get started
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="public-landing-final-cta" id="download">
        <div className="public-landing-final-glow" aria-hidden="true" />
        <p className="public-landing-eyebrow">Start with a clearer process</p>
        <h2>
          Ready to make
          <br />
          <span>better decisions?</span>
        </h2>
        <p>
          Bring your next evaluation into one focused workspace. Create your
          account and get started in minutes.
        </p>
        <div className="public-landing-actions public-landing-final-actions">
          <Link
            className="public-landing-download"
            to="/register"
          >
            Create free account <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <Link className="public-landing-secondary-link" to="/login">
            Sign in <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <span className="public-landing-final-version">
          Web app free <span aria-hidden="true">|</span> Windows app v{" "}
          {desktopPackage.version}
        </span>
      </section>

      <footer className="public-landing-footer">
        <div className="public-landing-footer-top">
          <a className="public-landing-footer-brand" href="#home">
            <img src={brandIcon} alt="" />
            <span>
              CogniClash <small>by AMUX</small>
            </span>
          </a>
          <nav
            className="public-landing-footer-links"
            aria-label="Footer navigation"
          >
            <a href="#experience">Experience</a>
            <a href="#how-it-works">How it works</a>
            <Link to="/about">About</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/login">Sign in</Link>
            <a href="mailto:helloamux@gmail.com">Contact support</a>
          </nav>
          <a
            className="public-landing-footer-download"
            href={DOWNLOAD_URL}
            onClick={handleDownloadClick}
          >
            <Download size={14} aria-hidden="true" />
            Download for Windows
            <small>v{desktopPackage.version}</small>
          </a>
          {downloadNotice && (
            <p className="public-landing-footer-download-notice" role="status">
              {downloadNotice}
            </p>
          )}
        </div>
        <div className="public-landing-footer-bottom">
          <span>          Evaluate with clarity. Move forward with confidence.</span>
          <span>
            &copy; {new Date().getFullYear()} AMUX · All rights reserved
          </span>
        </div>
      </footer>
    </main>
  );
}
