import { Link, useSearchParams } from "react-router-dom";
import {
  Monitor,
  ShieldCheck,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import desktopPackage from "../../../desktop/package.json";
import { DOWNLOAD_URL } from "../utils/desktopDownload";
import "./InstallDesktop.css";

/**
 * Install-desktop page. Shown on the web when a visitor tries to attend a
 * strict / coding evaluation — those run only inside the desktop app.
 */
export default function InstallDesktop() {
  const [searchParams] = useSearchParams();
  const fromStrict = searchParams.get("from") === "strict-assessment";
  return (
    <div className="install-desktop-page">
      <div className="install-desktop-card">
        <div className="install-desktop-icon" aria-hidden="true">
          <Monitor size={26} />
        </div>
        <p className="install-desktop-eyebrow">
          {fromStrict ? "Strict evaluation" : "Desktop required"}
        </p>
        <h1>
          {fromStrict ? "This strict evaluation runs in the" : "Strict evaluations run in the"}
          <br />
          <span>CogniClash desktop app</span>
        </h1>
        <p className="install-desktop-copy">
          Coding and strict tests use a locked-down, proctored environment that
          keeps the evaluation fair for everyone, so they open in the desktop
          app only. Install it once — it is free, and the interface inside the
          app is identical to this web experience.
        </p>
        <div className="install-desktop-meta">
          <span>
            <ShieldCheck size={14} /> Secure &amp; proctored
          </span>
          <span>v{desktopPackage.version} · Windows</span>
        </div>
        <a
          className="install-desktop-download"
          href={DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
        >
          Download CogniClash <ArrowUpRight size={15} />
        </a>
        <Link to="/" className="btn-secondary install-desktop-back">
          Back to web experience
        </Link>
        <ol className="install-desktop-steps">
          <li>
            <CheckCircle2 size={14} /> Download and run the installer.
          </li>
          <li>
            <CheckCircle2 size={14} /> Sign in with your existing CogniClash
            account.
          </li>
          <li>
            <CheckCircle2 size={14} /> Open the challenge — your strict
            evaluation continues there.
          </li>
        </ol>
      </div>
    </div>
  );
}
