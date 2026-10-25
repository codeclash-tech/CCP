import { PlusCircle, Trash2 } from "lucide-react";
import { PARAM_PLACEHOLDER } from "../../../utils/constants";

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
};

/**
 * Parameter-based Test Case Editor (Step 5 of the new workflow).
 *
 * The author NEVER types raw stdin or expected outputs. Instead, each
 * parameter becomes one input field per test case. The backend converts
 * these parameter values into the canonical judge input format and
 * auto-generates expected outputs from the reference solution.
 *
 * Expected outputs stay private to the authoring form — they are generated and stored
 * internally by the backend.
 */
export default function ParameterTestCaseEditor({
  cases,
  onChange,
  signature,
}) {
  const params = Array.isArray(signature?.params) ? signature.params : [];
  const caseList = Array.isArray(cases) ? cases : [];

const updateValue = (caseIndex, paramName, value) => {
    const updated = [...caseList];
    const prior = updated[caseIndex] || { parameterValues: {}, expectedOutput: "" };
    updated[caseIndex] = {
      ...prior,
      // Changing a parameter value invalidates any previously generated
      // expected output. The reference-solution step must re-run so the
      // stored expectedOutput always matches the current inputs.
      expectedOutput: "",
      parameterValues: { ...(prior.parameterValues || {}), [paramName]: value },
    };
    onChange(updated);
  };

  const addCase = () => {
    const emptyValues = {};
    params.forEach((p) => (emptyValues[p.name] = ""));
    onChange([...caseList, { parameterValues: emptyValues, expectedOutput: "" }]);
  };

  const removeCase = (index) => {
    onChange(caseList.filter((_, i) => i !== index));
  };

  if (params.length === 0) {
    return (
      <div style={{ border: "1px solid var(--border-color)", borderRadius: 10, padding: 16, background: "var(--bg-card)" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-ui)" }}>
          Define the function signature (function name + parameters) in the previous step first.
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border-color)", borderRadius: 10, padding: 16, background: "var(--bg-card)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-ui)", fontWeight: 600 }}>
          Test Cases
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-ui)", marginLeft: "auto" }}>
          {caseList.length} case(s)
        </span>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-ui)", margin: "0 0 12px" }}>
        Each parameter is its own input field. No raw stdin, no expected-output typing — the reference solution
        generates expected outputs automatically.
      </p>

      {/* Column header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `24px repeat(${params.length}, 1fr) 1fr 34px`,
          gap: 8,
          alignItems: "center",
          padding: "6px 0",
          borderBottom: "1px solid var(--border-color)",
          marginBottom: 8,
        }}
      >
        <span />
        {params.map((p) => (
          <span key={p.name} style={{ color: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-code)", textAlign: "center" }}>
            {p.name}
            <span style={{ color: "var(--text-muted)" }}> · {p.type}</span>
          </span>
        ))}
        <span style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-ui)", textAlign: "center" }}>
          Description
        </span>
        <span />
      </div>

      {caseList.map((tc, index) => (
        <div
          key={index}
          style={{
            display: "grid",
            gridTemplateColumns: `24px repeat(${params.length}, 1fr) 1fr 34px`,
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span style={{ color: "var(--accent-blue-bright)", fontSize: 11, fontFamily: "var(--font-ui)", textAlign: "center" }}>
            #{index + 1}
          </span>
          {params.map((p) => (
            <div key={p.name}>
              <input
                type="text"
                value={tc.parameterValues?.[p.name] ?? ""}
                onChange={(e) => updateValue(index, p.name, e.target.value)}
                placeholder={PARAM_PLACEHOLDER[p.type] || ""}
                style={{ ...inputStyle, fontSize: 11, textAlign: "center" }}
              />
            </div>
          ))}
          <div>
            <input
              type="text"
              value={tc.description || ""}
              onChange={(e) => {
                const updated = [...caseList];
                updated[index] = { ...updated[index], description: e.target.value };
                onChange(updated);
              }}
              placeholder="Optional"
              style={{ ...inputStyle, fontSize: 11 }}
            />
          </div>
          <button
            onClick={() => removeCase(index)}
            title="Remove test case"
            style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", display: "flex", padding: 4 }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {caseList.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-ui)", margin: "8px 0" }}>
          No test cases yet. Add one below.
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={addCase}
          className="btn-secondary"
          style={{ padding: "6px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
        >
          <PlusCircle size={13} />
          Add Test Case
        </button>
        <span style={{ fontSize: 11, fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}>
          Expected outputs are generated automatically from the reference solution.
        </span>
      </div>
    </div>
  );
}
