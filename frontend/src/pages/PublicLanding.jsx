import desktopPackage from "../../../desktop/package.json";
import brandIcon from "../../../desktop/assets/codeclash.ico";
import "./PublicLanding.css";

const RELEASES_URL = "https://github.com/codeclash-tech/CCP/releases/latest";

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
  ["Get the app", "Download CodeClash for Windows and sign in."],
  ["Choose a challenge", "Try the daily challenge or join a Battle Room."],
  ["Solve and compare", "Submit your work and see the standings when judging finishes."],
];

export default function PublicLanding() {
  return (
    <main className="public-landing" id="home">
      <nav className="public-landing-nav" aria-label="Main navigation">
        <a className="public-landing-brand" href="#home" aria-label="CodeClash home">
          <img src={brandIcon} alt="" />
          <span>CodeClash</span>
        </a>
        <div className="public-landing-nav-links">
          <a href="#experience">Experience</a>
          <a href="#how-it-works">How it works</a>
          <a className="public-landing-nav-download" href={RELEASES_URL}>
            Download app
          </a>
        </div>
      </nav>

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
            community — all in the CodeClash Windows app.
          </p>
          <div className="public-landing-actions">
            <a className="public-landing-download" href={RELEASES_URL}>
              Download for Windows <span aria-hidden="true">↗</span>
            </a>
            <a className="public-landing-secondary-link" href="#experience">
              Explore CodeClash <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="public-landing-version">
            Windows desktop app <span aria-hidden="true">·</span> Version{" "}
            {desktopPackage.version}
          </p>
        </div>

        <div className="public-landing-preview" aria-label="CodeClash app preview">
          <div className="public-landing-preview-topbar">
            <div className="public-landing-preview-brand">
              <img src={brandIcon} alt="" />
              <span>CodeClash</span>
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
              <span className="public-landing-preview-arrow">↗</span>
            </div>
            <div className="public-landing-preview-challenge secondary">
              <span className="public-landing-preview-icon crossed">⚔</span>
              <span>
                <strong>Battle Rooms</strong>
                <small>Join in or host your own</small>
              </span>
              <span className="public-landing-preview-arrow">↗</span>
            </div>
            <div className="public-landing-preview-code" aria-hidden="true">
              <span>public class</span> Solution {"{"}
              <br />
              &nbsp;&nbsp;<span>void</span> makeYourMove() {"{"}
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;solve(); <b>▌</b>
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
            CodeClash gives individual practice and group challenges a shared,
            focused desktop experience.
          </p>
        </div>
        <div className="public-landing-pillars">
          {pillars.map((pillar) => (
            <article className="public-landing-pillar" key={pillar.number}>
              <span className="public-landing-pillar-number">{pillar.number}</span>
              <div className="public-landing-pillar-mark" aria-hidden="true">
                {pillar.number === "01" ? "</>" : pillar.number === "02" ? "⚔" : "+"}
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
              <span aria-hidden="true">↗</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="public-landing-final-cta" id="download">
        <div className="public-landing-final-glow" aria-hidden="true" />
        <p className="public-landing-eyebrow">Your next move starts here</p>
        <h2>Ready to make it<br /><span>a CodeClash?</span></h2>
        <p>
          Download the Windows app and bring a little more purpose to your next
          coding session.
        </p>
        <a className="public-landing-download" href={RELEASES_URL}>
          Get CodeClash for Windows <span aria-hidden="true">↗</span>
        </a>
        <span className="public-landing-final-version">
          Version {desktopPackage.version} <span aria-hidden="true">·</span> Windows desktop app
        </span>
      </section>

      <footer className="public-landing-footer">
        <a className="public-landing-footer-brand" href="#home">
          <img src={brandIcon} alt="" />
          <span>CodeClash <small>by AMUX</small></span>
        </a>
        <span>Practice with purpose. Compete with confidence.</span>
        <a href="mailto:helloamux@gmail.com">Contact support</a>
      </footer>
    </main>
  );
}
