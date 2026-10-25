import { useState } from "react";
import { Split, PlusCircle, X, ListOrdered } from "lucide-react";
import { TEST_CASE_SEPARATOR } from "../../../utils/constants";

const inputStyle = {
  width: "100%",
  background: "var(--bg-main)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontSize: 12,
  fontFamily: "var(--font-code)",
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s",
};

const labelStyle = {
  color: "var(--text-secondary)",
  fontSize: 11,
  fontFamily: "var(--font-ui)",
  display: "block",
  marginBottom: 6,
  fontWeight: 500,
};

/**
 * Split a raw bulk-editor string into test-case blocks delimited by a line
 * containing only the separator (e.g. "---"). Mirrors the backend splitter.
 */
function splitBulkInput(raw) {
  if (!raw || typeof raw !== "string") return [];
  const blocks = raw
    .split(/\r?\n---\s*\r?\n|\r?\n---\r?\n?|^---\s*$/m)
    .map((b) => b.trim())
    .filter((b) => b !== "");
  return blocks;
}

/**
 * Bulk Test Case Editor with "Split Automatically".
 *
 * Admins paste multiple test cases separated by `---` lines. Clicking
 * "Split Automatically" parses them into individual cases which can be
 * edited / removed individually.
 */
export default function BulkTestCaseEditor({
  cases,
  onChange,
  onSplitPreview,
  placeholder = `[2,7,11,15]\n9\n${TEST_CASE_SEPARATOR}\n[3,2,4]\n6\n${TEST_CASE_SEPARATOR}\n[3,3]\n6`,
}) {
  const [bulkText, setBulkText] = useState("");
  const [preview, setPreview] = useState([]);

  const handleSplit = () => {
    const blocks = splitBulkInput(bulkText);
    setPreview(blocks);

    const newCases = blocks.map((input) => ({
      input,
      expectedOutput: "",
      description: "",
    }));
    if (onSplitPreview) {
      onSplitPreview({ blocks, cases: newCases });
    }
    if (onChange && newCases.length > 0) {
      onChange(newCases);
    }
  };

  const handleAutoFillOutputs = () => {
    // Convenience: after splitting, mark each case so the reference-solution
    // step can generate expected outputs for all of them at once.
    const withOutputs = (cases || []).map((tc) => ({
      ...tc,
      _needsOutput: true,
    }));
    onChange(withOutputs);
  };

  const updateCase = (index, field, value) => {
    const updated = [...(cases || [])];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addCase = () => {
    onChange([...(cases || []), { input: "", expectedOutput: "", description: "" }]);
  };

  const removeCase = (index) => {
    onChange((cases || []).filter((_, i) => i !== index));
  };

  return (
    <div style={{ border: "1px solid var(--border-color)", borderRadius: 10, padding: 16, background: "var(--bg-card)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-ui)", fontWeight: 600 }}>
          Test Cases
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-ui)", marginLeft: "auto" }}>
          {cases?.length || 0} case(s)
        </span>
      </div>

      {/* Bulk textarea */}
      <textarea
        value={bulkText}
        onChange={(e) => setBulkText(e.target.value)}
        placeholder={`Paste multiple inputs here, each separated by a line containing "${TEST_CASE_SEPARATOR}":\n\n${placeholder}`}
        rows={6}
        style={{
          ...inputStyle,
          resize: "vertical",
          lineHeight: 1.6,
          background: "var(--bg-elevated)",
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button
          onClick={handleSplit}
          className="btn-secondary"
          style={{ padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
        >
          <Split size={13} />
          Split Automatically
        </button>
        <button
          onClick={addCase}
          className="btn-secondary"
          style={{ padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
        >
          <PlusCircle size={13} />
          Add Manually
        </button>
        {(cases || []).length > 0 && (
          <button
            onClick={handleAutoFillOutputs}
            className="btn-secondary"
            style={{ padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
            title="Mark all current inputs as needing auto-generated expected outputs from the reference solution"
          >
            <ListOrdered size={13} />
            Generate Outputs for All
          </button>
        )}
      </div>

      {/* Split preview */}
      {preview.length > 0 && (
        <div style={{ marginTop: 10, padding: 8, background: "var(--bg-elevated)", borderRadius: 6, border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-ui)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <ListOrdered size={11} />
            Split preview: {preview.length} test case(s) detected
          </div>
          {preview.map((block, i) => (
            <div key={i} style={{ fontSize: 11, fontFamily: "var(--font-code)", color: "var(--text-secondary)", padding: "2px 0", whiteSpace: "pre-wrap" }}>
              <span style={{ color: "var(--accent-blue-bright)" }}>#{i + 1}</span> {block.slice(0, 80)}
              {block.length > 80 ? "…" : ""}
            </div>
          ))}
        </div>
      )}

      {/* Individual editable cases */}
      {(cases || []).map((tc, index) => (
        <div
          key={index}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 0.6fr 32px",
            gap: 6,
            marginTop: 8,
            alignItems: "center",
            borderTop: "1px solid var(--border-color)",
            paddingTop: 8,
          }}
        >
          <div>
            <label style={{ ...labelStyle, fontSize: 10, marginBottom: 4 }}>Input</label>
            <textarea
              value={tc.input || ""}
              onChange={(e) => updateCase(index, "input", e.target.value)}
              placeholder="Input block (each line = one argument)"
              rows={2}
              style={{ ...inputStyle, resize: "vertical", fontSize: 11 }}
            />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 10, marginBottom: 4 }}>Expected Output</label>
            <textarea
              value={tc.expectedOutput || ""}
              onChange={(e) => updateCase(index, "expectedOutput", e.target.value)}
              placeholder="Auto-filled by reference solution"
              rows={2}
              style={{ ...inputStyle, resize: "vertical", fontSize: 11 }}
            />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 10, marginBottom: 4 }}>Description</label>
            <input
              type="text"
              value={tc.description || ""}
              onChange={(e) => updateCase(index, "description", e.target.value)}
              placeholder="Optional"
              style={{ ...inputStyle, fontSize: 11 }}
            />
          </div>
          <button
            onClick={() => removeCase(index)}
            title="Remove test case"
            style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", display: "flex", padding: 4, marginTop: 18 }}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {(cases || []).length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-ui)", marginTop: 10 }}>
          No test cases yet. Split the bulk text above or add one manually.
        </div>
      )}
    </div>
  );
}
