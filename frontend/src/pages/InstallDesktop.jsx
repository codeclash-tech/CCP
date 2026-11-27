import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Monitor,
  ShieldCheck,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import desktopPackage from "../../../desktop/package.json";
import { DOWNLOAD_URL, isMobileDevice } from "../utils/desktopDownload";
import "./InstallDesktop.css";

/**
 * Install-desktop page for supervised evaluations that require the desktop app.
 */
export default function InstallDesktop() {
  const [searchParams] = useSearchParams();
  const [downloadNotice, setDownloadNotice] = useState("");
  const fromStrict = searchParams.get("from") === "strict-assessment";

  const handleDownload = (event) => {
    if (isMobileDevice()) {
      event.preventDefault();
      setDownloadNotice(
        "The CogniClash desktop app is available on Windows. Open this page on a desktop computer to download it.",
      );
    }
  };

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
          {fromStrict
            ? "This supervised evaluation runs in the"
            : "Supervised evaluations run in the"}
          <br />
          <span>CogniClash desktop app</span>
        </h1>
        <p className="install-desktop-copy">
          This evaluation uses a secure desktop environment to support a
          consistent experience for everyone. Install the free CogniClash app
          on Windows, then sign in with your existing account.
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
          onClick={handleDownload}
          target="_blank"
          rel="noreferrer"
        >
          Download CogniClash <ArrowUpRight size={15} />
        </a>
        {downloadNotice && (
          <p className="install-desktop-copy" role="status">
            {downloadNotice}
          </p>
        )}
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
            <CheckCircle2 size={14} /> Return to your evaluation to continue.
          </li>
        </ol>
      </div>
    </div>
  );
}
