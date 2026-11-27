import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowDown,
  ChevronRight,
  Swords,
  Menu,
  X,
  Download,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";
import desktopPackage from "../../../desktop/package.json";
import brandIcon from "../../../desktop/assets/codeclash.ico";
import { DOWNLOAD_URL, isDesktopRuntime } from "../utils/desktopDownload";
import "./PublicLanding.css";

const MOBILE_DEVICE_PATTERN =
  /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;

function isDesktopDevice() {
  const { userAgent, userAgentData, platform, maxTouchPoints } = window.navigator;
  const isIPadOS = platform === "MacIntel" && maxTouchPoints > 1;

  return (
    userAgentData?.mobile !== true &&
    !MOBILE_DEVICE_PATTERN.test(userAgent) &&
    !isIPadOS
  );
}

const pillars = [
  {
    number: "01",
    title: "Practice with purpose",
    description:
      "Build a daily problem-solving habit with a fresh challenge and a clear place to track your progress.",
  },
  {
    number: "02",
    title: "Compete in real time",
    description:
      "Join a Battle Room, solve the challenge under time, and follow the standings with your participants.",
  },
  {
    number: "03",
    title: "Bring your own challenge",
    description:
      "Create a room, set the questions and schedule, then invite your group to take part.",
  },
];

const audiences = [
  ["For developers", "Make practice a focused part of your routine."],
  ["For educators", "Give a class a shared space to solve and compete."],
  ["For teams", "Run structured coding sessions with your own challenges."],
];

const steps = [
  ["Get the app", "Download CogniClash for Windows and sign in."],
  ["Choose a challenge", "Try the daily challenge or join a Battle Room."],
  ["Solve and compare", "Submit your work and see the standings when judging finishes."],
];

export default function PublicLanding() {
  const [downloadNotice, setDownloadNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  function handleDownloadClick(event) {
    if (!isDesktopDevice()) {
      event.preventDefault();
      setDownloadNotice(
        "CogniClash is available for desktop devices only. Open this page on a desktop computer to download the Windows app.",
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
        <a className="public-landing-brand" href="#home" aria-label="CogniClash home" onClick={closeMenu}>
          <img src={brandIcon} alt="" />
          <span>CogniClash</span>
        </a>
        <div className="public-landing-nav-links">
          <a href="#experience" onClick={closeMenu}>Experience</a>
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <Link to="/about" onClick={closeMenu}>About</Link>
          <Link to="/terms" onClick={closeMenu}>Terms</Link>
          <Link
            className="public-landing-nav-download"
            to="/install-desktop"
            onClick={closeMenu}
          >
            <Download size={13} aria-hidden="true" />
            Get the app
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
          <a href="#experience" onClick={closeMenu}>Experience</a>
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <Link to="/about" onClick={closeMenu}>About</Link>
          <Link to="/terms" onClick={closeMenu}>Terms</Link>
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

      <section className="public-landing-hero" aria-labelledby="public-landing-title">
        <div className="public-landing-hero-copy">
          <p className="public-landing-eyebrow">The desktop home for coding battles</p>
          <h1 id="public-landing-title">
            Think sharp.
            <br />
            <span>Code under pressure.</span>
          </h1>
          <p className="public-landing-description">
            Turn coding practice into a challenge worth showing up for. Take on
            a daily problem, compete in a Battle Room, or host one for your
            community — the same focused experience in the CogniClash desktop
            app and on the web.
          </p>
          <div className="public-landing-actions">
            <a
              className="public-landing-download"
              href={DOWNLOAD_URL}
              onClick={handleDownloadClick}
            >
              Download for Windows <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <a className="public-landing-secondary-link" href="#experience">
              Explore CogniClash <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
          <p className="public-landing-version">
            Windows desktop app <span aria-hidden="true">|</span> Version{" "}
            {desktopPackage.version}
          </p>
        </div>

        <div className="public-landing-preview" aria-label="CogniClash app preview">
          <div className="public-landing-preview-topbar">
            <div className="public-landing-preview-brand">
              <img src={brandIcon} alt="" />
              <span>CogniClash</span>
            </div>
            <span className="public-landing-preview-status">
              <i /> READY TO CLASH
            </span>
          </div>
          <div className="public-landing-preview-body">
            <div className="public-landing-preview-kicker">TODAY&apos;S MOVE</div>
            <h2>One problem.<br />A sharper mind.</h2>
            <p>Make your next coding session count.</p>
            <div className="public-landing-preview-challenge">
              <span className="public-landing-preview-icon">&lt;/&gt;</span>
              <span>
                <strong>Daily Challenge</strong>
                <small>A fresh challenge awaits</small>
              </span>
              <span className="public-landing-preview-arrow"><ArrowUpRight size={16} aria-hidden="true" /></span>
            </div>
            <div className="public-landing-preview-challenge secondary">
              <span className="public-landing-preview-icon crossed"><Swords size={16} aria-hidden="true" /></span>
              <span>
                <strong>Battle Rooms</strong>
                <small>Join in or host your own</small>
              </span>
              <span className="public-landing-preview-arrow"><ArrowUpRight size={16} aria-hidden="true" /></span>
            </div>
            <div className="public-landing-preview-code" aria-hidden="true">
              <span>public class</span> Solution {"{"}
              <br />
              &nbsp;&nbsp;<span>void</span> makeYourMove() {"{"}
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;solve(); <b>_</b>
              <br />
              &nbsp;&nbsp;{"}"}
              <br />
              {"}"}
            </div>
          </div>
          <div className="public-landing-preview-footer">
            <span><i /> Desktop workspace</span>
            <span>JAVA</span>
          </div>
        </div>
      </section>

      <section className="public-landing-positioning" aria-label="Product promise">
        <span>LESS PASSIVE PRACTICE</span>
        <b aria-hidden="true">/</b>
        <span>MORE REAL CHALLENGES</span>
        <b aria-hidden="true">/</b>
        <span>ONE PLACE TO CLASH</span>
      </section>

      <section className="public-landing-section" id="experience">
        <div className="public-landing-section-heading">
          <p className="public-landing-eyebrow">Built around the moment you solve</p>
          <h2>Practice alone.<br /><span>Make it a competition.</span></h2>
          <p>
            CogniClash gives individual practice and group challenges a shared,
            focused experience — identical in the desktop app and on the web.
          </p>
        </div>
        <div className="public-landing-pillars">
          {pillars.map((pillar) => (
            <article className="public-landing-pillar" key={pillar.number}>
              <span className="public-landing-pillar-number">{pillar.number}</span>
              <div className="public-landing-pillar-mark" aria-hidden="true">
                {pillar.number === "01" ? "</>" : pillar.number === "02" ? <Swords size={18} aria-hidden="true" /> : "+"}
              </div>
              <h3>{pillar.title}</h3>
              <p>{pillar.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-landing-how" id="how-it-works">
        <div className="public-landing-how-heading">
          <p className="public-landing-eyebrow">Your next challenge is three steps away</p>
          <h2>Open. Solve. <span>Clash.</span></h2>
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

      <section className="public-landing-audience" aria-labelledby="public-landing-audience-title">
        <div>
          <p className="public-landing-eyebrow">Made for people who build skills together</p>
          <h2 id="public-landing-audience-title">
            Your group.<br /><span>Your next coding battle.</span>
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

      <section className="public-landing-desktop-note" id="strict-evaluations">
        <div className="public-landing-desktop-note-card">
          <div className="public-landing-desktop-note-icon" aria-hidden="true">
            <MonitorSmartphone size={22} />
          </div>
          <div>
            <p className="public-landing-eyebrow">Strict evaluations</p>
            <h2>Coding &amp; strict tests run in the desktop app</h2>
            <p>
              Practice challenges are open to everyone on the web. Strict
              evaluations and graded coding tests open in a locked-down,
              distraction-free environment — so they run in the CogniClash
              desktop app only. When you start one from the web, we take you
              straight to the install page.
            </p>
            <div className="public-landing-desktop-note-actions">
              <Link className="public-landing-download" to="/install-desktop">
                Install CogniClash <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
              <span className="public-landing-desktop-note-hint">
                <ShieldCheck size={14} aria-hidden="true" />
                Secure · Proctored · Free for students
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="public-landing-final-cta" id="download">
        <div className="public-landing-final-glow" aria-hidden="true" />
        <p className="public-landing-eyebrow">Your next move starts here</p>
        <h2>Ready to make it<br /><span>a CogniClash?</span></h2>
        <p>
          Download the Windows app and bring a little more purpose to your next
          coding session.
        </p>
        <a
          className="public-landing-download"
          href={DOWNLOAD_URL}
          onClick={handleDownloadClick}
        >
          Get CogniClash for Windows <ArrowUpRight size={15} aria-hidden="true" />
        </a>
        <span className="public-landing-final-version">
          Version {desktopPackage.version} <span aria-hidden="true">|</span> Windows desktop app
        </span>
      </section>

      <footer className="public-landing-footer">
        <div className="public-landing-footer-top">
          <a className="public-landing-footer-brand" href="#home">
            <img src={brandIcon} alt="" />
            <span>CogniClash <small>by AMUX</small></span>
          </a>
          <nav className="public-landing-footer-links" aria-label="Footer navigation">
            <a href="#experience">Experience</a>
            <a href="#how-it-works">How it works</a>
            <Link to="/about">About</Link>
            <Link to="/terms">Terms</Link>
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
        </div>
        <div className="public-landing-footer-bottom">
          <span>Practice with purpose. Compete with confidence.</span>
          <span>&copy; {new Date().getFullYear()} AMUX · All rights reserved</span>
        </div>
      </footer>
    </main>
  );
}
