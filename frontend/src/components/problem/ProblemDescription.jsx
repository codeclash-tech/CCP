import { useState } from "react";
import {
  FileText,
  BookOpen,
  Lightbulb,
  BarChart3,
  CheckCircle2,
  Users,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  Braces,
  FlaskConical,
} from "lucide-react";
import { DIFFICULTY_COLORS } from "../../utils/constants";

function DifficultyBadge({ difficulty }) {
  const cls = (difficulty || "").toLowerCase();
  const color = DIFFICULTY_COLORS[difficulty] || "#7d8590";
  return (
    <span
      className={`difficulty-badge ${cls}`}
      style={{ color, borderColor: `${color}55`, background: `${color}1a` }}
    >
      {difficulty || "UNKNOWN"}
    </span>
  );
}

// A collapsible section with a header + expandable body.
function Section({ title, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-color)",
        borderRadius: 8,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          cursor: "pointer",
          userSelect: "none",
          background: "var(--bg-card)",
          borderBottom: open ? "1px solid var(--border-color)" : "none",
        }}
      >
        <span
          style={{
            color: "var(--text-primary)",
            fontWeight: 600,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {Icon && <Icon size={15} color="var(--accent-blue-bright)" />}
          {title}
        </span>
        {open ? (
          <ChevronUp size={15} color="var(--text-muted)" />
        ) : (
          <ChevronDown size={15} color="var(--text-muted)" />
        )}
      </div>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  );
}

export default function ProblemDescription({ challenge }) {
  const [activeTab, setActiveTab] = useState("description");

  if (!challenge) return null;

  const tabs = [
    { key: "description", label: "Description", icon: FileText },
    { key: "editorial", label: "Editorial", icon: BookOpen },
    { key: "solutions", label: "Solutions", icon: Lightbulb },
    { key: "submissions", label: "Submissions", icon: BarChart3 },
  ];

  const testCases = challenge.testCases || challenge.visibleTestCases || [];
  const sampleCases = [
    ...(challenge.examples || []).map((example) => ({
      input: example.input,
      output: example.output,
      explanation: example.explanation,
    })),
    ...testCases.map((testCase) => ({
      input: testCase.input,
      output: testCase.output ?? testCase.expectedOutput,
      explanation: testCase.explanation,
    })),
  ].filter(
    (sample, index, samples) =>
      sample.input !== undefined &&
      sample.output !== undefined &&
      samples.findIndex(
        (candidate) =>
          candidate.input === sample.input && candidate.output === sample.output,
      ) === index,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header with title & difficulty */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <h2
            style={{
              color: "var(--text-primary)",
              fontSize: 15,
              margin: 0,
              fontWeight: 600,
            }}
          >
            {challenge.title}
          </h2>
          <DifficultyBadge difficulty={challenge.difficulty} />
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            color: "var(--text-muted)",
            fontSize: 12,
            fontFamily: "var(--font-ui)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={13} color="var(--color-success)" />
            {challenge.totalAccepted || 0} Accepted
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Users size={13} />
            {challenge.totalSubmissions || 0} Submissions
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-card)",
          padding: "0 12px",
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
        {activeTab === "description" && (
          <div className="fade-in">
            {/* Description (open by default) */}
            <Section title="Description" icon={FileText} defaultOpen>
              <div
                style={{
                  color: "var(--text-primary)",
                  fontSize: 14,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  fontFamily: "var(--font-ui)",
                }}
              >
                {challenge.description}
              </div>
            </Section>

            {/* Examples shown below description */}
            {sampleCases.length > 0 && (
              <Section
                title={`Sample Test Cases (${sampleCases.length})`}
                icon={ListOrdered}
                defaultOpen
              >
                {sampleCases.map((sample, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "rgba(110, 118, 129, 0.12)",
                      border: "1px solid rgba(110, 118, 129, 0.25)",
                      borderRadius: 8,
                      padding: 14,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        fontSize: 13,
                        marginBottom: 10,
                      }}
                    >
                      Sample {idx + 1}
                    </div>
                    {[
                      ["Sample Input", sample.input],
                      ["Sample Output", sample.output],
                    ].map(([label, value]) => (
                      <div key={label} style={{ marginBottom: 8 }}>
                        <div
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: 12,
                            fontWeight: 600,
                            marginBottom: 5,
                          }}
                        >
                          {label}
                        </div>
                        <pre
                          style={{
                            color: "var(--text-primary)",
                            background: "rgba(0, 0, 0, 0.12)",
                            borderRadius: 5,
                            padding: "9px 11px",
                            margin: 0,
                            fontFamily: "var(--font-code)",
                            fontSize: 12,
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {value}
                        </pre>
                      </div>
                    ))}
                    {sample.explanation && (
                      <div
                        style={{
                          color: "var(--text-muted)",
                          marginTop: 10,
                          fontSize: 12,
                          fontFamily: "var(--font-ui)",
                        }}
                      >
                        <span style={{ color: "var(--text-faint)" }}>
                          Explanation:{" "}
                        </span>
                        {sample.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {/* Constraints (expandable) */}
            {challenge.constraints && (
              <Section title="Constraints" icon={Braces}>
                <div
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                    fontFamily: "var(--font-code)",
                  }}
                >
                  {challenge.constraints}
                </div>
              </Section>
            )}

            {/* Test cases (expandable) */}
            {testCases.length > 0 && (
              <Section
                title={`Test Cases (${testCases.length})`}
                icon={FlaskConical}
              >
                {testCases.map((tc, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 6,
                      padding: 10,
                      marginBottom: 8,
                      fontFamily: "var(--font-code)",
                      fontSize: 12,
                    }}
                  >
                    <div
                      style={{ color: "var(--text-muted)", marginBottom: 4 }}
                    >
                      <span style={{ color: "var(--text-faint)" }}>
                        Input:{" "}
                      </span>
                      <span style={{ color: "var(--syntax-string)" }}>
                        {tc.input}
                      </span>
                    </div>
                    <div style={{ color: "var(--text-muted)" }}>
                      <span style={{ color: "var(--text-faint)" }}>
                        Expected:{" "}
                      </span>
                      <span style={{ color: "var(--syntax-keyword)" }}>
                        {tc.expectedOutput}
                      </span>
                    </div>
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}

        {activeTab === "editorial" && (
          <div
            className="fade-in"
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.7,
              padding: 12,
              textAlign: "center",
            }}
          >
            <BookOpen
              size={32}
              style={{ color: "var(--text-faint)", marginBottom: 12 }}
            />
            <p>
              Editorial for this problem will be published after the challenge
              ends.
            </p>
          </div>
        )}

        {activeTab === "solutions" && (
          <div
            className="fade-in"
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.7,
              padding: 12,
              textAlign: "center",
            }}
          >
            <Lightbulb
              size={32}
              style={{ color: "var(--text-faint)", marginBottom: 12 }}
            />
            <p>Community solutions will appear here.</p>
          </div>
        )}

        {activeTab === "submissions" && (
          <div
            className="fade-in"
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.7,
              padding: 12,
              textAlign: "center",
            }}
          >
            <BarChart3
              size={32}
              style={{ color: "var(--text-faint)", marginBottom: 12 }}
            />
            <p>Your submission history for this problem will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
