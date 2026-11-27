import { useState } from "react";
import { ShieldCheck, Download } from "lucide-react";
import {
  DOWNLOAD_URL,
  isDesktopRuntime,
  isMobileDevice,
} from "../../utils/desktopDownload";

export default function Footer() {
  const isDesktop = isDesktopRuntime();
  const [downloadNotice, setDownloadNotice] = useState("");

  const handleDownload = () => {
    if (isMobileDevice()) {
      setDownloadNotice(
        "The CogniClash desktop app is available on Windows. Open this page on a desktop computer to download it.",
      );
      return;
    }

    window.open(DOWNLOAD_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <footer
      className="app-footer"
      style={{
        background: "var(--bg-elevated)",
        borderTop: "1px solid var(--border-color)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px 16px",
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        color: "var(--text-muted)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>
          CogniClash · Evaluation platform by AMUX &copy;{" "}
          {new Date().getFullYear()}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <ShieldCheck size={13} style={{ color: "var(--color-success)" }} />
          Built with integrity
        </span>
        {!isDesktop && (
          <button
            type="button"
            className="footer-download-link"
            onClick={handleDownload}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 7,
              border: "1px solid rgba(13, 122, 235, 0.45)",
              background: "var(--accent-blue-soft)",
              color: "var(--accent-blue-bright)",
              font: "inherit",
              fontSize: 12,
              fontWeight: 600,
              transition: "all 0.15s ease",
              cursor: "pointer",
            }}
          >
            <Download size={13} />
            Download desktop app
          </button>
        )}
        <span>v1.0.0</span>
      </div>
      {downloadNotice && (
        <p className="app-footer-download-notice" role="status">
          {downloadNotice}
        </p>
      )}
    </footer>
  );
}
