import { Brain, ShieldCheck, Download } from "lucide-react";
import { DOWNLOAD_URL, isDesktopRuntime } from "../../utils/desktopDownload";

export default function Footer() {
  const isDesktop = isDesktopRuntime();

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
        <Brain size={14} />
        <span>
          CogniClash · an AMUX product &copy; {new Date().getFullYear()}
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
          <a
            className="footer-download-link"
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 7,
              border: "1px solid rgba(13, 122, 235, 0.45)",
              background: "var(--accent-blue-soft)",
              color: "var(--accent-blue-bright)",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              transition: "all 0.15s ease",
            }}
          >
            <Download size={13} />
            Download desktop app
          </a>
        )}
        <span>v1.0.0</span>
      </div>
    </footer>
  );
}
