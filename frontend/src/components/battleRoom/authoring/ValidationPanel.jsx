import { useState } from "react";
import { ShieldCheck, ShieldAlert, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { validateQuestion } from "../../../services/battleRoomService";

const labelStyle = {
  color: "var(--text-secondary)",
  fontSize: 11,
  fontFamily: "var(--font-ui)",
  display: "block",
  marginBottom: 6,
  fontWeight: 500,
};

/**
 * Validation panel — run detailed pre-publish validation on the current
 * question and show every error. A challenge cannot be published until all
 * checks pass.
 */
export default function ValidationPanel({ question }) {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleValidate = async () => {
    setError("");
    setValidating(true);
    setResult(null);
    try {
      const data = await validateQuestion(question);
      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to validate question.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 5 }}>
          <ShieldCheck size={12} />
          Pre-Publish Validation
        </label>
        <p style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-ui)", margin: "0 0 8px" }}>
          The backend verifies every requirement (title, description, constraints,
          difficulty, signature, starter code, wrapper, examples, test cases,
          reference-solution pass, no duplicates). Fix any errors
          below before creating the room.
        </p>
        <button
          onClick={handleValidate}
          disabled={validating}
          className="btn-primary"
          style={{ padding: "8px 20px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
        >
          {validating ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <ShieldCheck size={14} />}
          {validating ? "Validating..." : "Run Validation"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "8px 12px", background: "rgba(218,54,51,0.08)", border: "1px solid rgba(218,54,51,0.3)", borderRadius: 6, color: "var(--color-danger)", fontSize: 12, fontFamily: "var(--font-ui)", display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldAlert size={13} />
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            borderRadius: 8,
            border: `1px solid ${result.valid ? "rgba(46,160,67,0.4)" : "rgba(218,54,51,0.4)"}`,
            background: result.valid ? "rgba(46,160,67,0.05)" : "rgba(218,54,51,0.05)",
            padding: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontFamily: "var(--font-ui)", fontWeight: 600, color: result.valid ? "var(--color-success)" : "var(--color-danger)", marginBottom: 8 }}>
            {result.valid ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            {result.valid ? "Ready to publish" : `${(result.errors || []).length} issue(s) found`}
          </div>
          {result.message && (
            <div style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-ui)", marginBottom: 8 }}>
              {result.message}
            </div>
          )}
          {(result.errors || []).length > 0 && (
            <div style={{ display: "grid", gap: 4 }}>
              {(result.errors || []).map((err, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, fontFamily: "var(--font-ui)", color: "var(--color-danger)" }}>
                  <XCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!result && !error && (
        <div style={{ color: "var(--text-faint)", fontSize: 11, fontFamily: "var(--font-ui)", border: "1px dashed var(--border-strong)", borderRadius: 6, padding: 12 }}>
          No validation has been run yet. Click "Run Validation" to check this
          question.
        </div>
      )}
    </div>
  );
}
