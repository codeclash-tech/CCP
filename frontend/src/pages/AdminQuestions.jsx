import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import api from "../services/api";
import {
  CATEGORY_VALUES,
  DIFFICULTY,
} from "../utils/constants";
import SignatureBuilder from "../components/battleRoom/authoring/SignatureBuilder";
import ParameterTestCaseEditor from "../components/battleRoom/authoring/ParameterTestCaseEditor";
import ReferenceSolutionEditor from "../components/battleRoom/authoring/ReferenceSolutionEditor";
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

function hasParameterValues(testCase, signature) {
  return (signature?.params || []).every((parameter) => {
    const value = testCase.parameterValues?.[parameter.name];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

function prepareCases(testCases, signature, label, minimum) {
  const cases = (testCases || []).filter((testCase) =>
    Object.values(testCase.parameterValues || {}).some(
      (value) => value !== undefined && value !== null && String(value).trim() !== "",
    ),
  );
  if (cases.length < minimum) {
    throw new Error(`${label} needs at least ${minimum} test case${minimum === 1 ? "" : "s"}.`);
  }
  if (cases.some((testCase) => !hasParameterValues(testCase, signature))) {
    throw new Error(`Complete every parameter value in ${label.toLowerCase()}.`);
  }
  if (cases.some((testCase) => !String(testCase.expectedOutput || "").trim())) {
    throw new Error(`Generate expected outputs for ${label.toLowerCase()} before creating the question.`);
  }
  return cases.map((testCase) => ({
    ...testCase,
    input: testCase.input || "",
    expectedOutput: testCase.expectedOutput || "",
  }));
}

export default function AdminQuestions() {
  const [challenges, setChallenges] = useState([]);
  const [globalChallenge, setGlobalChallenge] = useState(null);
  const [questionIds, setQuestionIds] = useState([]);
  const [form, setForm] = useState(EMPTY_QUESTION);
  const [formVersion, setFormVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdQuestionId, setCreatedQuestionId] = useState("");
  const [rotationSavingId, setRotationSavingId] = useState("");

  const loadChallenges = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [challengeResponse, configurationResponse] = await Promise.all([
        api.get("/challenges", { params: { page: 1, limit: 100 } }),
        api.get("/weekly-assessments/admin/global-challenge"),
      ]);
      const savedConfiguration = configurationResponse.data.globalChallenge;
      setChallenges(challengeResponse.data.challenges || []);
      setGlobalChallenge(savedConfiguration);
      setQuestionIds(
        (savedConfiguration?.questionIds || []).map((item) =>
          String(item?._id || item),
        ),
      );
    } catch (loadError) {
      setError(loadError.message || "Could not load the saved question pool.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  const updateQuestion = (fields) => {
    setForm((current) => ({ ...current, ...fields }));
    setError("");
    setNotice("");
    setCreatedQuestionId("");
  };

  const resetQuestion = () => {
    setForm(EMPTY_QUESTION);
    setFormVersion((version) => version + 1);
    setError("");
    setNotice("");
    setCreatedQuestionId("");
  };

  const saveRotation = async (nextQuestionIds) => {
    if (!globalChallenge) {
      throw new Error("Set up the Global Challenge before adding questions to its rotation.");
    }
    const { data } = await api.put(
      "/weekly-assessments/admin/global-challenge",
      {
        name: globalChallenge.name,
        startAt: globalChallenge.startAt,
        questionIds: nextQuestionIds,
      },
    );
    const savedConfiguration = data.globalChallenge;
    setGlobalChallenge(savedConfiguration);
    setQuestionIds(
      (savedConfiguration?.questionIds || []).map((item) =>
        String(item?._id || item),
      ),
    );
  };

  const updateQuestionRotation = async (questionId) => {
    setRotationSavingId(questionId);
    setError("");
    setNotice("");
    const isInRotation = questionIds.includes(questionId);
    const nextQuestionIds = isInRotation
      ? questionIds.filter((id) => id !== questionId)
      : [...questionIds, questionId];
    try {
      await saveRotation(nextQuestionIds);
      setNotice(
        isInRotation
          ? "Question removed from the rotation. Changes apply to upcoming daily cycles."
          : "Question added to the rotation. Changes apply to upcoming daily cycles.",
      );
    } catch (rotationError) {
      setError(rotationError.message || "Could not update the question rotation.");
    } finally {
      setRotationSavingId("");
    }
  };

  const createQuestion = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    setCreatedQuestionId("");
    try {
      if (!form.title.trim() || !form.description.trim() || !form.constraints.trim()) {
        throw new Error("Complete the question title, problem statement, and constraints.");
      }
      if (!form.signature?.name || !form.signaturePreview?.java) {
        throw new Error("Generate the Java function signature before creating the question.");
      }

      const visibleTestCases = prepareCases(
        form.visibleTestCases,
        form.signature,
        "Visible test cases",
        3,
      );
      const hiddenTestCases = prepareCases(
        form.hiddenTestCases,
        form.signature,
        "Hidden test cases",
        1,
      );
      if (!form.referenceSolution.trim()) {
        throw new Error("Add a Java reference solution before creating the question.");
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
      };
      const { data } = await api.post("/challenges", payload);
      const questionId = String(data.challenge?.id || data.challenge?._id || "");
      await loadChallenges();
      setForm(EMPTY_QUESTION);
      setFormVersion((version) => version + 1);
      setCreatedQuestionId(questionId);
      if (globalChallenge && questionId && !questionIds.includes(questionId)) {
        try {
          await saveRotation([...questionIds, questionId]);
          setNotice(
            "Question created, reference-solution checks passed, and it was added to the rotation. Changes apply to upcoming daily cycles.",
          );
        } catch (rotationError) {
          setError(
            `Question created, but it could not be added to the rotation: ${rotationError.message || "Please try again from Saved questions."}`,
          );
        }
      } else {
        setNotice("Question created and reference-solution checks passed.");
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
          <p className="weekly-eyebrow">SUPER ADMIN · QUESTION MANAGEMENT</p>
          <h1><BookOpen size={23} /> Question pool</h1>
          <p>
            Build one question at a time with guided fields, parameter-based test
            cases, and automatic reference-answer checks.
          </p>
        </div>
        <div className="weekly-question-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={loadChallenges}
            disabled={loading}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" className="btn-secondary" onClick={resetQuestion}>
            <Plus size={14} /> New question
          </button>
          <Link className="btn-secondary weekly-question-link" to="/admin">
            Manage rotation <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {error && <p className="weekly-admin-alert" role="alert">{error}</p>}
      {notice && <p className="weekly-admin-notice" role="status">{notice}</p>}

      {createdQuestionId && (
        <section className="weekly-admin-card weekly-question-created">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <strong>Question saved</strong>
            <p>
              {globalChallenge
                ? "It is available in the question pool. Rotation changes apply to upcoming daily cycles; an active cycle keeps its saved question."
                : "Set up the Global Challenge rotation, then add this question from the saved questions list."}
            </p>
          </div>
          <Link to="/admin">
            {globalChallenge ? "Manage rotation" : "Set up Global Challenge"} <ArrowRight size={14} />
          </Link>
        </section>
      )}

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
          expected outputs before saving. The reference solution and hidden cases
          are never shown to participants.
        </p>

        <div className="weekly-question-submit">
          <button
            className="btn-primary"
            type="button"
            onClick={createQuestion}
            disabled={saving || loading}
          >
            <Save size={15} /> {saving ? "Creating question…" : "Create question"}
          </button>
        </div>
      </section>

      <section className="weekly-admin-card">
        <div className="weekly-question-library-heading">
          <div>
            <h2>Saved questions</h2>
            <p>{loading ? "Loading questions…" : `${challenges.length} question${challenges.length === 1 ? "" : "s"} in the pool`}</p>
          </div>
          <Link to="/admin">Add or remove questions from the rotation</Link>
        </div>
        {!loading && challenges.length === 0 ? (
          <p>No saved questions yet. Create the first question above.</p>
        ) : (
          <div className="weekly-question-library">
            {challenges.map((challenge) => {
              const questionId = String(challenge._id || challenge.id);
              const inRotation = questionIds.includes(questionId);
              return (
                <article className="weekly-question-library-item" key={questionId}>
                  <div>
                    <strong>{challenge.title}</strong>
                    <small>{challenge.category || "Custom"} · {challenge.difficulty || "Question"}</small>
                  </div>
                  <div className="weekly-question-library-controls">
                    <span className={`weekly-status ${challenge.isActive ? "status-active" : ""}`}>
                      {challenge.isActive ? "Available" : "Archived"}
                    </span>
                    {challenge.isActive && (
                      <button
                        type="button"
                        className={inRotation ? "weekly-rotation-remove" : "weekly-rotation-add"}
                        onClick={() => updateQuestionRotation(questionId)}
                        disabled={
                          loading ||
                          saving ||
                          rotationSavingId === questionId ||
                          (!inRotation && questionIds.length >= 50) ||
                          (inRotation && questionIds.length <= 1)
                        }
                        aria-label={`${inRotation ? "Remove" : "Add"} ${challenge.title} ${inRotation ? "from" : "to"} the rotation`}
                        title={inRotation && questionIds.length <= 1
                          ? "At least one question must remain in the rotation"
                          : undefined}
                      >
                        {inRotation
                          ? <><X size={14} /> Remove from rotation</>
                          : <><Plus size={14} /> Add to rotation</>}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
