import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Save } from "lucide-react";
import api from "../services/api";
import {
  CATEGORY_VALUES,
  DIFFICULTY,
} from "../utils/constants";
import SignatureBuilder from "../components/battleRoom/authoring/SignatureBuilder";
import ParameterTestCaseEditor from "../components/battleRoom/authoring/ParameterTestCaseEditor";
import ReferenceSolutionEditor from "../components/battleRoom/authoring/ReferenceSolutionEditor";
import { generateExpectedOutputsLocally } from "../services/localExecutionService";
import "./WeeklyAdminAssessment.css";

const EMPTY_QUESTION = {
  title: "",
  description: "",
  constraints: "",
  difficulty: DIFFICULTY.MEDIUM,
  category: "Array",
  problemType: "array",
  functionName: "",
  returnType: "",
  parameters: [],
  signature: null,
  signaturePreview: {},
  referenceSolution: "",
  referenceSolutionLanguage: "java",
  visibleTestCases: [],
  hiddenTestCases: [],
};
const QUESTION_DRAFT_KEY = "ccp_super_admin_question_in_progress";

function hasParameterValues(testCase, signature) {
  return (signature?.params || []).every((parameter) => {
    const value = testCase.parameterValues?.[parameter.name];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

function prepareCases(
  testCases,
  signature,
  label,
  minimum,
  { requireExpectedOutput = true } = {},
) {
  const cases = (testCases || []).filter((testCase) =>
    testCase &&
    (
      (testCase.parameterValues &&
        typeof testCase.parameterValues === "object") ||
      String(testCase.input || "").trim() ||
      String(testCase.expectedOutput || "").trim()
    ),
  );
  if (cases.length < minimum) {
    throw new Error(`${label} needs at least ${minimum} test case${minimum === 1 ? "" : "s"}.`);
  }
  if (cases.some((testCase) => !hasParameterValues(testCase, signature))) {
    throw new Error(`Complete every parameter value in ${label.toLowerCase()}.`);
  }
  if (
    requireExpectedOutput &&
    cases.some((testCase) => !String(testCase.expectedOutput || "").trim())
  ) {
    throw new Error(`Generate expected outputs for ${label.toLowerCase()} before creating the question.`);
  }
  return cases.map((testCase) => ({
    ...testCase,
    input: testCase.input || "",
    expectedOutput: testCase.expectedOutput || "",
  }));
}

export default function AdminQuestions() {
  const [form, setForm] = useState(EMPTY_QUESTION);
  const [formVersion, setFormVersion] = useState(0);
  const [formRestored, setFormRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const savedDraft = window.localStorage.getItem(QUESTION_DRAFT_KEY);
      if (savedDraft) {
        const parsedDraft = JSON.parse(savedDraft);
        if (!parsedDraft || typeof parsedDraft !== "object" || Array.isArray(parsedDraft)) {
          throw new Error("Saved question data has an invalid format.");
        }
        setForm({ ...EMPTY_QUESTION, ...parsedDraft });
        setNotice("Your in-progress question was restored.");
      }
    } catch (restoreError) {
      setError(restoreError.message || "Could not restore the saved question.");
    } finally {
      setFormRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!formRestored) return;
    try {
      const hasContent = Object.entries(form).some(([key, value]) =>
        JSON.stringify(value) !== JSON.stringify(EMPTY_QUESTION[key]),
      );
      if (hasContent) {
        window.localStorage.setItem(QUESTION_DRAFT_KEY, JSON.stringify(form));
      } else {
        window.localStorage.removeItem(QUESTION_DRAFT_KEY);
      }
    } catch (saveError) {
      setError(saveError.message || "Could not autosave the question on this device.");
    }
  }, [form, formRestored]);

  const updateQuestion = (fields) => {
    setForm((current) => ({ ...current, ...fields }));
    setError("");
    setNotice("");
  };

  const createQuestion = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!form.title.trim() || !form.description.trim() || !form.constraints.trim()) {
        throw new Error("Complete the question title, problem statement, and constraints.");
      }
      if (!form.signature?.name || !form.signaturePreview?.java) {
        throw new Error("Generate the Java function signature before creating the question.");
      }

      const localEngineAvailable =
        typeof window !== "undefined" &&
        typeof window.codeClashDesktop?.engine?.execute === "function";
      let visibleTestCases = prepareCases(
        form.visibleTestCases,
        form.signature,
        "Visible test cases",
        3,
        { requireExpectedOutput: !localEngineAvailable },
      );
      let hiddenTestCases = prepareCases(
        form.hiddenTestCases,
        form.signature,
        "Hidden test cases",
        1,
        { requireExpectedOutput: !localEngineAvailable },
      );
      if (!form.referenceSolution.trim()) {
        throw new Error("Add a Java reference solution before creating the question.");
      }

      if (localEngineAvailable) {
        const generated = await generateExpectedOutputsLocally({
          signature: form.signature,
          referenceSolution: form.referenceSolution,
          referenceSolutionLanguage: form.referenceSolutionLanguage || "java",
          visibleTestCases,
          hiddenTestCases,
        });
        visibleTestCases = prepareCases(
          generated.visibleTestCases,
          form.signature,
          "Visible test cases",
          3,
        );
        hiddenTestCases = prepareCases(
          generated.hiddenTestCases,
          form.signature,
          "Hidden test cases",
          1,
        );
      }

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        difficulty: form.difficulty,
        category: form.category,
        constraints: form.constraints.trim(),
        signature: form.signature,
        functionSignatures: { java: form.signaturePreview.java },
        referenceSolutions: { java: form.referenceSolution },
        examples: visibleTestCases.map((testCase) => ({
          input: testCase.input,
          output: testCase.expectedOutput,
          explanation: testCase.description || "",
        })),
        visibleTestCases,
        hiddenTestCases,
        ...(localEngineAvailable
          ? { referenceSolutionValidatedLocally: true }
          : {}),
      };
      await api.post("/challenges", payload);
      setForm(EMPTY_QUESTION);
      setFormVersion((version) => version + 1);
      setNotice("Question created.");
      try {
        window.localStorage.removeItem(QUESTION_DRAFT_KEY);
      } catch (storageError) {
        setError(
          `Question created, but its local autosave could not be cleared: ${storageError.message || "Storage unavailable."}`,
        );
      }
    } catch (saveError) {
      const details = saveError.response?.data?.details;
      const failedCases = Array.isArray(details)
        ? details
            .filter((item) => item && (item.passed === false || item.error))
            .map((item) => item.error || item.message)
            .filter(Boolean)
        : [];
      setError(
        [saveError.message || "Could not create the question.", ...failedCases]
          .join(" "),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="weekly-admin-page">
      <header className="weekly-admin-heading">
        <div>
          <p className="weekly-eyebrow">SUPER ADMIN</p>
          <h1><BookOpen size={23} /> Create question</h1>
        </div>
        <div className="weekly-question-actions">
          <Link className="btn-secondary weekly-question-link" to="/admin">
            Global Challenge <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {error && <p className="weekly-admin-alert" role="alert">{error}</p>}
      {notice && <p className="weekly-admin-notice" role="status">{notice}</p>}
      <p className="weekly-question-autosave" role="status">Progress saves automatically on this device.</p>

      <section className="weekly-admin-card weekly-admin-form">
        <h2>1. Question details</h2>
        <div className="weekly-admin-grid">
          <label>
            Title
            <input
              required
              maxLength={160}
              value={form.title}
              onChange={(event) => updateQuestion({ title: event.target.value })}
            />
          </label>
          <label>
            Difficulty
            <select
              value={form.difficulty}
              onChange={(event) => updateQuestion({ difficulty: event.target.value })}
            >
              <option value={DIFFICULTY.EASY}>Easy</option>
              <option value={DIFFICULTY.MEDIUM}>Medium</option>
              <option value={DIFFICULTY.HARD}>Hard</option>
            </select>
          </label>
          <label>
            Category
            <select
              value={form.category}
              onChange={(event) => updateQuestion({ category: event.target.value })}
            >
              {CATEGORY_VALUES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="weekly-admin-wide">
            Problem statement
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(event) => updateQuestion({ description: event.target.value })}
            />
          </label>
          <label className="weekly-admin-wide">
            Constraints
            <textarea
              required
              rows={3}
              value={form.constraints}
              onChange={(event) => updateQuestion({ constraints: event.target.value })}
            />
          </label>
        </div>

        <h2>2. Function and parameters</h2>
        <SignatureBuilder
          functionName={form.functionName}
          returnType={form.returnType}
          parameters={form.parameters}
          signaturePreview={form.signaturePreview}
          signature={form.signature}
          problemType={form.problemType}
          onProblemTypeChange={(problemType) => updateQuestion({ problemType })}
          onChange={(fields) => updateQuestion({
            ...fields,
            signature: null,
            signaturePreview: {},
            visibleTestCases: [],
            hiddenTestCases: [],
          })}
          onSignatureGenerated={(data) => updateQuestion({
            functionName: data.functionName,
            returnType: data.returnType,
            parameters: data.parameters,
            signature: data.signature,
            signaturePreview: data.signaturePreview,
            visibleTestCases: [],
            hiddenTestCases: [],
          })}
        />

        <h2>3. Test cases</h2>
        <div className="weekly-question-test-cases">
          <ParameterTestCaseEditor
            cases={form.visibleTestCases}
            onChange={(visibleTestCases) => updateQuestion({ visibleTestCases })}
            signature={form.signature}
          />
          <ParameterTestCaseEditor
            cases={form.hiddenTestCases}
            onChange={(hiddenTestCases) => updateQuestion({ hiddenTestCases })}
            signature={form.signature}
            hidden
          />
        </div>

        <h2>4. Reference solution and generated answers</h2>
        <ReferenceSolutionEditor
          key={formVersion}
          question={form}
          onChange={(updated) => updateQuestion({
            referenceSolution: updated.referenceSolution,
            referenceSolutionLanguage: updated.referenceSolutionLanguage,
            visibleTestCases: updated.visibleTestCases || form.visibleTestCases,
            hiddenTestCases: updated.hiddenTestCases || form.hiddenTestCases,
          })}
        />
        <p className="weekly-question-reference-note">
          Add at least three visible and one hidden test case, then generate
          expected outputs before saving. In the desktop app, outputs are
          regenerated locally when saving. The reference solution and hidden
          cases are never shown to participants.
        </p>

        <div className="weekly-question-submit">
          <button
            className="btn-primary"
            type="button"
            onClick={createQuestion}
            disabled={saving || !formRestored}
          >
            <Save size={15} /> {saving ? "Creating question…" : "Create question"}
          </button>
        </div>
      </section>

    </main>
  );
}
