import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "../services/battleRoomService";
import { saveCreatorProfile } from "../services/platformService";
import { useAuth } from "../context/AuthContext";
import {
  CATEGORY_VALUES,
  TAG_SUGGESTIONS,
} from "../utils/constants";
import SignatureBuilder from "../components/battleRoom/authoring/SignatureBuilder";
import ParameterTestCaseEditor from "../components/battleRoom/authoring/ParameterTestCaseEditor";
import ReferenceSolutionEditor from "../components/battleRoom/authoring/ReferenceSolutionEditor";
import ValidationPanel from "../components/battleRoom/authoring/ValidationPanel";
import {
  PlusCircle, Trash2, Check, ChevronLeft, ChevronRight, Loader2,
  ListOrdered, Newspaper, Braces, Code2, FlaskConical, ShieldCheck, KeyRound,
} from "lucide-react";

const inputStyle = {
  width: "100%",
  background: "var(--bg-main)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "var(--font-ui)",
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

const emptyQuestion = {
  title: "",
  description: "",
  constraints: "",
  difficulty: "MEDIUM",
  category: "Array",
  tags: [],
  examples: [],
  hints: [],
  points: 100,
  problemType: "array",
  // Step 2 & 3 — function definition
  functionName: "",
  returnType: "",
  parameters: [],
  signature: null,
  signaturePreview: {},
  // Step 4 — reference solution
  referenceSolution: "",
  referenceSolutionLanguage: "java",
  // Step 5 — parameter-based test cases
  visibleTestCases: [],
  hiddenTestCases: [],
};

// Multi-step wizard steps (new parameter-based workflow)
const STEPS = [
  { id: "room", label: "Room Details", icon: <KeyRound size={13} /> },
  { id: "basic", label: "Question Info", icon: <Newspaper size={13} /> },
  { id: "signature", label: "Function & Parameters", icon: <Braces size={13} /> },
  { id: "cases", label: "Test Cases", icon: <ListOrdered size={13} /> },
  { id: "reference", label: "Reference Solution", icon: <FlaskConical size={13} /> },
  { id: "validate", label: "Validate & Create", icon: <ShieldCheck size={13} /> },
];

function formatTestCasesForPreview(tcs, params, max = 3) {
  if (!tcs || tcs.length === 0) return "None yet";
  const slice = tcs.slice(0, max);
  return slice
    .map((tc) => {
      const parts = params.map((p) => `${p.name}=${tc.parameterValues?.[p.name] ?? "?"}`).join(" ");
      return parts || "In: " + (tc.input || "").split("\n").join(" | ");
    })
    .join("\n");
}

export default function CreateBattleRoom() {
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const [creatorProfileComplete, setCreatorProfileComplete] = useState(
    Boolean(user?.creatorType),
  );
  const [creatorType, setCreatorType] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [partnerAgreed, setPartnerAgreed] = useState(false);
  const [logoData, setLogoData] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // Room-level state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(100);
  const [moderationAction, setModerationAction] = useState("FLAG");
  const [allowLeaderboard, setAllowLeaderboard] = useState(true);
  const [allowReuse, setAllowReuse] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Questions
  const [questions, setQuestions] = useState([{ ...emptyQuestion }]);

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Submission state
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const currentQuestion = useMemo(
    () => questions[currentQuestionIndex] || { ...emptyQuestion },
    [questions, currentQuestionIndex],
  );

  const handlePartnerLogoChange = async (event) => {
    setProfileError("");
    const file = event.target.files?.[0];
    if (!file) {
      setLogoData("");
      return;
    }
    if (file.type !== "image/png" || file.size > 128 * 1024) {
      setLogoData("");
      setProfileError("Choose a PNG logo that is 128 KB or smaller.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth !== image.naturalHeight) {
          setLogoData("");
          setProfileError("Your organization logo must be square (1:1).");
          event.target.value = "";
          return;
        }
        setLogoData(dataUrl);
      };
      image.onerror = () => {
        setLogoData("");
        setProfileError("The selected logo could not be read.");
        event.target.value = "";
      };
      image.src = dataUrl;
    };
    reader.onerror = () => {
      setLogoData("");
      setProfileError("The selected logo could not be read.");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleCreatorProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileError("");
    if (!creatorType) {
      setProfileError("Choose Individual or Organization to continue.");
      return;
    }
    if (creatorType === "ORGANIZATION") {
      if (!organizationName.trim()) {
        setProfileError("Enter your organization name.");
        return;
      }
      if (!logoData) {
        setProfileError("Upload your square PNG organization logo.");
        return;
      }
      if (!partnerAgreed) {
        setProfileError("Agree to the partner program to continue.");
        return;
      }
    }

    setProfileSaving(true);
    try {
      const result = await saveCreatorProfile({
        creatorType,
        organizationName,
        logoData,
        partnerAgreed,
      });
      signIn(result.user);
      setCreatorProfileComplete(true);
    } catch (saveError) {
      setProfileError(saveError.message || "Could not save your creator profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const updateCurrentQuestion = (updated) => {
    const updatedQuestions = [...questions];
    updatedQuestions[currentQuestionIndex] = updated;
    setQuestions(updatedQuestions);
  };

  const addQuestion = () => {
    if (questions.length >= 20) {
      setError("Maximum 20 questions allowed.");
      return;
    }
    setQuestions([...questions, { ...emptyQuestion }]);
    setCurrentQuestionIndex(questions.length);
  };

  const removeQuestion = (index) => {
    if (questions.length <= 1) {
      setCurrentQuestionIndex(0);
      return;
    }
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
    setCurrentQuestionIndex(Math.max(0, index - 1));
  };

  const canGoNext = useMemo(() => {
    const q = currentQuestion;
    switch (STEPS[currentStep]?.id) {
      case "room":
        return (
          title.trim() !== "" &&
          startDate !== "" &&
          endDate !== "" &&
          new Date(endDate) > new Date(startDate)
        );
      case "basic":
        return q.title.trim() !== "" && q.description.trim() !== "";
      case "signature":
        return (
          q.functionName &&
          q.functionName.trim() !== "" &&
          q.returnType &&
          q.signature &&
          q.signature.name &&
          (q.signature.params || []).length > 0
        );
      case "cases":
        return (
          (q.visibleTestCases || []).length >= 3 &&
          (q.hiddenTestCases || []).length > 0
        );
      case "reference":
        return (q.referenceSolution || "").trim() !== "";
      default:
        return true;
    }
  }, [
    currentStep,
    title,
    currentQuestion,
    startDate,
    endDate,
  ]);

  const goNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreate = async () => {
    setError("");
    if (!user?.id && !user?._id) {
      setError("Sign in before creating a battle room.");
      return;
    }
    if (!startDate || !endDate || new Date(endDate) <= new Date(startDate)) {
      setError(
        "Enter a valid start and end date/time. The end must be after the start.",
      );
      return;
    }
    setCreating(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        questions: questions.map((q) => {
          const signature = q.signature || null;
          const visibleTestCases = (q.visibleTestCases || [])
            .filter((tc) =>
              tc.parameterValues &&
              Object.values(tc.parameterValues).some((v) => v !== undefined && v !== null && String(v).trim() !== "")
            )
            .map((tc) => ({
              ...tc,
              input: tc.input || "",
              expectedOutput: tc.expectedOutput || "",
            }));
          const hiddenTestCases = (q.hiddenTestCases || [])
            .filter((tc) =>
              tc.parameterValues &&
              Object.values(tc.parameterValues).some((v) => v !== undefined && v !== null && String(v).trim() !== "")
            )
            .map((tc) => ({
              ...tc,
              input: tc.input || "",
              expectedOutput: tc.expectedOutput || "",
            }));
          return {
            ...q,
            signature,
            returnType: signature?.returnType || q.returnType || "",
            parameters: signature?.params || q.parameters || [],
            visibleTestCases,
            hiddenTestCases,
            expectedOutputSource: "reference",
          };
        }),
        maxParticipants,
        moderationAction,
        allowLeaderboard,
        allowReuse,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const data = await createRoom(payload);
      navigate("/battle-room", {
        replace: true,
        state: {
          activeTab: "my-rooms",
          createdRoomCode:
            data.room?.roomCode || data.roomCode || data.roomKey,
        },
      });
    } catch (err) {
      setError(err.message || "Failed to create room.");
    } finally {
      setCreating(false);
    }
  };

  const currentStepId = STEPS[currentStep]?.id;

  if (!creatorProfileComplete) {
    return (
      <main
        style={{
          width: "100%",
          maxWidth: 1600,
          margin: "48px auto",
          padding: "24px clamp(20px, 4vw, 64px)",
          boxSizing: "border-box",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          fontFamily: "var(--font-ui)",
        }}
      >
        <span className="about-eyebrow">Before your first battle</span>
        <h1 style={{ color: "var(--text-primary)", fontSize: 23, marginTop: 10 }}>
          How will you create battles?
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>
          Tell us whether you are creating as an individual or on behalf of an
          organization. You can set this up once before building your first battle.
        </p>

        <form onSubmit={handleCreatorProfileSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 22 }}>
            {[
              { value: "INDIVIDUAL", label: "Individual", detail: "I am creating on my own." },
              { value: "ORGANIZATION", label: "Organization", detail: "I represent a school, team, or company." },
            ].map((option) => {
              const selected = creatorType === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setCreatorType(option.value);
                    setProfileError("");
                  }}
                  aria-pressed={selected}
                  style={{
                    padding: 16,
                    textAlign: "left",
                    color: "var(--text-primary)",
                    background: selected ? "var(--accent-blue-soft)" : "var(--bg-card)",
                    border: `1px solid ${selected ? "var(--accent-blue-bright)" : "var(--border-color)"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  <strong style={{ display: "block", fontSize: 14 }}>{option.label}</strong>
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: 12, marginTop: 6 }}>{option.detail}</span>
                </button>
              );
            })}
          </div>

          {creatorType === "ORGANIZATION" && (
            <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
              <label style={{ ...labelStyle, fontSize: 12 }}>
                Organization name
                <input
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  maxLength={120}
                  required
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              </label>
              <label style={{ ...labelStyle, fontSize: 12 }}>
                Organization logo (square PNG, 1:1, up to 128 KB)
                <input
                  type="file"
                  accept="image/png"
                  onChange={handlePartnerLogoChange}
                  required
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              </label>
              {logoData && (
                <img
                  src={logoData}
                  alt="Organization logo preview"
                  width="88"
                  height="88"
                  style={{ objectFit: "contain", background: "#fff", borderRadius: 8, padding: 6 }}
                />
              )}
              <div style={{ padding: 16, background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }}>
                <h2 style={{ color: "var(--text-primary)", fontSize: 14 }}>Benefits of becoming a CodeClash partner</h2>
                <ul style={{ display: "grid", gap: 8, margin: "12px 0 0 18px", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 }}>
                  <li>Priority access to upcoming CodeClash features.</li>
                  <li>Reduced pricing on eligible future platform features.</li>
                  <li>Access to partner discounts on AMUX products when available.</li>
                  <li>Priority handling for AMUX service requests.</li>
                </ul>
                <p style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5, marginTop: 10 }}>
                  Benefits apply to future releases and offers and are subject to their published eligibility and availability.
                </p>
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 }}>
                <input
                  type="checkbox"
                  checked={partnerAgreed}
                  onChange={(event) => setPartnerAgreed(event.target.checked)}
                  required
                  style={{ marginTop: 3, accentColor: "var(--accent-blue-bright)" }}
                />
                <span>
                  I am authorized to represent this organization, agree to the
                  partner program, and allow AMUX to display its name and logo
                  on the CodeClash About page.
                </span>
              </label>
            </div>
          )}

          {profileError && (
            <p role="alert" style={{ color: "var(--color-danger)", fontSize: 12, marginTop: 14 }}>
              {profileError}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={profileSaving}
            style={{ marginTop: 18 }}
          >
            {profileSaving ? "Saving..." : "Continue to battle creation"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="create-battle-page" style={{ padding: "24px 32px", margin: "0 auto", width: "100%", boxSizing: "border-box", fontFamily: "var(--font-ui)" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: "var(--text-primary)", fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
          Create Battle Room
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          Define each question once — the platform generates Java starter code and judge wrappers.
          Test cases are parameter-based and expected outputs are generated automatically from your reference solution.
        </p>
      </div>

      {/* Step indicator */}
      <div className="create-step-tabs" style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => {
          const active = i === currentStep;
          const done = i < currentStep;
          return (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className="create-step-tab"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                borderRadius: 6,
                border: `1px solid ${active ? "var(--accent-blue)" : done ? "rgba(46,160,67,0.4)" : "var(--border-strong)"}`,
                background: active ? "var(--accent-blue-soft)" : done ? "rgba(46,160,67,0.08)" : "var(--bg-card)",
                color: active ? "var(--accent-blue-bright)" : done ? "var(--color-success)" : "var(--text-muted)",
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {done ? <Check size={11} /> : s.icon}
              {s.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: "8px 12px", background: "rgba(218,54,51,0.1)", border: "1px solid var(--color-danger)", borderRadius: 6, color: "var(--color-danger)", fontSize: 12, fontFamily: "var(--font-ui)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* STEP 0: Room Details */}
      {currentStepId === "room" && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 24, marginBottom: 20 }}>
          <h2 style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-ui)", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Battle Room Details
          </h2>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={labelStyle}>Room Title *</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 1: Arrays & Strings Battle" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what this battle is about..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div>
              <label style={labelStyle}>Max Participants</label>
              <input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(parseInt(e.target.value) || 10)} min={1} max={500} style={inputStyle} />
            </div>

            <h3 style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-ui)", margin: "4px 0 -4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Battle schedule *
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Start date & time *</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>End date & time *</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "-6px 0 0" }}>
              Times use your local time zone. Choose the same date for a one-day challenge or different dates for a multi-day challenge.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Suspicious activity policy</label>
                <select value={moderationAction} onChange={(e) => setModerationAction(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="FLAG">Flag in data - owner reviews later</option>
                  <option value="DISQUALIFY">Immediate disqualify - retain evidence</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Room lifecycle</label>
                <div style={{ display: "grid", gap: 8, color: "var(--text-secondary)", fontSize: 12 }}>
                  <label><input type="checkbox" checked={allowLeaderboard} onChange={(e) => setAllowLeaderboard(e.target.checked)} /> Show leaderboard</label>
                  <label><input type="checkbox" checked={allowReuse} onChange={(e) => setAllowReuse(e.target.checked)} /> Allow reuse after the battle</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: Question Basic Info */}
      {currentStepId === "basic" && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 24, marginBottom: 20 }}>
          <QuestionSelector
            questions={questions}
            currentQuestionIndex={currentQuestionIndex}
            onSelect={setCurrentQuestionIndex}
            onAdd={addQuestion}
            onRemove={removeQuestion}
            allowAdd={questions.length < 20}
          />
          <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
            <div>
              <label style={labelStyle}>Question Title *</label>
              <input type="text" value={currentQuestion.title || ""} onChange={(e) => updateCurrentQuestion({ ...currentQuestion, title: e.target.value })} placeholder="e.g. Two Sum" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Description *</label>
              <textarea value={currentQuestion.description || ""} onChange={(e) => updateCurrentQuestion({ ...currentQuestion, description: e.target.value })} placeholder="Describe the problem..." rows={4} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div>
              <label style={labelStyle}>Constraints</label>
              <textarea value={currentQuestion.constraints || ""} onChange={(e) => updateCurrentQuestion({ ...currentQuestion, constraints: e.target.value })} placeholder="e.g. 1 <= nums.length <= 10^4, -10^9 <= nums[i] <= 10^9" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Difficulty</label>
                <select value={currentQuestion.difficulty || "MEDIUM"} onChange={(e) => updateCurrentQuestion({ ...currentQuestion, difficulty: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={currentQuestion.category || "Array"} onChange={(e) => updateCurrentQuestion({ ...currentQuestion, category: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
                  {CATEGORY_VALUES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Points</label>
                <input type="number" value={currentQuestion.points || 100} onChange={(e) => updateCurrentQuestion({ ...currentQuestion, points: parseInt(e.target.value) || 0 })} min={10} max={500} style={inputStyle} />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label style={labelStyle}>Tags</label>
              <input
                type="text"
                value={(currentQuestion.tags || []).join(", ")}
                onChange={(e) =>
                  updateCurrentQuestion({
                    ...currentQuestion,
                    tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                  })
                }
                placeholder="e.g. array, hash-map, two-pointers"
                style={inputStyle}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                {TAG_SUGGESTIONS.slice(0, 14).map((tag) => {
                  const active = (currentQuestion.tags || []).includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() =>
                        updateCurrentQuestion({
                          ...currentQuestion,
                          tags: active
                            ? (currentQuestion.tags || []).filter((t) => t !== tag)
                            : [...(currentQuestion.tags || []), tag],
                        })
                      }
                      style={{
                        padding: "3px 10px",
                        borderRadius: 20,
                        border: `1px solid ${active ? "var(--accent-blue)" : "var(--border-strong)"}`,
                        background: active ? "var(--accent-blue-soft)" : "var(--bg-card)",
                        color: active ? "var(--accent-blue-bright)" : "var(--text-muted)",
                        fontSize: 10,
                        fontFamily: "var(--font-ui)",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Examples */}
            <div style={{ border: "1px solid var(--border-color)", borderRadius: 8, padding: 12, background: "var(--bg-card)" }}>
              <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 5 }}>
                <Code2 size={12} />
                Examples
              </label>
              {(currentQuestion.examples || []).map((ex, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr 30px", gap: 6, marginBottom: 8, alignItems: "start" }}>
                  <input type="text" value={ex.input || ""} onChange={(e) => {
                    const exs = [...(currentQuestion.examples || [])];
                    exs[i] = { ...exs[i], input: e.target.value };
                    updateCurrentQuestion({ ...currentQuestion, examples: exs });
                  }} placeholder="Input" style={{ ...inputStyle, fontSize: 11, fontFamily: "var(--font-code)" }} />
                  <input type="text" value={ex.output || ""} onChange={(e) => {
                    const exs = [...(currentQuestion.examples || [])];
                    exs[i] = { ...exs[i], output: e.target.value };
                    updateCurrentQuestion({ ...currentQuestion, examples: exs });
                  }} placeholder="Output" style={{ ...inputStyle, fontSize: 11, fontFamily: "var(--font-code)" }} />
                  <input type="text" value={ex.explanation || ""} onChange={(e) => {
                    const exs = [...(currentQuestion.examples || [])];
                    exs[i] = { ...exs[i], explanation: e.target.value };
                    updateCurrentQuestion({ ...currentQuestion, examples: exs });
                  }} placeholder="Explanation (optional)" style={{ ...inputStyle, fontSize: 11 }} />
                  <button onClick={() => updateCurrentQuestion({ ...currentQuestion, examples: (currentQuestion.examples || []).filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", display: "flex", padding: 4 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => updateCurrentQuestion({ ...currentQuestion, examples: [...(currentQuestion.examples || []), { input: "", output: "", explanation: "" }] })}
                style={{ padding: "5px 12px", borderRadius: 6, border: "1px dashed var(--accent-blue)", background: "transparent", color: "var(--accent-blue-bright)", fontSize: 11, fontFamily: "var(--font-ui)", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <PlusCircle size={12} />
                Add Example
              </button>
            </div>

            {/* Hints */}
            <div>
              <label style={labelStyle}>Hints (optional)</label>
              <input
                type="text"
                value={(currentQuestion.hints || []).join(" | ")}
                onChange={(e) =>
                  updateCurrentQuestion({
                    ...currentQuestion,
                    hints: e.target.value.split("|").map((h) => h.trim()).filter(Boolean),
                  })
                }
                placeholder="Hint 1 | Hint 2"
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 & 3: Function signature (name + return type) and parameters */}
      {currentStepId === "signature" && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 24, marginBottom: 20 }}>
          <QuestionSelector
            questions={questions}
            currentQuestionIndex={currentQuestionIndex}
            onSelect={setCurrentQuestionIndex}
            onAdd={addQuestion}
            onRemove={removeQuestion}
            allowAdd={questions.length < 20}
          />
          <div style={{ marginTop: 16 }}>
            <SignatureBuilder
              functionName={currentQuestion.functionName || ""}
              returnType={currentQuestion.returnType || ""}
              parameters={currentQuestion.parameters || []}
              signaturePreview={currentQuestion.signaturePreview || {}}
              signature={currentQuestion.signature}
              problemType={currentQuestion.problemType}
              onProblemTypeChange={(type) => updateCurrentQuestion({ ...currentQuestion, problemType: type })}
              onChange={(fields) => updateCurrentQuestion({ ...currentQuestion, ...fields })}
              onSignatureGenerated={(data) => {
                updateCurrentQuestion({
                  ...currentQuestion,
                  functionName: data.functionName,
                  returnType: data.returnType,
                  parameters: data.parameters,
                  signature: data.signature,
                  signaturePreview: data.signaturePreview,
                });
              }}
            />
          </div>
        </div>
      )}

      {/* STEP 5: Parameter-based test cases */}
      {currentStepId === "cases" && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 24, marginBottom: 20 }}>
          <QuestionSelector
            questions={questions}
            currentQuestionIndex={currentQuestionIndex}
            onSelect={setCurrentQuestionIndex}
            onAdd={addQuestion}
            onRemove={removeQuestion}
            allowAdd={questions.length < 20}
          />
          <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
            <ParameterTestCaseEditor
              cases={currentQuestion.visibleTestCases || []}
              onChange={(tcs) => updateCurrentQuestion({ ...currentQuestion, visibleTestCases: tcs })}
              signature={currentQuestion.signature}
              hidden={false}
            />
            <ParameterTestCaseEditor
              cases={currentQuestion.hiddenTestCases || []}
              onChange={(tcs) => updateCurrentQuestion({ ...currentQuestion, hiddenTestCases: tcs })}
              signature={currentQuestion.signature}
              hidden={true}
            />
            <div style={{ fontSize: 11, fontFamily: "var(--font-code)", color: "var(--text-muted)", border: "1px dashed var(--border-strong)", borderRadius: 6, padding: "8px 12px" }}>
              <strong style={{ color: "var(--text-secondary)" }}>How it works:</strong> every parameter in the signature becomes its own input field.
              No raw stdin. The backend converts these values into the judge input, and the reference solution
              (next step) generates the expected outputs automatically.
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Reference Solution */}
      {currentStepId === "reference" && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 24, marginBottom: 20 }}>
          <QuestionSelector
            questions={questions}
            currentQuestionIndex={currentQuestionIndex}
            onSelect={setCurrentQuestionIndex}
            onAdd={addQuestion}
            onRemove={removeQuestion}
            allowAdd={questions.length < 20}
          />
          <div style={{ marginTop: 16 }}>
            <ReferenceSolutionEditor
              question={{ ...currentQuestion }}
              onChange={(updated) => updateCurrentQuestion(updated)}
            />
            <div style={{ marginTop: 12, fontSize: 11, fontFamily: "var(--font-ui)", color: "var(--text-muted)", border: "1px dashed var(--border-strong)", borderRadius: 6, padding: "8px 12px" }}>
              <strong style={{ color: "var(--text-secondary)" }}>Important:</strong> the reference solution is executed only during authoring to generate
              expected outputs. It is never executed during a contest, never shown to participants, and the expected
              outputs are not editable — they are stored internally by the backend.
            </div>
          </div>
        </div>
      )}

      {/* STEP 6: Validate & Create */}
      {currentStepId === "validate" && (
        <div style={{ display: "grid", gap: 16 }}>
          <section style={{ background: "var(--bg-elevated)", border: "1px solid rgba(46,160,67,0.55)", borderRadius: 10, padding: 20 }}>
            <h2 style={{ color: "var(--text-primary)", fontSize: 14, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 7 }}>
              <ShieldCheck size={16} color="var(--color-success)" />
              Room owner
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "0 0 14px" }}>
              This room will be owned by your authenticated CodeClash account. You do not need to verify again to create another room.
            </p>
            <div style={{ color: "var(--text-primary)", fontSize: 13 }}>
              {user?.name} <span style={{ color: "var(--text-muted)" }}>· {user?.email}</span>
            </div>
          </section>
          {questions.map((q, i) => (
            <div key={i} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: "var(--accent-blue-soft)", border: "1px solid var(--accent-blue)", color: "var(--accent-blue-bright)" }}>
                  {i + 1}
                </span>
                <span style={{ color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-ui)", fontWeight: 600 }}>
                  {q.title || `Question ${i + 1}`}
                </span>
              </div>
              <ValidationPanel
                question={{ ...q }}
                key={i}
              />
              <div style={{ marginTop: 10, fontSize: 11, fontFamily: "var(--font-code)", color: "var(--text-muted)", border: "1px solid var(--border-color)", borderRadius: 6, padding: 8 }}>
                <strong style={{ color: "var(--text-secondary)" }}>Signature:</strong> {q.functionName || "—"}
                {"  ·  "}
                <strong style={{ color: "var(--text-secondary)" }}>Return:</strong> {q.returnType || "—"}
                {"  ·  "}
                <strong style={{ color: "var(--text-secondary)" }}>Params:</strong> {(q.parameters || []).map((p) => `${p.name}:${p.type}`).join(", ") || "—"}
                {"  ·  "}
                <strong style={{ color: "var(--text-secondary)" }}>Test cases:</strong> visible {q.visibleTestCases?.length || 0} (minimum 3) / hidden {q.hiddenTestCases?.length || 0}
              </div>
            </div>
          ))}

          <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 20 }}>
            <h2 style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-ui)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Summary
            </h2>
            <div style={{ display: "grid", gap: 6, fontSize: 12, fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}>
              <div><strong style={{ color: "var(--text-secondary)" }}>Room:</strong> {title || "Untitled"} · {startDate ? new Date(startDate).toLocaleString() : "Start not set"}–{endDate ? new Date(endDate).toLocaleString() : "End not set"} · max {maxParticipants} participants · {questions.length} question(s)</div>
              {questions.map((q, i) => (
                <div key={i}>
                  <strong style={{ color: "var(--text-secondary)" }}>Q{i + 1} · {q.category || q.problemType}:</strong>{" "}
                  {q.title || "Untitled"} — {formatTestCasesForPreview(q.visibleTestCases, q.parameters || [], 2)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Wizard navigation */}
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", marginTop: 8 }}>
        <div>
          <button
            onClick={goBack}
            disabled={currentStep === 0}
            className="btn-secondary"
            style={{ padding: "10px 24px", fontSize: 13, display: "flex", alignItems: "center", gap: 6, opacity: currentStep === 0 ? 0.5 : 1 }}
          >
            <ChevronLeft size={14} />
            Back
          </button>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => navigate("/battle-room")} className="btn-secondary" style={{ padding: "10px 24px", fontSize: 13 }}>
            Cancel
          </button>
          {currentStep < STEPS.length - 1 ? (
            <button
              onClick={goNext}
              disabled={!canGoNext}
              className="btn-primary"
              style={{ padding: "10px 32px", fontSize: 13, opacity: canGoNext ? 1 : 0.5 }}
            >
              Continue
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary"
              style={{ padding: "10px 32px", fontSize: 13, opacity: creating ? 0.55 : 1 }}
            >
              {creating ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={14} />}
              {creating ? "Creating Room..." : "Create Room & Generate Key"}
            </button>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function QuestionSelector({ questions, currentQuestionIndex, onSelect, onAdd, onRemove, allowAdd }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--border-color)", paddingBottom: 12 }}>
      <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.5px", marginRight: 4 }}>
        Question:
      </span>
      {questions.map((q, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => onSelect(i)}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              border: `1px solid ${i === currentQuestionIndex ? "var(--accent-blue)" : "var(--border-strong)"}`,
              background: i === currentQuestionIndex ? "var(--accent-blue-soft)" : "var(--bg-card)",
              color: i === currentQuestionIndex ? "var(--accent-blue-bright)" : "var(--text-muted)",
              fontSize: 11,
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {q.title ? q.title : `Question ${i + 1}`}
          </button>
          {questions.length > 1 && (
            <button
              onClick={() => onRemove(i)}
              title="Remove question"
              style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", display: "flex", padding: 4 }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onAdd}
        disabled={!allowAdd}
        style={{
          padding: "5px 12px",
          borderRadius: 6,
          border: "1px dashed var(--accent-blue)",
          background: "transparent",
          color: "var(--accent-blue-bright)",
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          fontWeight: 600,
          cursor: allowAdd ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          gap: 4,
          opacity: allowAdd ? 1 : 0.5,
        }}
      >
        <PlusCircle size={12} />
        Add
      </button>
    </div>
  );
}
