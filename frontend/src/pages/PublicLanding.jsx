import desktopPackage from "../../../desktop/package.json";
import brandIcon from "../../../desktop/assets/codeclash.ico";
import "./PublicLanding.css";

const RELEASES_URL = "https://github.com/codeclash-tech/CCP/releases/latest";

const features = [
  {
    number: "01",
    title: "Daily coding challenges",
    description:
      "Build a consistent practice habit with a fresh challenge and daily standings.",
  },
  {
    number: "02",
    title: "Live Battle Rooms",
    description:
      "Host focused coding battles, invite participants, and follow results together.",
  },
  {
    number: "03",
    title: "Made for the desktop",
    description:
      "A dedicated Windows app with an integrated coding workspace and Java runtime.",
  },
];

export default function PublicLanding() {
  return (
    <main className="public-landing">
      <nav className="public-landing-nav" aria-label="Main navigation">
        <a className="public-landing-brand" href="#home" aria-label="CodeClash home">
          <img src={brandIcon} alt="" />
          <span>CodeClash</span>
        </a>
        <a className="public-landing-nav-download" href={RELEASES_URL}>
          Download app
        </a>
      </nav>

      <section className="public-landing-hero" id="home">
        <div className="public-landing-hero-copy">
          <p className="public-landing-eyebrow">A focused desktop experience</p>
          <h1>Make every line count.</h1>
          <p className="public-landing-description">
            CodeClash brings daily coding practice and head-to-head coding
            battles together in one dedicated desktop app.
          </p>
          <div className="public-landing-actions">
            <a className="public-landing-download" href={RELEASES_URL}>
              Download for Windows
              <span aria-hidden="true">↗</span>
            </a>
            <span className="public-landing-version">
              Latest app · v{desktopPackage.version}
            </span>
          </div>
        </div>
        <div className="public-landing-emblem" aria-hidden="true">
          <div className="public-landing-emblem-orbit public-landing-emblem-orbit-one" />
          <div className="public-landing-emblem-orbit public-landing-emblem-orbit-two" />
          <div className="public-landing-emblem-core">
            <img src={brandIcon} alt="" />
          </div>
          <span className="public-landing-emblem-label">THINK · SOLVE · CLASH</span>
        </div>
      </section>

      <section className="public-landing-features" aria-label="CodeClash features">
        {features.map((feature) => (
          <article className="public-landing-feature" key={feature.number}>
            <span>{feature.number}</span>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>

      <footer className="public-landing-footer">
        <span>CodeClash <span aria-hidden="true">·</span> by AMUX</span>
        <a href="mailto:helloamux@gmail.com">Support</a>
        <span>Windows desktop app · v{desktopPackage.version}</span>
      </footer>
    </main>
  );
}
