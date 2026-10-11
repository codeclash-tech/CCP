import { Code2, ShieldCheck } from "lucide-react";

export default function Footer() {
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
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        color: "var(--text-muted)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
<Code2 size={14} />
        CodeClash &copy; {new Date().getFullYear()}
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <ShieldCheck size={13} style={{ color: "var(--color-success)" }} />
          Built with integrity
        </span>
        <span>v1.0.0</span>
      </div>
    </footer>
  );
}
