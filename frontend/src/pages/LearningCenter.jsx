import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronRight,
  Download,
  Pencil,
  Mic,
  Save,
  Trash2,
  Volume2,
} from "lucide-react";
import { Link } from "react-router-dom";
import api from "../services/api";
import MathContent from "../components/MathContent";
import {
  createSpeechInputProvider,
  createSpeechOutputProvider,
  getVoiceProfileChoices,
} from "../services/learningVoiceService";
import { getAssessmentRole, ASSESSMENT_ROLES } from "../routes/roleAccess";
import { useAuth } from "../context/AuthContext";
import "./LearningCenter.css";

const EMPTY_PROGRAM = {
  title: "",
  description: "",
};

const EMPTY_MODULE = {
  title: "",
  shortDescription: "",
  description: "",
  price: 0,
  accessDurationDays: "",
  difficulty: "BEGINNER",
  sequence: 1,
  estimatedDurationMinutes: 60,
  evaluationMode: "SELF_EVALUATION",
  requiredForCompletion: true,
  scheduleStartAt: "",
  scheduleEndAt: "",
  evaluationMode: "SELF_EVALUATION",
  requiredForCompletion: true,
  scheduleStartAt: "",
  scheduleEndAt: "",
  objectives: [],
  prerequisites: [],
  topics: [],
  assessment: { questions: [], passingScorePercent: 70 },
  completionRequirements: {
    minCompletedTopics: 1,
    requiredExercises: 0,
    requireAssessment: false,
  },
};
const EMPTY_TOPIC = {
  title: "",
  subject: "",
  description: "",
  contentType: "CONCEPTS",
  aiPrompt: "",
  selfConceptConfig: {
    keyConcepts: [],
    expectedKnowledge: [],
    importantDefinitions: [],
    realLifeExamples: [],
    commonMisconceptions: [],
  },
  selfMcqConfig: {
    questionCoverage: "",
    questionsPerSession: 5,
    difficultyRange: "EASY_TO_MEDIUM",
  },
  strictConceptConfig: {
    expectedKnowledgeIndicators: [],
    evaluationCriteria: [],
    levelClassificationCriteria: "",
    questionCount: 5,
    timeLimitMinutes: "",
  },
  strictMcqConfig: {
    questionCount: 10,
    objectiveAllocation: {},
    difficultyDistribution: "BALANCED",
    timeLimitMinutes: "",
    negativeMarkingPercent: 0,
    evaluationCriteria: [],
  },
  objectivesText: "",
  curriculumProposal: null,
  curriculumApproved: false,
  estimatedDurationMinutes: "",
  prerequisiteTopicIds: [],
  coreKnowledgeText: "",
  coreKnowledge: [],
  coreKnowledgeKey: "core-explanation",
  tutorInstructions: "",
  validationInstructions: "",
  objectiveDefinitions: [],
  examples: [],
  questions: [],
  exercises: [],
  subtopics: [],
};
function toLines(value) {
  return Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
}
function linesToText(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}
function textToLines(value, max = 40) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}
function displayPrice(price, currencyInput = "INR") {
  const currency = /^[A-Z]{3}$/.test(currencyInput) ? currencyInput : "INR";
  return Number(price) === 0
    ? "Free"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(price));
}
function formatMathVariables(variables = {}) {
  return Object.entries(variables || {})
    .map(([symbol, value]) => `${symbol}=${value}`)
    .join("\n");
}
function parseMathVariables(text) {
  const variables = {};
  String(text || "").split(/\r?\n/).forEach((line, index) => {
    const value = line.trim();
    if (!value) return;
    const match = value.match(/^([A-Za-z][A-Za-z0-9_]{0,15})\s*=\s*(.+)$/);
    if (!match) {
      variables[`invalid_${index + 1}`] = value;
      return;
    }
    const numericValue = Number(match[2].trim());
    variables[match[1]] = Number.isFinite(numericValue) ? numericValue : match[2].trim();
  });
  return variables;
}
function objectiveProgressKey(topicId, objectiveIndex) {
  return `${String(topicId)}:${objectiveIndex}`;
}

function createTopicDraft(topic = {}) {
  const objectiveDefinitions = topic.objectiveDefinitions?.length
    ? topic.objectiveDefinitions.map((objective) => ({
        ...objective,
        key: objective.key || objective._id,
        masteryCriteria: (objective.masteryCriteria || []).map((criterion) => ({ ...criterion })),
        requiredKnowledgeText: (objective.requiredKnowledge || []).join("\n"),
        commonMisconceptionsText: (objective.commonMisconceptions || []).join("\n"),
        prerequisites: [...(objective.prerequisites || [])],
      }))
    : (topic.objectives || []).map((objective, index) => ({
        key: `legacy-${index + 1}`,
        title: objective,
        description: objective,
        requiredKnowledgeText: "",
        expectedOutcome: objective,
        masteryCriteria: [{
          key: "understanding",
          description: objective,
          evaluationMethod: "EXPLANATION",
          requiredEvidenceCount: 1,
        }],
        commonMisconceptionsText: "",
        prerequisites: [],
      }));
  const coreKnowledgeItems = topic.coreKnowledge || [];
  const coreKnowledge = coreKnowledgeItems.find(
    (item) => item.type === "EXPLANATION",
  );
  return {
    title: topic.title || "",
    subject: topic.subject || "",
    description: topic.description || "",
    contentType: topic.contentType === "MCQS" ? "MCQS" : "CONCEPTS",
    aiPrompt: topic.aiPrompt || "",
    selfConceptConfig: (() => {
      const config = topic.selfConceptConfig || {};
      return {
        ...config,
        keyConceptsText: linesToText(config.keyConcepts),
        expectedKnowledgeText: linesToText(config.expectedKnowledge),
        importantDefinitionsText: linesToText(config.importantDefinitions),
        realLifeExamplesText: linesToText(config.realLifeExamples),
        commonMisconceptionsText: linesToText(config.commonMisconceptions),
      };
    })(),
    selfMcqConfig: { ...(topic.selfMcqConfig || { questionCoverage: "", questionsPerSession: 5, difficultyRange: "EASY_TO_MEDIUM" }), evaluationCriteriaText: "" },
    strictConceptConfig: (() => {
      const config = topic.strictConceptConfig || {};
      return {
        ...config,
        expectedKnowledgeIndicatorsText: linesToText(config.expectedKnowledgeIndicators),
        evaluationCriteriaText: linesToText(config.evaluationCriteria),
      };
    })(),
    strictMcqConfig: (() => {
      const config = topic.strictMcqConfig || {};
      return {
        ...config,
        evaluationCriteriaText: linesToText(config.evaluationCriteria),
      };
    })(),
    objectivesText: (topic.objectives?.length
      ? topic.objectives
      : objectiveDefinitions.map((objective) => objective.title)).join("\n"),
    curriculumProposal: null,
    curriculumApproved: false,
    estimatedDurationMinutes: topic.estimatedDurationMinutes || "",
    prerequisiteTopicIds: (topic.prerequisiteTopicIds || []).map(String),
    coreKnowledgeText: typeof coreKnowledge?.content === "string"
      ? coreKnowledge.content
      : topic.explanation || "",
    coreKnowledge: coreKnowledgeItems,
    coreKnowledgeKey: coreKnowledge?.key || "core-explanation",
    tutorInstructions: topic.tutorInstructions || "",
    validationInstructions: topic.validationInstructions || "",
    objectiveDefinitions,
    examples: topic.examples || [],
    questions: topic.questions || [],
    exercises: (topic.exercises || []).map((exercise) => ({
      ...exercise,
      variablesText: formatMathVariables(exercise.variables),
    })),
    subtopics: (topic.subtopics || []).map((subtopic) => ({
      ...subtopic,
      exercises: (subtopic.exercises || []).map((exercise) => ({
        ...exercise,
        variablesText: formatMathVariables(exercise.variables),
      })),
    })),
  };
}

function createObjectiveDraft(index) {
  return {
    key: `objective-${crypto.randomUUID()}`,
    title: "",
    description: "",
    requiredKnowledgeText: "",
    expectedOutcome: "",
    masteryCriteria: [{
      key: `criterion-${crypto.randomUUID()}`,
      description: "",
      evaluationMethod: "EXPLANATION",
      requiredEvidenceCount: 1,
    }],
    commonMisconceptionsText: "",
    prerequisites: [],
    order: index,
  };
}

function updateTopicItem(items, index, field, value) {
  return items.map((item, itemIndex) =>
    itemIndex === index ? { ...item, [field]: value } : item,
  );
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (window.razorpayScriptPromise) return window.razorpayScriptPromise;
  window.razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay
      ? resolve(window.Razorpay)
      : reject(new Error("Razorpay Checkout did not initialize."));
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
    document.head.appendChild(script);
  }).catch((error) => {
    window.razorpayScriptPromise = null;
    throw error;
  });
  return window.razorpayScriptPromise;
}

function AdminLearning() {
  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [programForm, setProgramForm] = useState(EMPTY_PROGRAM);
  const [moduleId, setModuleId] = useState("");
  const [moduleForm, setModuleForm] = useState(EMPTY_MODULE);
  const [topicDraft, setTopicDraft] = useState(EMPTY_TOPIC);
  const [editingTopicId, setEditingTopicId] = useState("");
  const [topicError, setTopicError] = useState("");
  const [newProgram, setNewProgram] = useState(EMPTY_PROGRAM);
  const [creatingProgram, setCreatingProgram] = useState(false);
  const [newModule, setNewModule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adminPage, setAdminPage] = useState("courses");
  const [strictResults, setStrictResults] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewScenario, setPreviewScenario] = useState("NO_PRIOR_KNOWLEDGE");
  const [previewMode, setPreviewMode] = useState("TUTOR");
  const [previewObjectiveKey, setPreviewObjectiveKey] = useState("");
  const [previewTaskId, setPreviewTaskId] = useState("");
  const [previewInput, setPreviewInput] = useState("");
  const [previewReasoning, setPreviewReasoning] = useState("");
  const [previewMessages, setPreviewMessages] = useState([]);
  const [previewEvidence, setPreviewEvidence] = useState([]);
  const [previewResult, setPreviewResult] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewTasks = [
    ...(topicDraft.exercises || []),
    ...(topicDraft.subtopics || []).flatMap((subtopic) => subtopic.exercises || []),
  ];
  const selectedPreviewTask = previewTasks.find(
    (task) => String(task._id) === previewTaskId,
  ) || (previewTaskId.startsWith("index:")
    ? previewTasks[Number(previewTaskId.slice(6))]
    : null) || previewTasks[0];
  const selectedPreviewObjectiveKey = previewObjectiveKey ||
    selectedPreviewTask?.objectiveKeys?.[0] ||
    topicDraft.objectiveDefinitions[0]?.key ||
    "";
  const selectedPreviewObjective = topicDraft.objectiveDefinitions.find(
    (objective) => objective.key === selectedPreviewObjectiveKey,
  );

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const programResponse = await api.get("/learning/admin/programs");
      const nextPrograms = programResponse.data.programs || [];
      setPrograms(nextPrograms);
      if (nextPrograms.length) {
        setSelectedProgramId((current) => current || String(nextPrograms[0]._id));
      }
    } catch (loadError) {
      setError(loadError.message || "Could not load learning management data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    const program = programs.find((item) => String(item._id) === selectedProgramId);
    setSelectedProgram(program || null);
    setProgramForm(
      program
        ? {
            title: program.title,
            description: program.description,
          }
        : EMPTY_PROGRAM,
    );
  }, [programs, selectedProgramId]);

  useEffect(() => {
    setModuleId("");
    setModuleForm(EMPTY_MODULE);
    setNewModule(false);
    setEditingTopicId("");
    setTopicError("");
    setTopicDraft(EMPTY_TOPIC);
  }, [selectedProgramId]);

  const loadModule = async (id, destination = "modules") => {
    setError("");
    setNotice("");
    try {
      const { data } = await api.get(`/learning/admin/modules/${id}`);
      const module = data.module;
      setModuleId(String(module._id));
      setAdminPage(destination);
      setNewModule(false);
      setModuleForm(module);
      setStrictResults(null);
      setEditingTopicId("");
      setTopicError("");
      setTopicDraft(EMPTY_TOPIC);
    } catch (loadError) {
      setError(loadError.message || "Could not load the learning module.");
    }
  };

  const loadStrictResults = useCallback(async () => {
    if (!moduleId) return;
    setResultsLoading(true);
    setError("");
    try {
      const { data } = await api.get(
        `/learning-strict/admin/modules/${moduleId}/results`,
      );
      setStrictResults(data);
    } catch (resultsError) {
      setError(
        resultsError.response?.data?.error ||
          resultsError.message ||
          "Could not load assessment results.",
      );
    } finally {
      setResultsLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    if (adminPage === "results") loadStrictResults();
  }, [adminPage, loadStrictResults]);

  const downloadResultsExport = async () => {
    setError("");
    try {
      const { data } = await api.get(
        `/learning-strict/admin/modules/${moduleId}/results.xlsx`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `strict-results-${moduleId}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(exportError.message || "Could not export results.");
    }
  };

  const createProgram = async (event) => {
    event?.preventDefault?.();
    if (
      programs.some((program) => program.status === "DRAFT") ||
      selectedProgram?.status === "DRAFT"
    ) {
      setAdminPage("courses");
      setError("Finish or delete the current unpublished course before creating another.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/learning/admin/programs", newProgram);
      setNewProgram(EMPTY_PROGRAM);
      setCreatingProgram(false);
      setNotice("Course saved. Add at least one module before publishing it.");
      const { data: list } = await api.get("/learning/admin/programs");
      setPrograms(list.programs || []);
      setSelectedProgramId(String(data.program._id));
      setAdminPage("modules");
    } catch (saveError) {
      setError(saveError.message || "Could not create the learning program.");
    } finally {
      setSaving(false);
    }
  };

  const saveProgram = async (event) => {
    event?.preventDefault?.();
    if (!selectedProgram) return;
    setSaving(true);
    setError("");
    try {
      await api.patch(`/learning/admin/programs/${selectedProgram._id}`, programForm);
      setNotice("Program details saved.");
      await loadAdminData();
    } catch (saveError) {
      setError(saveError.message || "Could not save the program.");
    } finally {
      setSaving(false);
    }
  };

  const changeProgramStatus = async () => {
    if (!selectedProgram) return;
    if (
      selectedProgram.status !== "PUBLISHED" &&
      !(selectedProgram.modules || []).length
    ) {
      setError("Create at least one module before publishing this course.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const hasDraftModules = (selectedProgram.modules || []).some(
        (module) => module.status !== "PUBLISHED",
      );
      const status = selectedProgram.status === "PUBLISHED" && !hasDraftModules
        ? "DRAFT"
        : "PUBLISHED";
      await api.patch(`/learning/admin/programs/${selectedProgram._id}`, { status });
      setNotice(status === "PUBLISHED" ? "Course and its modules published." : "Course unpublished.");
      await loadAdminData();
    } catch (saveError) {
      setError(saveError.message || "Could not change the program status.");
    } finally {
      setSaving(false);
    }
  };

  const archiveProgram = async (programId = selectedProgram?._id) => {
    if (!programId || !window.confirm("Delete this course? Existing student records will be retained.")) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/learning/admin/programs/${programId}`);
      if (String(selectedProgramId) === String(programId)) setSelectedProgramId("");
      setNotice("Course deleted. Existing student records remain preserved.");
      await loadAdminData();
    } catch (archiveError) {
      setError(archiveError.message || "Could not archive this course.");
    } finally {
      setSaving(false);
    }
  };

  const archiveModule = async () => {
    if (!moduleId || !window.confirm("Delete this module? Purchases, progress, and certificates will be retained.")) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/learning/admin/modules/${moduleId}`);
      setModuleId("");
      setNotice("Module deleted. Existing student records remain preserved.");
      await loadAdminData();
    } catch (archiveError) {
      setError(archiveError.message || "Could not archive this module.");
    } finally {
      setSaving(false);
    }
  };

  const startNewModule = () => {
    setAdminPage("modules");
    setModuleId("");
    setEditingTopicId("");
    setTopicError("");
    setTopicDraft(EMPTY_TOPIC);
    setModuleForm({
      ...EMPTY_MODULE,
      sequence: (selectedProgram?.modules?.length || 0) + 1,
    });
    setNewModule(true);
    setError("");
    setNotice("");
  };

  const saveModule = async (event) => {
    event?.preventDefault?.();
    if (!selectedProgram) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: moduleForm.title,
        shortDescription: moduleForm.shortDescription || moduleForm.description,
        description: moduleForm.description,
        price: Number(moduleForm.price) || 0,
        accessDurationDays: moduleForm.accessDurationDays === "" ||
          moduleForm.accessDurationDays === null
          ? null
          : Number(moduleForm.accessDurationDays),
        sequence: moduleId ? Number(moduleForm.sequence) : undefined,
        estimatedDurationMinutes: Number(moduleForm.estimatedDurationMinutes) || 60,
        evaluationMode: moduleForm.evaluationMode || "SELF_EVALUATION",
        requiredForCompletion: moduleForm.requiredForCompletion !== false,
        scheduleStartAt: moduleForm.scheduleStartAt || null,
        scheduleEndAt: moduleForm.scheduleEndAt || null,
        topics: newModule ? [] : (moduleForm.topics || []),
      };
      if (newModule) {
        const { data } = await api.post(
          `/learning/admin/programs/${selectedProgram._id}/modules`,
          payload,
        );
        setModuleId(String(data.module._id));
        setNewModule(false);
        setModuleForm(data.module);
        setAdminPage("topics");
        setNotice("Module created.");
      } else {
        await api.patch(`/learning/admin/modules/${moduleId}`, payload);
        setNotice("Module content saved.");
      }
      await loadAdminData();
      if (moduleId) await loadModule(moduleId);
    } catch (saveError) {
      setError(saveError.message || "Could not save the learning module.");
    } finally {
      setSaving(false);
    }
  };

  const saveTopic = async () => {
    if (!moduleId) return;
    setError("");
    setTopicError("");
    if (!topicDraft.title.trim()) {
      setTopicError("Enter a topic title.");
      return;
    }
    if (!topicDraft.description.trim()) {
      setTopicError("Add a short topic description.");
      return;
    }
    if (
      adminPage === "topics-editor" &&
      topicDraft.contentType === "CONCEPTS" &&
      moduleForm.evaluationMode === "SELF_EVALUATION" &&
      !topicDraft.curriculumApproved
    ) {
      // AI curriculum draft is optional; approval is only needed when an AI
      // draft was actually generated for self-eval concepts topics.
      if (topicDraft.curriculumProposal) {
        setTopicError("Review and approve the generated curriculum preview before saving.");
        return;
      }
    }
    const objectiveDefinitions = topicDraft.objectiveDefinitions
      .map((objective) => ({
        ...objective,
        title: objective.title.trim(),
        description: objective.description.trim(),
        expectedOutcome: objective.expectedOutcome.trim(),
        requiredKnowledge: String(objective.requiredKnowledgeText || "")
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean),
        commonMisconceptions: String(objective.commonMisconceptionsText || "")
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean),
        masteryCriteria: (objective.masteryCriteria || []).map((criterion) => ({
          ...criterion,
          description: String(criterion.description || "").trim(),
          requiredEvidenceCount: Number(criterion.requiredEvidenceCount) || 1,
        })),
      }))
      .filter((objective) => objective.title);
    if (
      !topicDraft.aiPrompt.trim() &&
      !objectiveDefinitions.length &&
      !topicDraft.objectivesText.trim()
    ) {
      setTopicError(
        "Describe what this topic should teach or assess — the AI builds everything from that prompt.",
      );
      return;
    }
    if (objectiveDefinitions.length) {
      if (objectiveDefinitions.some((objective) =>
        !objective.description ||
        !objective.expectedOutcome ||
        !objective.masteryCriteria.length ||
        objective.masteryCriteria.some((criterion) => !criterion.description),
      )) {
        setTopicError("Each objective needs an expected outcome and at least one specific mastery criterion.");
        return;
      }
      const objectiveKeys = objectiveDefinitions.map((objective) => objective.key);
      if (new Set(objectiveKeys).size !== objectiveKeys.length) {
        setTopicError("Learning objective identifiers must be unique.");
        return;
      }
    } else if (
      topicDraft.objectivesText.trim()
    ) {
      // Prompt path with free-text objectives line list.
      objectiveDefinitions.push(...topicDraft.objectivesText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 50)
        .map((line, index) => ({
          key: `prompt-objective-${index + 1}`,
          title: line,
          description: line,
          expectedOutcome: line,
          masteryCriteria: [{
            key: "understanding",
            description: line,
            evaluationMethod: "EXPLANATION",
            requiredEvidenceCount: 1,
          }],
          commonMisconceptionsText: "",
          requiredKnowledgeText: "",
          prerequisites: [],
        })));
    }
    if (
      Number(topicDraft.estimatedDurationMinutes) < 1 ||
      (topicDraft.estimatedDurationMinutes &&
        !Number.isInteger(Number(topicDraft.estimatedDurationMinutes)))
    ) {
      setTopicError("Estimated duration must be a positive whole number of minutes.");
      return;
    }
    const objectiveKeys = objectiveDefinitions.map((objective) => objective.key);
    if (objectiveKeys.length && new Set(objectiveKeys).size !== objectiveKeys.length) {
      setTopicError("Learning objective identifiers must be unique.");
      return;
    }
    const coreKnowledge = (topicDraft.coreKnowledge || [])
      .filter((item) => item.key !== topicDraft.coreKnowledgeKey);
    if (topicDraft.coreKnowledgeText.trim()) {
      coreKnowledge.push({
        key: topicDraft.coreKnowledgeKey,
        type: "EXPLANATION",
        schemaVersion: 1,
        title: "Core explanation",
        content: topicDraft.coreKnowledgeText.trim(),
        objectiveKeys,
        order: 0,
      });
    }
    setSaving(true);
    setTopicError("");
    setError("");
    try {
      const topic = {
        title: topicDraft.title.trim(),
        subject: topicDraft.subject.trim(),
        description: topicDraft.description.trim(),
        contentType: topicDraft.contentType === "MCQS" ? "MCQS" : "CONCEPTS",
        aiPrompt: topicDraft.aiPrompt.trim(),
        selfConceptConfig: topicDraft.contentType === "CONCEPTS"
          ? {
              keyConcepts: textToLines(topicDraft.selfConceptConfig.keyConceptsText),
              expectedKnowledge: textToLines(topicDraft.selfConceptConfig.expectedKnowledgeText),
              importantDefinitions: textToLines(topicDraft.selfConceptConfig.importantDefinitionsText),
              realLifeExamples: textToLines(topicDraft.selfConceptConfig.realLifeExamplesText),
              commonMisconceptions: textToLines(topicDraft.selfConceptConfig.commonMisconceptionsText),
            }
          : undefined,
        selfMcqConfig: topicDraft.contentType === "MCQS"
          ? {
              questionCoverage: String(topicDraft.selfMcqConfig.questionCoverage || "").trim(),
              questionsPerSession: Number(topicDraft.selfMcqConfig.questionsPerSession) || 5,
              difficultyRange: topicDraft.selfMcqConfig.difficultyRange || "EASY_TO_MEDIUM",
            }
          : undefined,
        strictConceptConfig: topicDraft.contentType === "CONCEPTS"
          ? {
              expectedKnowledgeIndicators: textToLines(topicDraft.strictConceptConfig.expectedKnowledgeIndicatorsText),
              evaluationCriteria: textToLines(topicDraft.strictConceptConfig.evaluationCriteriaText),
              levelClassificationCriteria: String(topicDraft.strictConceptConfig.levelClassificationCriteria || "").trim(),
              questionCount: Number(topicDraft.strictConceptConfig.questionCount) || 5,
              timeLimitMinutes: topicDraft.strictConceptConfig.timeLimitMinutes
                ? Number(topicDraft.strictConceptConfig.timeLimitMinutes)
                : null,
            }
          : undefined,
        strictMcqConfig: topicDraft.contentType === "MCQS"
          ? {
              questionCount: Number(topicDraft.strictMcqConfig.questionCount) || 10,
              objectiveAllocation: topicDraft.strictMcqConfig.objectiveAllocation || {},
              difficultyDistribution: topicDraft.strictMcqConfig.difficultyDistribution || "BALANCED",
              timeLimitMinutes: topicDraft.strictMcqConfig.timeLimitMinutes
                ? Number(topicDraft.strictMcqConfig.timeLimitMinutes)
                : null,
              negativeMarkingPercent: Number(topicDraft.strictMcqConfig.negativeMarkingPercent) || 0,
              evaluationCriteria: textToLines(topicDraft.strictMcqConfig.evaluationCriteriaText),
            }
          : undefined,
        estimatedDurationMinutes: topicDraft.estimatedDurationMinutes
          ? Number(topicDraft.estimatedDurationMinutes)
          : null,
        prerequisiteTopicIds: topicDraft.prerequisiteTopicIds,
        explanation: "",
        // Prompt-first topics: leave objectives empty so the AI derives the
        // teaching structure from the prompt at publish time.
        ...(objectiveDefinitions.length
          ? {
              coreKnowledge,
              objectives: objectiveDefinitions.map((objective) => objective.title),
              objectiveDefinitions,
            }
          : { coreKnowledge: [], objectives: [], objectiveDefinitions: [] }),
        examples: topicDraft.examples,
        questions: topicDraft.questions,
        exercises: topicDraft.exercises,
        subtopics: topicDraft.subtopics,
      };
      if (editingTopicId) {
        await api.patch(`/learning/admin/modules/${moduleId}/topics/${editingTopicId}`, topic);
        setNotice("Topic content saved as a new published version where applicable.");
      } else {
        await api.post(`/learning/admin/modules/${moduleId}/topics`, topic);
        setNotice("Topic added.");
      }
      setEditingTopicId("");
      setTopicError("");
      setTopicDraft(EMPTY_TOPIC);
      setPreviewOpen(false);
      resetTutorPreview("NO_PRIOR_KNOWLEDGE", "");
      setAdminPage("topics");
      await loadModule(moduleId, "topics");
      await loadAdminData();
      setAdminPage("topics");
    } catch (topicError) {
      setError(topicError.message || "Could not save this topic.");
    } finally {
      setSaving(false);
    }
  };

  const generateTopicProposal = async () => {
    if (!moduleId || !topicDraft.title.trim()) {
      setTopicError("Enter a topic title before generating a proposal.");
      return;
    }
    setSaving(true);
    setError("");
    setTopicError("");
    try {
      const { data } = await api.post(
        `/learning/admin/modules/${moduleId}/topic-proposals`,
        {
          title: topicDraft.title.trim(),
          subject: topicDraft.subject.trim(),
          description: topicDraft.description.trim(),
          objectivesText: topicDraft.objectivesText.trim(),
          referenceContent: topicDraft.coreKnowledgeText.trim(),
        },
      );
      const proposal = data.proposal;
      const knowledge = proposal.coreKnowledge || [];
      const explanation = knowledge.find((item) => item.type === "EXPLANATION");
      setTopicDraft((current) => ({
        ...current,
        title: proposal.title,
        subject: proposal.subject,
        description: proposal.description,
        objectivesText: (proposal.objectives || []).join("\n"),
        estimatedDurationMinutes: String(proposal.estimatedDurationMinutes),
        coreKnowledge: knowledge,
        coreKnowledgeKey: explanation?.key || "core-explanation",
        coreKnowledgeText: typeof explanation?.content === "string"
          ? explanation.content
          : current.coreKnowledgeText,
        objectiveDefinitions: proposal.objectiveDefinitions.map((objective) => ({
          ...objective,
          requiredKnowledgeText: (objective.requiredKnowledge || []).join("\n"),
          commonMisconceptionsText: (objective.commonMisconceptions || []).join("\n"),
        })),
        curriculumProposal: proposal,
        curriculumApproved: false,
        exercises: (proposal.practiceTasks || []).map((task) => ({
          type: task.type || "ACTIVITY",
          title: task.title,
          instructions: task.instructions,
          objectiveKeys: task.objectiveKeys,
          criterionKeys: task.criterionKeys || [],
          evaluationMethod: task.evaluationMethod || (task.type === "MATH" ? "CALCULATION" : "EXPLANATION"),
          expectedAnswer: task.expectedAnswer || "",
          acceptedAnswers: task.acceptedAnswers || [],
          variables: task.variables || {},
          unit: task.unit || "",
          numericTolerance: task.numericTolerance ?? 0.000001,
          requireReasoning: task.requireReasoning === true,
          requireUnit: task.requireUnit === true,
          starterCode: task.starterCode || "",
          language: task.language || "java",
          tests: task.tests || [],
        })),
      }));
      setNotice("Curriculum preview ready. Review every objective and content-coverage result, then approve it before saving.");
    } catch (proposalError) {
      setError(proposalError.message || "Could not generate an AI topic proposal.");
    } finally {
      setSaving(false);
    }
  };

  const sendPreviewMessage = async (event) => {
    event.preventDefault();
    const text = previewInput.trim();
    if (
      !text ||
      previewBusy ||
      !moduleId ||
      !topicDraft.objectiveDefinitions.length ||
      (previewMode === "TASK" && !selectedPreviewTask)
    ) return;
    const objectiveKey = selectedPreviewObjectiveKey || topicDraft.objectiveDefinitions[0].key;
    const objectiveIndex = topicDraft.objectiveDefinitions.findIndex((item) => item.key === objectiveKey);
    const objectiveKeys = topicDraft.objectiveDefinitions.map((objective) => objective.key);
    const coreKnowledge = (topicDraft.coreKnowledge || [])
      .filter((item) => item.key !== topicDraft.coreKnowledgeKey);
    if (topicDraft.coreKnowledgeText.trim()) {
      coreKnowledge.push({
        key: topicDraft.coreKnowledgeKey,
        type: "EXPLANATION",
        schemaVersion: 1,
        title: "Core explanation",
        content: topicDraft.coreKnowledgeText.trim(),
        objectiveKeys,
        order: 0,
      });
    }
    const objectiveDefinitions = topicDraft.objectiveDefinitions.map((objective) => ({
      ...objective,
      requiredKnowledge: String(objective.requiredKnowledgeText || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      commonMisconceptions: String(objective.commonMisconceptionsText || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    }));
    const topicPayload = {
      title: topicDraft.title.trim(),
      subject: topicDraft.subject.trim(),
      description: topicDraft.description.trim(),
      estimatedDurationMinutes: topicDraft.estimatedDurationMinutes
        ? Number(topicDraft.estimatedDurationMinutes)
        : null,
      prerequisiteTopicIds: topicDraft.prerequisiteTopicIds,
      tutorInstructions: topicDraft.tutorInstructions,
      validationInstructions: topicDraft.validationInstructions,
      coreKnowledge,
      objectives: objectiveDefinitions.map((objective) => objective.title),
      objectiveDefinitions,
      examples: topicDraft.examples,
      questions: topicDraft.questions,
      exercises: topicDraft.exercises,
      subtopics: topicDraft.subtopics,
    };
    const nextMessages = [...previewMessages, { role: "user", content: text }];
    setPreviewBusy(true);
    setPreviewError("");
    try {
      const { data } = await api.post(
        editingTopicId
          ? `/learning/admin/modules/${moduleId}/topics/${editingTopicId}/preview`
          : `/learning/admin/modules/${moduleId}/topic-preview`,
        {
          message: previewMode === "TASK" && selectedPreviewTask?.type === "CODE"
            ? "Simulated Java submission."
            : text,
          history: previewMessages,
          previousEvidence: previewEvidence,
          scenario: previewScenario,
          objectiveKey: objectiveKeys[objectiveIndex >= 0 ? objectiveIndex : 0],
          topicDraft: topicPayload,
          ...(previewMode === "TASK" ? {
            taskSimulation: {
              type: selectedPreviewTask.type || "CODE",
              exerciseId: selectedPreviewTask._id,
              exerciseIndex: previewTasks.indexOf(selectedPreviewTask),
              submission: selectedPreviewTask.type === "MATH"
                ? { answer: text, reasoning: previewReasoning }
                : selectedPreviewTask.type === "CODE"
                  ? { code: previewInput }
                  : { response: text },
            },
          } : {}),
        },
      );
      setPreviewMessages([
        ...nextMessages,
        { role: "assistant", content: data.preview.reply },
      ]);
      setPreviewEvidence((current) => [...current, ...data.preview.evidence]);
      setPreviewResult(data.preview);
      setPreviewInput("");
      setPreviewReasoning("");
    } catch (requestError) {
      setPreviewError(requestError.message || "The tutor preview could not respond. Try again.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const resetTutorPreview = (scenario = previewScenario, objectiveKey = previewObjectiveKey) => {
    setPreviewScenario(scenario);
    setPreviewObjectiveKey(objectiveKey);
    setPreviewMessages([]);
    setPreviewEvidence([]);
    setPreviewResult(null);
    setPreviewError("");
    setPreviewInput("");
    setPreviewReasoning("");
  };

  const editTopic = (topic) => {
    setAdminPage("topics-editor");
    setEditingTopicId(String(topic._id));
    setTopicError("");
    setTopicDraft(createTopicDraft(topic));
    setPreviewOpen(false);
    resetTutorPreview("NO_PRIOR_KNOWLEDGE", topic.objectiveDefinitions?.[0]?.key || "");
  };

  const cancelTopicEdit = () => {
    setEditingTopicId("");
    setTopicError("");
    setTopicDraft(EMPTY_TOPIC);
    setPreviewOpen(false);
    resetTutorPreview("NO_PRIOR_KNOWLEDGE", "");
  };

  const removeTopic = async (topicIdToRemove) => {
    if (!window.confirm("Remove this topic from the current module version? Earlier student versions are preserved.")) return;
    try {
      await api.delete(`/learning/admin/modules/${moduleId}/topics/${topicIdToRemove}`);
      setNotice("Topic removed from the current version.");
      setEditingTopicId("");
      setTopicError("");
      setTopicDraft(EMPTY_TOPIC);
      await loadModule(moduleId);
      await loadAdminData();
      setAdminPage("topics");
    } catch (topicError) {
      setError(topicError.message || "Could not remove this topic.");
    }
  };

  const moveTopic = async (topicIndex, offset) => {
    const topics = [...(moduleForm.topics || [])];
    const destination = topicIndex + offset;
    if (destination < 0 || destination >= topics.length) return;
    [topics[topicIndex], topics[destination]] = [topics[destination], topics[topicIndex]];
    try {
      await api.put(`/learning/admin/modules/${moduleId}/topics/order`, {
        topicIds: topics.map((topic) => topic._id),
      });
      await loadModule(moduleId, "topics");
    } catch (topicError) {
      setError(topicError.message || "Could not reorder topics.");
    }
  };

  if (loading) return <div className="learning-loading" role="status">Loading learning management…</div>;

  return (
    <div className="learning-center learning-admin-center">
      <header className="learning-heading">
        <div>
          <p className="learning-eyebrow">Thrive management</p>
          <h1>Thrive management</h1>
          <p>Create courses, their modules, and objective-based topics.</p>
        </div>
        <BookOpen size={24} aria-hidden="true" />
      </header>
      {error && <p className="learning-alert learning-alert-error" role="alert">{error}</p>}
      {notice && <p className="learning-alert learning-alert-success" role="status">{notice}</p>}

      <nav className="learning-step-navigation" aria-label="Thrive management pages">
        <button
          className={adminPage === "courses" ? "is-active" : ""}
          onClick={() => setAdminPage("courses")}
          type="button"
        >Courses</button>
        <button
          className={adminPage === "modules" ? "is-active" : ""}
          disabled={!selectedProgram}
          onClick={() => setAdminPage("modules")}
          type="button"
        >Modules</button>
        <button
          className={["topics", "topics-editor"].includes(adminPage) ? "is-active" : ""}
          disabled={!moduleId}
          onClick={() => setAdminPage("topics")}
          type="button"
        >Topics</button>
        <button
          className={adminPage === "results" ? "is-active" : ""}
          disabled={
            !moduleId ||
            (moduleForm.evaluationMode || "SELF_EVALUATION") !== "STRICT_EVALUATION"
          }
          title={
            (moduleForm.evaluationMode || "SELF_EVALUATION") === "STRICT_EVALUATION"
              ? "View assessment results"
              : "Results are available for Strict Evaluation modules"
          }
          onClick={() => setAdminPage("results")}
          type="button"
        >Results</button>
      </nav>

      <section className="learning-management-grid">
        {adminPage === "courses" && <div className="learning-panel learning-admin-course-page">
          <div className="learning-panel-title">
            <div>
              <h2>Courses</h2>
              <p>Choose a course to manage its modules and topics.</p>
            </div>
            <button
              className="learning-button"
              disabled={saving || programs.some((program) => program.status === "DRAFT")}
              onClick={() => {
                setSelectedProgramId("");
                setCreatingProgram(true);
                setNewProgram(EMPTY_PROGRAM);
              }}
              type="button"
            >
              Create course
            </button>
          </div>
          {programs.length > 0 && (
            <div className="learning-admin-course-grid" aria-label="Your courses">
              {programs.map((program) => (
                <article className="learning-admin-course-card" key={program._id}>
                  <button
                    className="learning-admin-course-card-main"
                    onClick={() => {
                      setSelectedProgramId(String(program._id));
                      setCreatingProgram(false);
                      setAdminPage("modules");
                    }}
                    type="button"
                  >
                    <span className="learning-status-badge">{program.status}</span>
                    <strong>{program.title}</strong>
                    <span>{program.description}</span>
                    <small>{program.modules?.length || 0} modules</small>
                  </button>
                  <div className="learning-actions">
                    <button
                      className="learning-link-button"
                      aria-label={`Edit ${program.title}`}
                      onClick={() => {
                        setSelectedProgramId(String(program._id));
                        setCreatingProgram(false);
                      }}
                      type="button"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="learning-link-button"
                      aria-label={`Delete ${program.title}`}
                      onClick={() => archiveProgram(program._id)}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!programs.length && !creatingProgram && (
            <p className="learning-empty-state">No courses yet. Create a course to get started.</p>
          )}
          {creatingProgram && <form
            className="learning-form"
            onSubmit={createProgram}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                newProgram.title.trim() &&
                newProgram.description.trim() &&
                !saving
              ) void createProgram();
            }}
          >
            <h3>New course</h3>
            <p className="learning-help">A course can be published after at least one module has been created.</p>
            {programs.some((program) => program.status === "DRAFT") && (
              <p className="learning-field-error" role="status">Finish or delete the unpublished course before creating another.</p>
            )}
            <label className="learning-field">
              Course name
              <input
                required
                maxLength={140}
                disabled={programs.some((program) => program.status === "DRAFT")}
                value={newProgram.title}
                onChange={(event) => setNewProgram({ ...newProgram, title: event.target.value })}
              />
            </label>
            <label className="learning-field">
              Description
              <textarea
                required
                maxLength={4000}
                disabled={programs.some((program) => program.status === "DRAFT")}
                rows={3}
                placeholder="Describe what students will learn."
                value={newProgram.description}
                onChange={(event) => setNewProgram({ ...newProgram, description: event.target.value })}
              />
            </label>
            <button className="learning-button" disabled={saving || programs.some((program) => program.status === "DRAFT")} type="submit">
              {saving ? "Saving…" : "Create course"}
            </button>
            <button
              className="learning-button learning-button-secondary"
              disabled={saving}
              onClick={() => setCreatingProgram(false)}
              type="button"
            >
              Cancel
            </button>
          </form>}

          {selectedProgram && !creatingProgram && (
            <form
              className="learning-form learning-form-divider"
              onSubmit={saveProgram}
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget) &&
                  programForm.title.trim() &&
                  programForm.description.trim() &&
                  !saving &&
                  (programForm.title !== selectedProgram.title ||
                    programForm.description !== selectedProgram.description)
                ) void saveProgram();
              }}
            >
              <div className="learning-panel-title">
                <h3>Course settings</h3>
                <span className="learning-status-badge">{selectedProgram.status}</span>
              </div>
              <label className="learning-field">
                Course name
                <input
                  required
                  value={programForm.title}
                  onChange={(event) => setProgramForm({ ...programForm, title: event.target.value })}
                />
              </label>
              <label className="learning-field">
                Description
                <textarea
                  required
                  rows={3}
                  value={programForm.description}
                  onChange={(event) => setProgramForm({ ...programForm, description: event.target.value })}
                />
              </label>
              <div className="learning-actions">
                <button className="learning-button" disabled={saving} type="submit">
                  <Save size={15} /> Save course
                </button>
                <button
                  className="learning-button learning-button-secondary"
                  disabled={saving || (
                    selectedProgram.status !== "PUBLISHED" &&
                    !(selectedProgram.modules || []).length
                  )}
                  onClick={changeProgramStatus}
                  type="button"
                >
                  {selectedProgram.status === "PUBLISHED" &&
                  (selectedProgram.modules || []).some((module) => module.status !== "PUBLISHED")
                    ? "Publish course updates"
                    : selectedProgram.status === "PUBLISHED"
                      ? "Unpublish course"
                      : "Publish course"}
                </button>
                <button className="learning-button learning-button-secondary" disabled={saving} onClick={archiveProgram} type="button">
                  Delete course
                </button>
              </div>
              {selectedProgram.status !== "PUBLISHED" && !(selectedProgram.modules || []).length && (
                <p className="learning-help">Add a module with at least one objective-based topic before publishing this course.</p>
              )}
            </form>
          )}
        </div>}

        {adminPage !== "courses" && <div className="learning-panel learning-module-admin-panel">
          <div className="learning-panel-title">
            <div>
              <h2>
                {adminPage === "modules"
                  ? `Modules${selectedProgram ? ` for ${selectedProgram.title}` : ""}`
                  : `Topics${moduleId ? ` for ${moduleForm.title}` : ""}`}
              </h2>
              <p>{selectedProgram ? `${selectedProgram.modules.length} module(s) · add each module when you need it` : "Select or create a course first."}</p>
            </div>
          </div>
          {selectedProgram && selectedProgram.modules?.length === 0 && !newModule && (
            <p className="learning-empty-state">No modules yet. Create the first module, then add its topics.</p>
          )}
          {selectedProgram?.modules?.length > 0 && (
            <div className="learning-admin-module-grid">
              {selectedProgram.modules.map((module) => (
                <article className="learning-admin-module-card" key={module._id}>
                  <button
                    className={`learning-admin-module-card-main${String(module._id) === moduleId ? " is-selected" : ""}`}
                    onClick={() => loadModule(module._id, "topics")}
                    type="button"
                  >
                    <small>Module {module.sequence}</small>
                    <strong>{module.title}</strong>
                  </button>
                  <span className="learning-actions">
                    <button className="learning-link-button" aria-label={`Edit ${module.title}`} onClick={() => loadModule(module._id, "modules")} type="button"><Pencil size={14} /></button>
                  </span>
                </article>
              ))}
            </div>
          )}
          {selectedProgram && adminPage !== "courses" && (
            <button
              className="learning-button learning-button-secondary learning-module-add-button"
              disabled={saving || newModule}
              onClick={startNewModule}
              type="button"
            >
              Add module
            </button>
          )}
          {!newModule && !moduleId && (
            <div className="learning-module-placeholder">
              <h3>Create a module</h3>
              <p>Choose an existing module or create one to add its learning topics.</p>
              {selectedProgram && (
                <button className="learning-button" onClick={startNewModule} type="button">
                  Create module
                </button>
              )}
            </div>
          )}
          {(newModule || moduleId) && adminPage === "modules" && (
            <form
              className="learning-form learning-form-divider"
              onSubmit={(event) => {
                if (adminPage !== "modules") {
                  event.preventDefault();
                  return;
                }
                saveModule(event);
              }}
              onBlur={(event) => {
                if (
                  adminPage === "modules" &&
                  !event.currentTarget.contains(event.relatedTarget) &&
                  moduleForm.title?.trim() &&
                  moduleForm.description?.trim() &&
                  !saving
                ) void saveModule();
              }}
            >
              {adminPage === "modules" && (
                <>
                  <div className="learning-panel-title">
                    <h3>{newModule ? "Add a module" : "Edit module"}</h3>
                    {!newModule && <span className="learning-status-badge">{moduleForm.status}</span>}
                  </div>
                  <label className="learning-field">
                    Module name
                    <input
                      required
                      maxLength={160}
                      placeholder="e.g. Components"
                      value={moduleForm.title || ""}
                      onChange={(event) => setModuleForm({ ...moduleForm, title: event.target.value })}
                    />
                  </label>
                  <label className="learning-field">
                    Description
                    <textarea
                      required
                      rows={3}
                      placeholder="Briefly describe this module for students."
                      value={moduleForm.description || ""}
                      onChange={(event) => setModuleForm({ ...moduleForm, description: event.target.value })}
                    />
                  </label>
                  <label className="learning-field">
                    Evaluation mode
                    <select
                      value={moduleForm.evaluationMode || "SELF_EVALUATION"}
                      onChange={(event) => setModuleForm({ ...moduleForm, evaluationMode: event.target.value })}
                    >
                      <option value="SELF_EVALUATION">Self Evaluation (Thrive · paid learning)</option>
                      <option value="STRICT_EVALUATION">Strict Evaluation (Challenges · free assessment)</option>
                    </select>
                  </label>
                  {moduleForm.evaluationMode === "STRICT_EVALUATION" && (
                    <p className="learning-help">
                      Strict Evaluation modules are free assessments published to the Challenges page.
                      Price is forced to 0 and no purchase is required.
                    </p>
                  )}
                  <label className="learning-field">
                    Required for course completion
                    <select
                      value={moduleForm.requiredForCompletion === false ? "no" : "yes"}
                      onChange={(event) => setModuleForm({ ...moduleForm, requiredForCompletion: event.target.value === "yes" })}
                    >
                      <option value="yes">Yes — needed for the course certificate</option>
                      <option value="no">No — optional module</option>
                    </select>
                  </label>
                  {moduleForm.evaluationMode === "STRICT_EVALUATION" && (
                    <div className="learning-field-row">
                      <label className="learning-field">
                        Available from (optional)
                        <input
                          type="datetime-local"
                          value={(moduleForm.scheduleStartAt || "").slice(0, 16)}
                          onChange={(event) => setModuleForm({ ...moduleForm, scheduleStartAt: event.target.value })}
                        />
                      </label>
                      <label className="learning-field">
                        Available until (optional)
                        <input
                          type="datetime-local"
                          value={(moduleForm.scheduleEndAt || "").slice(0, 16)}
                          onChange={(event) => setModuleForm({ ...moduleForm, scheduleEndAt: event.target.value })}
                        />
                      </label>
                    </div>
                  )}
                  <label className="learning-field">
                    Fee (INR)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={moduleForm.evaluationMode === "STRICT_EVALUATION"}
                      value={moduleForm.evaluationMode === "STRICT_EVALUATION" ? 0 : (moduleForm.price ?? 0)}
                      onChange={(event) => setModuleForm({ ...moduleForm, price: event.target.value })}
                    />
                  </label>
                </>
              )}
              {!newModule && adminPage === "results" && (
                <section className="learning-form learning-form-divider learning-strict-results">
                  <div className="learning-panel-title">
                    <div>
                      <h4>Assessment results</h4>
                      <p>Performance for every student who started this Strict Evaluation module.</p>
                    </div>
                    <div className="learning-actions">
                      <button className="learning-button learning-button-small learning-button-secondary" onClick={loadStrictResults} type="button">
                        Refresh
                      </button>
                      <button className="learning-button learning-button-small" onClick={downloadResultsExport} type="button">
                        Download Excel (.xlsx)
                      </button>
                    </div>
                  </div>
                  {resultsLoading && <p className="learning-muted">Loading results…</p>}
                  {strictResults && (
                    <>
                      <div className="learning-stats-row">
                        <div><strong>{strictResults.stats.eligibleParticipants}</strong><span>Participants</span></div>
                        <div><strong>{strictResults.stats.startedAssessments}</strong><span>Started</span></div>
                        <div><strong>{strictResults.stats.completedAssessments}</strong><span>Completed</span></div>
                        {Object.entries(strictResults.stats.levelDistribution || {}).map(([level, count]) => (
                          <div key={level}><strong>{count}</strong><span>{level}</span></div>
                        ))}
                      </div>
                      {strictResults.objectiveAnalysis?.length > 0 && (
                        <table className="learning-results-table">
                          <thead><tr><th>Objective</th><th>Average %</th><th>Below 60%</th></tr></thead>
                          <tbody>
                            {strictResults.objectiveAnalysis.map((entry) => (
                              <tr key={entry.objectiveKey}>
                                <td>{entry.objectiveTitle}</td>
                                <td>{entry.averagePercent}%</td>
                                <td>{entry.weakCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {strictResults.students?.length > 0 && (
                        <table className="learning-results-table">
                          <thead><tr><th>Student</th><th>Email</th><th>Status</th><th>Score</th><th>Level</th></tr></thead>
                          <tbody>
                            {strictResults.students.map((student) => (
                              <tr key={student.attemptId}>
                                <td>{student.name || "—"}</td>
                                <td>{student.email}</td>
                                <td>{student.status}</td>
                                <td>{student.scorePercent === null ? "—" : `${student.scorePercent}%`}</td>
                                <td>{student.overallLevel || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  )}
                </section>
              )}
              {!newModule && false && adminPage === "topics-inline" && ( // legacy editor retired — prompt-first topics-editor is the only topic form
                <section className="learning-form learning-form-divider">
                  <div className="learning-panel-title">
                    <div>
                      <h4>Topics</h4>
                      <p>Add only the topics this module needs.</p>
                    </div>
                    <span className="learning-status-badge">{moduleForm.topics?.length || 0}</span>
                  </div>
                  {!moduleForm.topics?.length && (
                    <p className="learning-empty-state">No topics yet. Add at least one topic before publishing this module.</p>
                  )}
                  {(moduleForm.topics || []).map((topic, index) => (
                    <div className="learning-module-row" key={topic._id}>
                      <button
                        className={editingTopicId === String(topic._id) ? "is-selected" : ""}
                        onClick={() => editTopic(topic)}
                        type="button"
                      >
                        <span>{index + 1}. {topic.title}</span>
                      </button>
                      <span className="learning-actions">
                        <button className="learning-link-button" aria-label="Move topic up" disabled={index === 0} onClick={() => moveTopic(index, -1)} type="button">↑</button>
                        <button className="learning-link-button" aria-label="Move topic down" disabled={index === moduleForm.topics.length - 1} onClick={() => moveTopic(index, 1)} type="button">↓</button>
                        <button className="learning-link-button" onClick={() => removeTopic(String(topic._id))} type="button">Remove</button>
                      </span>
                    </div>
                  ))}
                  <div className="learning-form">
                    <div className="learning-panel-title">
                      <h5>{editingTopicId ? "Edit topic" : "Add a topic"}</h5>
                      <button
                        className="learning-button learning-button-small learning-button-secondary"
                        disabled={saving}
                        onClick={generateTopicProposal}
                        type="button"
                      >
                        Draft with AI
                      </button>
                    </div>
                    {topicError && <p className="learning-field-error" role="alert">{topicError}</p>}
                    <label className="learning-field">
                      Topic title
                      <input
                        maxLength={160}
                        placeholder="e.g. Components, Variables, Network layers"
                        value={topicDraft.title}
                        onChange={(event) => setTopicDraft({ ...topicDraft, title: event.target.value })}
                      />
                    </label>
                    <label className="learning-field">
                      Subject (optional)
                      <input
                        maxLength={100}
                        placeholder="e.g. Computer Networks, Mathematics, Physics"
                        value={topicDraft.subject}
                        onChange={(event) => setTopicDraft({ ...topicDraft, subject: event.target.value })}
                      />
                    </label>
                    <label className="learning-field">
                      Short description
                      <span className="learning-field-required">Required</span>
                      <textarea
                        required
                        rows={2}
                        maxLength={2000}
                        value={topicDraft.description}
                        onChange={(event) => setTopicDraft({ ...topicDraft, description: event.target.value })}
                      />
                    </label>
                    <label className="learning-field">
                      Content type
                      <select
                        value={topicDraft.contentType}
                        onChange={(event) => setTopicDraft({
                          ...topicDraft,
                          contentType: event.target.value,
                        })}
                      >
                        <option value="CONCEPTS">Concepts</option>
                        <option value="MCQS">MCQs</option>
                      </select>
                    </label>
                    {topicDraft.contentType === "CONCEPTS" &&
                      moduleForm.evaluationMode === "SELF_EVALUATION" && (
                      <fieldset className="learning-fieldset">
                        <legend>Self Evaluation · Concepts configuration</legend>
                        <label className="learning-field">
                          Key concepts to understand (one per line)
                          <textarea rows={3} value={topicDraft.selfConceptConfig.keyConceptsText || ""}
                            onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, keyConceptsText: event.target.value } })} />
                        </label>
                        <label className="learning-field">
                          Expected knowledge (one per line)
                          <textarea rows={3} value={topicDraft.selfConceptConfig.expectedKnowledgeText || ""}
                            onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, expectedKnowledgeText: event.target.value } })} />
                        </label>
                        <label className="learning-field">
                          Important definitions (optional, one per line)
                          <textarea rows={2} value={topicDraft.selfConceptConfig.importantDefinitionsText || ""}
                            onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, importantDefinitionsText: event.target.value } })} />
                        </label>
                        <label className="learning-field">
                          Real-life examples (optional, one per line)
                          <textarea rows={2} value={topicDraft.selfConceptConfig.realLifeExamplesText || ""}
                            onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, realLifeExamplesText: event.target.value } })} />
                        </label>
                        <label className="learning-field">
                          Common misconceptions (optional, one per line)
                          <textarea rows={2} value={topicDraft.selfConceptConfig.commonMisconceptionsText || ""}
                            onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, commonMisconceptionsText: event.target.value } })} />
                        </label>
                      </fieldset>
                    )}
                    {topicDraft.contentType === "MCQS" &&
                      moduleForm.evaluationMode === "SELF_EVALUATION" && (
                      <fieldset className="learning-fieldset">
                        <legend>Self Evaluation · MCQ configuration</legend>
                        <label className="learning-field">
                          Question coverage (what the questions must cover)
                          <textarea rows={3} maxLength={4000} value={topicDraft.selfMcqConfig.questionCoverage || ""}
                            onChange={(event) => setTopicDraft({ ...topicDraft, selfMcqConfig: { ...topicDraft.selfMcqConfig, questionCoverage: event.target.value } })} />
                        </label>
                        <label className="learning-field">
                          Questions per session
                          <input type="number" min="1" max="50" value={topicDraft.selfMcqConfig.questionsPerSession ?? 5}
                            onChange={(event) => setTopicDraft({ ...topicDraft, selfMcqConfig: { ...topicDraft.selfMcqConfig, questionsPerSession: event.target.value } })} />
                        </label>
                        <label className="learning-field">
                          Difficulty range
                          <select value={topicDraft.selfMcqConfig.difficultyRange || "EASY_TO_MEDIUM"}
                            onChange={(event) => setTopicDraft({ ...topicDraft, selfMcqConfig: { ...topicDraft.selfMcqConfig, difficultyRange: event.target.value } })}>
                            <option value="EASY_TO_MEDIUM">Easy to medium</option>
                            <option value="EASY_TO_HARD">Easy to hard</option>
                            <option value="MEDIUM_TO_HARD">Medium to hard</option>
                          </select>
                        </label>
                      </fieldset>
                    )}
                    {topicDraft.contentType === "CONCEPTS" &&
                      moduleForm.evaluationMode === "STRICT_EVALUATION" && (
                      <fieldset className="learning-fieldset">
                        <legend>Strict Evaluation · Concepts configuration</legend>
                        <label className="learning-field">
                          Expected knowledge indicators (one per line)
                          <textarea rows={3} value={topicDraft.strictConceptConfig.expectedKnowledgeIndicatorsText || ""}
                            onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, expectedKnowledgeIndicatorsText: event.target.value } })} />
                        </label>
                        <label className="learning-field">
                          Evaluation criteria (one per line)
                          <textarea rows={3} value={topicDraft.strictConceptConfig.evaluationCriteriaText || ""}
                            onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, evaluationCriteriaText: event.target.value } })} />
                        </label>
                        <label className="learning-field">
                          Level classification criteria
                          <textarea rows={4} maxLength={8000} value={topicDraft.strictConceptConfig.levelClassificationCriteria || ""}
                            placeholder="Describe what separates Beginner, Developing, Intermediate, Advanced and Expert."
                            onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, levelClassificationCriteria: event.target.value } })} />
                        </label>
                        <div className="learning-field-row">
                          <label className="learning-field">
                            Number of evaluation questions
                            <input type="number" min="1" max="60" value={topicDraft.strictConceptConfig.questionCount ?? 5}
                              onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, questionCount: event.target.value } })} />
                          </label>
                          <label className="learning-field">
                            Time limit (minutes, optional)
                            <input type="number" min="1" max="600" value={topicDraft.strictConceptConfig.timeLimitMinutes ?? ""}
                              onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, timeLimitMinutes: event.target.value } })} />
                          </label>
                        </div>
                      </fieldset>
                    )}
                    {topicDraft.contentType === "MCQS" &&
                      moduleForm.evaluationMode === "STRICT_EVALUATION" && (
                      <fieldset className="learning-fieldset">
                        <legend>Strict Evaluation · MCQ configuration</legend>
                        <div className="learning-field-row">
                          <label className="learning-field">
                            Number of questions
                            <input type="number" min="1" max="200" value={topicDraft.strictMcqConfig.questionCount ?? 10}
                              onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, questionCount: event.target.value } })} />
                          </label>
                          <label className="learning-field">
                            Difficulty distribution
                            <select value={topicDraft.strictMcqConfig.difficultyDistribution || "BALANCED"}
                              onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, difficultyDistribution: event.target.value } })}>
                              <option value="EASY">Mostly easy</option>
                              <option value="BALANCED">Balanced</option>
                              <option value="CHALLENGING">Mostly challenging</option>
                            </select>
                          </label>
                        </div>
                        <div className="learning-field-row">
                          <label className="learning-field">
                            Time limit (minutes, optional)
                            <input type="number" min="1" max="600" value={topicDraft.strictMcqConfig.timeLimitMinutes ?? ""}
                              onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, timeLimitMinutes: event.target.value } })} />
                          </label>
                          <label className="learning-field">
                            Negative marking (%)
                            <input type="number" min="0" max="100" value={topicDraft.strictMcqConfig.negativeMarkingPercent ?? 0}
                              onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, negativeMarkingPercent: event.target.value } })} />
                          </label>
                        </div>
                        <label className="learning-field">
                          Evaluation criteria (one per line)
                          <textarea rows={2} value={topicDraft.strictMcqConfig.evaluationCriteriaText || ""}
                            onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, evaluationCriteriaText: event.target.value } })} />
                        </label>
                      </fieldset>
                    )}
                    <label className="learning-field">
                      Estimated learning time (minutes, optional)
                      <input
                        type="number"
                        min="1"
                        max="100000"
                        step="1"
                        value={topicDraft.estimatedDurationMinutes}
                        onChange={(event) => setTopicDraft({
                          ...topicDraft,
                          estimatedDurationMinutes: event.target.value,
                        })}
                      />
                    </label>
                    {!!moduleForm.topics?.length && (
                      <label className="learning-field">
                        Prerequisite topics (optional)
                        <select
                          multiple
                          value={topicDraft.prerequisiteTopicIds}
                          onChange={(event) => setTopicDraft({
                            ...topicDraft,
                            prerequisiteTopicIds: [...event.target.selectedOptions].map((option) => option.value),
                          })}
                        >
                          {moduleForm.topics
                            .filter((topic) => String(topic._id) !== editingTopicId)
                            .map((topic) => (
                              <option key={topic._id} value={String(topic._id)}>{topic.title}</option>
                            ))}
                        </select>
                        <small className="learning-help">Prerequisites must be earlier in the published topic order.</small>
                      </label>
                    )}
                    <label className="learning-field">
                      Core knowledge
                      <textarea
                        rows={5}
                        maxLength={12000}
                        placeholder="Add the approved explanation, definitions, examples, formulas, or procedures the tutor may use."
                        value={topicDraft.coreKnowledgeText}
                        onChange={(event) => setTopicDraft({ ...topicDraft, coreKnowledgeText: event.target.value })}
                      />
                    </label>
                    <label className="learning-field">
                      How should the AI tutor teach this topic? (optional)
                      <textarea
                        rows={3}
                        maxLength={4000}
                        placeholder="For example: use a simple analogy, then ask the student to explain it back."
                        value={topicDraft.tutorInstructions}
                        onChange={(event) => setTopicDraft({ ...topicDraft, tutorInstructions: event.target.value })}
                      />
                    </label>
                    <label className="learning-field">
                      What should the AI look for in answers? (optional)
                      <textarea
                        rows={3}
                        maxLength={4000}
                        placeholder="For example: look for the key idea, explain what is missing, and offer a hint."
                        value={topicDraft.validationInstructions}
                        onChange={(event) => setTopicDraft({ ...topicDraft, validationInstructions: event.target.value })}
                      />
                    </label>
                    <div className="learning-topic-editor-group">
                      <div className="learning-panel-title">
                        <div>
                          <h5>Fixed learning objectives</h5>
                          <p>Every enrolled student must demonstrate each objective in this order.</p>
                        </div>
                        <button
                          className="learning-button learning-button-small learning-button-secondary"
                          onClick={() => setTopicDraft({
                            ...topicDraft,
                            objectiveDefinitions: [
                              ...topicDraft.objectiveDefinitions,
                              createObjectiveDraft(topicDraft.objectiveDefinitions.length),
                            ],
                          })}
                          type="button"
                        >
                          Add objective
                        </button>
                      </div>
                      {topicDraft.objectiveDefinitions.map((objective, index) => (
                        <div className="learning-topic-editor-card" key={objective.key}>
                          <div className="learning-panel-title">
                            <strong>Objective {index + 1}</strong>
                            <span className="learning-actions">
                              <button
                                aria-label={`Move objective ${index + 1} up`}
                                className="learning-link-button"
                                disabled={index === 0}
                                onClick={() => {
                                  const definitions = [...topicDraft.objectiveDefinitions];
                                  [definitions[index - 1], definitions[index]] = [
                                    definitions[index],
                                    definitions[index - 1],
                                  ];
                                  setTopicDraft({ ...topicDraft, objectiveDefinitions: definitions });
                                }}
                                type="button"
                              >
                                ↑
                              </button>
                              <button
                                aria-label={`Move objective ${index + 1} down`}
                                className="learning-link-button"
                                disabled={index === topicDraft.objectiveDefinitions.length - 1}
                                onClick={() => {
                                  const definitions = [...topicDraft.objectiveDefinitions];
                                  [definitions[index], definitions[index + 1]] = [
                                    definitions[index + 1],
                                    definitions[index],
                                  ];
                                  setTopicDraft({ ...topicDraft, objectiveDefinitions: definitions });
                                }}
                                type="button"
                              >
                                ↓
                              </button>
                              <button
                                className="learning-link-button"
                                onClick={() => setTopicDraft({
                                  ...topicDraft,
                                  objectiveDefinitions: topicDraft.objectiveDefinitions
                                    .filter((_item, itemIndex) => itemIndex !== index),
                                })}
                                type="button"
                              >
                                Remove
                              </button>
                            </span>
                          </div>
                          <label className="learning-field">
                            Objective title
                            <input
                              required
                              maxLength={160}
                              value={objective.title}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                objectiveDefinitions: updateTopicItem(
                                  topicDraft.objectiveDefinitions,
                                  index,
                                  "title",
                                  event.target.value,
                                ),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            What must the student understand?
                            <textarea
                              required
                              rows={2}
                              maxLength={2000}
                              value={objective.description || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                objectiveDefinitions: updateTopicItem(
                                  topicDraft.objectiveDefinitions,
                                  index,
                                  "description",
                                  event.target.value,
                                ),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            Expected student outcome
                            <textarea
                              required
                              rows={2}
                              maxLength={2000}
                              value={objective.expectedOutcome || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                objectiveDefinitions: updateTopicItem(
                                  topicDraft.objectiveDefinitions,
                                  index,
                                  "expectedOutcome",
                                  event.target.value,
                                ),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            Required knowledge (one item per line)
                            <textarea
                              rows={2}
                              value={objective.requiredKnowledgeText || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                objectiveDefinitions: updateTopicItem(
                                  topicDraft.objectiveDefinitions,
                                  index,
                                  "requiredKnowledgeText",
                                  event.target.value,
                                ),
                              })}
                            />
                          </label>
                          <div className="learning-topic-editor-group">
                            <div className="learning-panel-title">
                              <h6>Mastery criteria</h6>
                              <button
                                className="learning-button learning-button-small learning-button-secondary"
                                onClick={() => setTopicDraft({
                                  ...topicDraft,
                                  objectiveDefinitions: updateTopicItem(
                                    topicDraft.objectiveDefinitions,
                                    index,
                                    "masteryCriteria",
                                    [...objective.masteryCriteria, {
                                      key: `criterion-${crypto.randomUUID()}`,
                                      description: "",
                                      evaluationMethod: "EXPLANATION",
                                      requiredEvidenceCount: 1,
                                    }],
                                  ),
                                })}
                                type="button"
                              >
                                Add criterion
                              </button>
                            </div>
                            {(objective.masteryCriteria || []).map((criterion, criterionIndex) => (
                              <div className="learning-topic-editor-card" key={criterion.key}>
                                <label className="learning-field">
                                  What evidence demonstrates this criterion?
                                  <textarea
                                    required
                                    rows={2}
                                    maxLength={1000}
                                    value={criterion.description}
                                    onChange={(event) => {
                                      const criteria = updateTopicItem(
                                        objective.masteryCriteria,
                                        criterionIndex,
                                        "description",
                                        event.target.value,
                                      );
                                      setTopicDraft({
                                        ...topicDraft,
                                        objectiveDefinitions: updateTopicItem(
                                          topicDraft.objectiveDefinitions,
                                          index,
                                          "masteryCriteria",
                                          criteria,
                                        ),
                                      });
                                    }}
                                  />
                                </label>
                                <label className="learning-field">
                                  Evaluation method
                                  <select
                                    value={criterion.evaluationMethod || "EXPLANATION"}
                                    onChange={(event) => {
                                      const criteria = updateTopicItem(
                                        objective.masteryCriteria,
                                        criterionIndex,
                                        "evaluationMethod",
                                        event.target.value,
                                      );
                                      setTopicDraft({
                                        ...topicDraft,
                                        objectiveDefinitions: updateTopicItem(
                                          topicDraft.objectiveDefinitions,
                                          index,
                                          "masteryCriteria",
                                          criteria,
                                        ),
                                      });
                                    }}
                                  >
                                    {[
                                      ["EXPLANATION", "Explain in own words"],
                                      ["IDENTIFICATION", "Identify a concept"],
                                      ["PREDICTION", "Predict an outcome"],
                                      ["COMPARISON", "Compare concepts"],
                                      ["APPLICATION", "Apply to a new scenario"],
                                      ["ANALYSIS", "Analyse a case"],
                                      ["CALCULATION", "Solve with reasoning"],
                                      ["DIAGRAM", "Interpret a diagram"],
                                      ["PROCEDURE", "Explain a sequence"],
                                      ["CODE", "Write code"],
                                      ["DEBUGGING", "Debug code"],
                                      ["PRACTICAL", "Perform a practical task"],
                                    ].map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="learning-field">
                                  Independent evidence required
                                  <select
                                    value={criterion.requiredEvidenceCount || 1}
                                    onChange={(event) => {
                                      const criteria = updateTopicItem(
                                        objective.masteryCriteria,
                                        criterionIndex,
                                        "requiredEvidenceCount",
                                        Number(event.target.value),
                                      );
                                      setTopicDraft({
                                        ...topicDraft,
                                        objectiveDefinitions: updateTopicItem(
                                          topicDraft.objectiveDefinitions,
                                          index,
                                          "masteryCriteria",
                                          criteria,
                                        ),
                                      });
                                    }}
                                  >
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3</option>
                                  </select>
                                </label>
                                {objective.masteryCriteria.length > 1 && (
                                  <button
                                    className="learning-link-button"
                                    onClick={() => setTopicDraft({
                                      ...topicDraft,
                                      objectiveDefinitions: updateTopicItem(
                                        topicDraft.objectiveDefinitions,
                                        index,
                                        "masteryCriteria",
                                        objective.masteryCriteria.filter(
                                          (_item, itemIndex) => itemIndex !== criterionIndex,
                                        ),
                                      ),
                                    })}
                                    type="button"
                                  >
                                    Remove criterion
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <label className="learning-field">
                            Common misconceptions (optional, one per line)
                            <textarea
                              rows={2}
                              value={objective.commonMisconceptionsText || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                objectiveDefinitions: updateTopicItem(
                                  topicDraft.objectiveDefinitions,
                                  index,
                                  "commonMisconceptionsText",
                                  event.target.value,
                                ),
                              })}
                            />
                          </label>
                          <details className="learning-advanced-section">
                            <summary>Preview tutoring and evaluation</summary>
                            <div className="learning-topic-editor-card">
                              <strong>{objective.title || "Objective title"}</strong>
                              <p>{objective.expectedOutcome || "Add an expected outcome to preview the tutor focus."}</p>
                              <small>
                                The tutor will ground explanations in approved core knowledge and evaluate:
                                {" "}
                                {(objective.masteryCriteria || [])
                                  .map((criterion) => `${criterion.evaluationMethod || "EXPLANATION"} — ${criterion.description || "criterion not defined"}`)
                                  .join("; ")}
                              </small>
                            </div>
                          </details>
                          {index > 0 && (
                            <fieldset className="learning-field">
                              <legend>Additional earlier objective prerequisites</legend>
                              {topicDraft.objectiveDefinitions.slice(0, index).map((prior) => (
                                <label className="learning-checkbox-field" key={prior.key}>
                                  <input
                                    type="checkbox"
                                    checked={(objective.prerequisites || []).includes(prior.key)}
                                    onChange={(event) => setTopicDraft({
                                      ...topicDraft,
                                      objectiveDefinitions: updateTopicItem(
                                        topicDraft.objectiveDefinitions,
                                        index,
                                        "prerequisites",
                                        event.target.checked
                                          ? [...new Set([...(objective.prerequisites || []), prior.key])]
                                          : (objective.prerequisites || []).filter((key) => key !== prior.key),
                                      ),
                                    })}
                                  />
                                  {prior.title || "Untitled objective"}
                                </label>
                              ))}
                            </fieldset>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="learning-topic-editor-group">
                      <div className="learning-panel-title">
                        <h5>Examples (optional)</h5>
                        <button
                          className="learning-button learning-button-small learning-button-secondary"
                          onClick={() => setTopicDraft({
                            ...topicDraft,
                            examples: [...topicDraft.examples, { title: "", explanation: "", code: "", language: "" }],
                          })}
                          type="button"
                        >
                          Add example
                        </button>
                      </div>
                      {topicDraft.examples.map((example, index) => (
                        <div className="learning-topic-editor-card" key={`example-${index}`}>
                          <label className="learning-field">
                            Example title
                            <input
                              value={example.title || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                examples: updateTopicItem(topicDraft.examples, index, "title", event.target.value),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            Explanation or example
                            <textarea
                              rows={2}
                              value={example.explanation || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                examples: updateTopicItem(topicDraft.examples, index, "explanation", event.target.value),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            Code sample (optional)
                            <textarea
                              rows={4}
                              value={example.code || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                examples: updateTopicItem(topicDraft.examples, index, "code", event.target.value),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            Code language (optional)
                            <input
                              placeholder="e.g. Java, JavaScript, Python"
                              value={example.language || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                examples: updateTopicItem(topicDraft.examples, index, "language", event.target.value),
                              })}
                            />
                          </label>
                          <button
                            className="learning-link-button"
                            onClick={() => setTopicDraft({
                              ...topicDraft,
                              examples: topicDraft.examples.filter((_item, itemIndex) => itemIndex !== index),
                            })}
                            type="button"
                          >
                            Remove example
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="learning-topic-editor-group">
                      <div className="learning-panel-title">
                        <h5>Exercises and activities (optional)</h5>
                        <button
                          className="learning-button learning-button-small learning-button-secondary"
                          onClick={() => setTopicDraft({
                            ...topicDraft,
                            exercises: [...topicDraft.exercises, {
                              type: "ACTIVITY",
                              title: "",
                              instructions: "",
                              starterCode: "",
                              language: "java",
                              variables: {},
                              variablesText: "",
                              tests: [],
                            }],
                          })}
                          type="button"
                        >
                          Add activity
                        </button>
                      </div>
                      {topicDraft.exercises.map((exercise, index) => (
                        <div className="learning-topic-editor-card" key={`exercise-${index}`}>
                          <label className="learning-field">
                            Activity type
                            <select
                              value={exercise.type || "CODE"}
                              onChange={(event) => {
                                const type = event.target.value;
                                setTopicDraft({
                                  ...topicDraft,
                                  exercises: updateTopicItem(
                                    topicDraft.exercises,
                                    index,
                                    "type",
                                    type,
                                  ).map((item, itemIndex) => itemIndex === index
                                    ? { ...item, evaluationMethod: type === "MATH" ? "CALCULATION" : item.evaluationMethod || "EXPLANATION" }
                                    : item),
                                });
                              }}
                            >
                              <option value="ACTIVITY">Written or discussion activity</option>
                              <option value="MATH">Mathematics problem</option>
                              <option value="CODE">Coding exercise</option>
                            </select>
                          </label>
                          <label className="learning-field">
                            Activity title
                            <input
                              value={exercise.title || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                exercises: updateTopicItem(topicDraft.exercises, index, "title", event.target.value),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            Instructions
                            <textarea
                              rows={3}
                              value={exercise.instructions || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                exercises: updateTopicItem(topicDraft.exercises, index, "instructions", event.target.value),
                              })}
                            />
                          </label>
                          {!!topicDraft.objectiveDefinitions.length && (
                            <fieldset className="learning-field">
                              <legend>Assesses these objectives</legend>
                              {topicDraft.objectiveDefinitions.map((objective) => (
                                <label className="learning-checkbox-field" key={objective.key}>
                                  <input
                                    type="checkbox"
                                    checked={(exercise.objectiveKeys || []).includes(objective.key)}
                                    onChange={(event) => {
                                      const objectiveKeys = event.target.checked
                                        ? [...new Set([...(exercise.objectiveKeys || []), objective.key])]
                                        : (exercise.objectiveKeys || []).filter((key) => key !== objective.key);
                                      const allowedCriteria = topicDraft.objectiveDefinitions
                                        .filter((item) => objectiveKeys.includes(item.key))
                                        .flatMap((item) => item.masteryCriteria.map((criterion) => criterion.key));
                                      const nextExercise = {
                                        ...exercise,
                                        objectiveKeys,
                                        criterionKeys: (exercise.criterionKeys || [])
                                          .filter((key) => allowedCriteria.includes(key)),
                                      };
                                      setTopicDraft({
                                        ...topicDraft,
                                        exercises: updateTopicItem(topicDraft.exercises, index, "objectiveKeys", nextExercise.objectiveKeys)
                                          .map((item, itemIndex) => itemIndex === index ? nextExercise : item),
                                      });
                                    }}
                                  />
                                  {objective.title || "Untitled objective"}
                                </label>
                              ))}
                            </fieldset>
                          )}
                          {exercise.type !== "CODE" && (
                            <>
                              <label className="learning-field">
                                Evaluation method
                                <select
                                  value={exercise.evaluationMethod || (exercise.type === "MATH" ? "CALCULATION" : "EXPLANATION")}
                                  onChange={(event) => setTopicDraft({
                                    ...topicDraft,
                                    exercises: updateTopicItem(topicDraft.exercises, index, "evaluationMethod", event.target.value),
                                  })}
                                >
                                  <option value="EXPLANATION">Explain a concept</option>
                                  <option value="PREDICTION">Predict an outcome</option>
                                  <option value="IDENTIFICATION">Identify an issue</option>
                                  <option value="COMPARISON">Compare concepts</option>
                                  <option value="APPLICATION">Apply knowledge</option>
                                  <option value="ANALYSIS">Analyse a scenario</option>
                                  <option value="CALCULATION">Calculate or show working</option>
                                  <option value="PROCEDURE">Explain a procedure</option>
                                </select>
                              </label>
                              <fieldset className="learning-field">
                                <legend>Mastery criteria assessed</legend>
                                {topicDraft.objectiveDefinitions
                                  .filter((objective) => (exercise.objectiveKeys || []).includes(objective.key))
                                  .flatMap((objective) => objective.masteryCriteria.map((criterion) => (
                                    <label className="learning-checkbox-field" key={criterion.key}>
                                      <input
                                        type="checkbox"
                                        checked={(exercise.criterionKeys || []).includes(criterion.key)}
                                        onChange={(event) => {
                                          const criterionKeys = event.target.checked
                                            ? [...new Set([...(exercise.criterionKeys || []), criterion.key])]
                                            : (exercise.criterionKeys || []).filter((key) => key !== criterion.key);
                                          setTopicDraft({
                                            ...topicDraft,
                                            exercises: updateTopicItem(topicDraft.exercises, index, "criterionKeys", criterionKeys),
                                          });
                                        }}
                                      />
                                      {criterion.description}
                                    </label>
                                  )))}
                                {!(exercise.objectiveKeys || []).length && (
                                  <small className="learning-help">Link an objective first to choose its criteria.</small>
                                )}
                              </fieldset>
                            </>
                          )}
                          {exercise.type === "MATH" && (
                            <>
                              <label className="learning-field">
                                Formula values (symbol=value, one per line)
                                <textarea
                                  rows={2}
                                  value={exercise.variablesText ?? formatMathVariables(exercise.variables)}
                                  onChange={(event) => {
                                    const variablesText = event.target.value;
                                    setTopicDraft({
                                      ...topicDraft,
                                      exercises: updateTopicItem(
                                        topicDraft.exercises,
                                        index,
                                        "variables",
                                        parseMathVariables(variablesText),
                                      ).map((item, itemIndex) => itemIndex === index
                                        ? { ...item, variablesText }
                                        : item),
                                    });
                                  }}
                                />
                                <small className="learning-help">Answers may use these symbols, for example distance / time. Only numeric substitutions are supported.</small>
                              </label>
                              <label className="learning-field">
                                Expected answer
                                <input
                                  maxLength={200}
                                  value={exercise.expectedAnswer || ""}
                                  onChange={(event) => setTopicDraft({
                                    ...topicDraft,
                                    exercises: updateTopicItem(topicDraft.exercises, index, "expectedAnswer", event.target.value),
                                  })}
                                />
                              </label>
                              <label className="learning-field">
                                Accepted equivalent answers (one per line)
                                <textarea
                                  rows={2}
                                  value={(exercise.acceptedAnswers || []).join("\n")}
                                  onChange={(event) => setTopicDraft({
                                    ...topicDraft,
                                    exercises: updateTopicItem(
                                      topicDraft.exercises,
                                      index,
                                      "acceptedAnswers",
                                      event.target.value.split(/\r?\n/).map((answer) => answer.trim()).filter(Boolean),
                                    ),
                                  })}
                                />
                              </label>
                              <div className="learning-preview-options">
                                <label className="learning-field">
                                  Expected unit (optional)
                                  <input
                                    maxLength={40}
                                    value={exercise.unit || ""}
                                    onChange={(event) => setTopicDraft({
                                      ...topicDraft,
                                      exercises: updateTopicItem(topicDraft.exercises, index, "unit", event.target.value),
                                    })}
                                  />
                                </label>
                                <label className="learning-field">
                                  Numeric tolerance
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={exercise.numericTolerance ?? 0.000001}
                                    onChange={(event) => setTopicDraft({
                                      ...topicDraft,
                                      exercises: updateTopicItem(
                                        topicDraft.exercises,
                                        index,
                                        "numericTolerance",
                                        Number(event.target.value),
                                      ),
                                    })}
                                  />
                                </label>
                              </div>
                              <label className="learning-checkbox-field">
                                <input
                                  type="checkbox"
                                  checked={exercise.requireReasoning || false}
                                  onChange={(event) => setTopicDraft({
                                    ...topicDraft,
                                    exercises: updateTopicItem(topicDraft.exercises, index, "requireReasoning", event.target.checked),
                                  })}
                                />
                                Require written reasoning as well as a correct result
                              </label>
                              <label className="learning-checkbox-field">
                                <input
                                  type="checkbox"
                                  checked={exercise.requireUnit || false}
                                  onChange={(event) => setTopicDraft({
                                    ...topicDraft,
                                    exercises: updateTopicItem(topicDraft.exercises, index, "requireUnit", event.target.checked),
                                  })}
                                />
                                Require the answer to include a unit
                              </label>
                            </>
                          )}
                          {exercise.type === "CODE" && (
                            <>
                              <label className="learning-field">
                                Starting code (optional)
                                <textarea
                                  rows={4}
                                  value={exercise.starterCode || ""}
                                  onChange={(event) => setTopicDraft({
                                    ...topicDraft,
                                    exercises: updateTopicItem(topicDraft.exercises, index, "starterCode", event.target.value),
                                  })}
                                />
                              </label>
                              <details className="learning-advanced-section">
                                <summary>Java test cases (optional)</summary>
                                {(exercise.tests || []).map((testCase, testIndex) => (
                                  <div className="learning-topic-editor-card" key={`test-${testIndex}`}>
                                    <label className="learning-field">
                                      Input
                                      <textarea
                                        rows={2}
                                        value={testCase.input || ""}
                                        onChange={(event) => {
                                          const tests = updateTopicItem(exercise.tests, testIndex, "input", event.target.value);
                                          setTopicDraft({
                                            ...topicDraft,
                                            exercises: updateTopicItem(topicDraft.exercises, index, "tests", tests),
                                          });
                                        }}
                                      />
                                    </label>
                                    <label className="learning-field">
                                      Expected output
                                      <textarea
                                        rows={2}
                                        value={testCase.expectedOutput || ""}
                                        onChange={(event) => {
                                          const tests = updateTopicItem(exercise.tests, testIndex, "expectedOutput", event.target.value);
                                          setTopicDraft({
                                            ...topicDraft,
                                            exercises: updateTopicItem(topicDraft.exercises, index, "tests", tests),
                                          });
                                        }}
                                      />
                                    </label>
                                    <label className="learning-field learning-checkbox-field">
                                      <input
                                        type="checkbox"
                                        checked={testCase.visible || false}
                                        onChange={(event) => {
                                          const tests = updateTopicItem(exercise.tests, testIndex, "visible", event.target.checked);
                                          setTopicDraft({
                                            ...topicDraft,
                                            exercises: updateTopicItem(topicDraft.exercises, index, "tests", tests),
                                          });
                                        }}
                                      />
                                      Show this test to students
                                    </label>
                                    <button
                                      className="learning-link-button"
                                      onClick={() => setTopicDraft({
                                        ...topicDraft,
                                        exercises: updateTopicItem(
                                          topicDraft.exercises,
                                          index,
                                          "tests",
                                          exercise.tests.filter((_item, itemIndex) => itemIndex !== testIndex),
                                        ),
                                      })}
                                      type="button"
                                    >
                                      Remove test
                                    </button>
                                  </div>
                                ))}
                                <button
                                  className="learning-button learning-button-small learning-button-secondary"
                                  onClick={() => setTopicDraft({
                                    ...topicDraft,
                                    exercises: updateTopicItem(
                                      topicDraft.exercises,
                                      index,
                                      "tests",
                                      [...(exercise.tests || []), { input: "", expectedOutput: "", visible: false }],
                                    ),
                                  })}
                                  type="button"
                                >
                                  Add test case
                                </button>
                              </details>
                            </>
                          )}
                          <button
                            className="learning-link-button"
                            onClick={() => setTopicDraft({
                              ...topicDraft,
                              exercises: topicDraft.exercises.filter((_item, itemIndex) => itemIndex !== index),
                            })}
                            type="button"
                          >
                            Remove activity
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="learning-topic-editor-group">
                      <div className="learning-panel-title">
                        <h5>Subtopics (optional)</h5>
                        <button
                          className="learning-button learning-button-small learning-button-secondary"
                          onClick={() => setTopicDraft({
                            ...topicDraft,
                            subtopics: [...topicDraft.subtopics, { title: "", explanation: "" }],
                          })}
                          type="button"
                        >
                          Add subtopic
                        </button>
                      </div>
                      {topicDraft.subtopics.map((subtopic, index) => (
                        <div className="learning-topic-editor-card" key={`subtopic-${index}`}>
                          <label className="learning-field">
                            Subtopic title
                            <input
                              value={subtopic.title || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                subtopics: updateTopicItem(topicDraft.subtopics, index, "title", event.target.value),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            Explanation
                            <textarea
                              rows={2}
                              value={subtopic.explanation || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                subtopics: updateTopicItem(topicDraft.subtopics, index, "explanation", event.target.value),
                              })}
                            />
                          </label>
                          <button
                            className="learning-link-button"
                            onClick={() => setTopicDraft({
                              ...topicDraft,
                              subtopics: topicDraft.subtopics.filter((_item, itemIndex) => itemIndex !== index),
                            })}
                            type="button"
                          >
                            Remove subtopic
                          </button>
                        </div>
                      ))}
                    </div>
                    <section className="learning-topic-editor-group learning-preview">
                      <div className="learning-panel-title">
                        <div>
                          <h5>Live tutor preview</h5>
                          <p>Simulate a learner using this unsaved topic draft. Preview activity never changes student progress.</p>
                        </div>
                        <button
                          className="learning-button learning-button-small learning-button-secondary"
                          disabled={previewBusy || !topicDraft.objectiveDefinitions.length}
                          onClick={() => {
                            setPreviewOpen((open) => !open);
                            resetTutorPreview();
                          }}
                          type="button"
                        >
                          {previewOpen ? "Close preview" : "Open preview"}
                        </button>
                      </div>
                      {previewOpen && (
                        <>
                          <div className="learning-preview-options">
                            <label className="learning-field">
                              Preview mode
                              <select
                                value={previewMode}
                                onChange={(event) => {
                                  setPreviewMode(event.target.value);
                                  resetTutorPreview();
                                }}
                                disabled={previewBusy}
                              >
                                <option value="TUTOR">Tutor response</option>
                                <option value="TASK">Simulate an authored task</option>
                              </select>
                            </label>
                            <label className="learning-field">
                              Starting knowledge
                              <select
                                value={previewScenario}
                                onChange={(event) => resetTutorPreview(event.target.value)}
                                disabled={previewBusy}
                              >
                                <option value="NO_PRIOR_KNOWLEDGE">No prior knowledge</option>
                                <option value="SOME_PRIOR_KNOWLEDGE">Some prior knowledge</option>
                                <option value="MOST_OBJECTIVES_VERIFIED">Most of this objective understood</option>
                                <option value="MISCONCEPTION">Has a common misconception</option>
                              </select>
                            </label>
                            <label className="learning-field">
                              Objective
                              <select
                                value={selectedPreviewObjectiveKey}
                                onChange={(event) => resetTutorPreview(previewScenario, event.target.value)}
                              >
                                {topicDraft.objectiveDefinitions.map((objective, index) => (
                                  <option key={objective.key} value={objective.key}>
                                    {index + 1}. {objective.title || "Untitled objective"}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {previewMode === "TASK" && (
                              <label className="learning-field">
                                Task
                                <select
                                  value={selectedPreviewTask
                                    ? String(selectedPreviewTask._id || `index:${previewTasks.indexOf(selectedPreviewTask)}`)
                                    : ""}
                                  onChange={(event) => {
                                    const nextIndex = event.target.value.startsWith("index:")
                                      ? Number(event.target.value.slice(6))
                                      : previewTasks.findIndex(
                                        (task) => String(task._id) === event.target.value,
                                      );
                                    const nextTask = previewTasks[nextIndex];
                                    setPreviewTaskId(nextTask?._id
                                      ? String(nextTask._id)
                                      : `index:${nextIndex}`);
                                    resetTutorPreview(
                                      previewScenario,
                                      nextTask?.objectiveKeys?.[0] || previewObjectiveKey,
                                    );
                                  }}
                                  disabled={previewBusy || !previewTasks.length}
                                >
                                  {previewTasks.map((task, index) => (
                                    <option
                                      key={task._id || `preview-task-${index}`}
                                      value={String(task._id || `index:${index}`)}
                                    >
                                      {task.title || "Untitled task"} ({task.type || "CODE"})
                                    </option>
                                  ))}
                                </select>
                                {!previewTasks.length && <small className="learning-help">Add a task to this topic to simulate it.</small>}
                              </label>
                            )}
                          </div>
                          <div className="learning-preview-conversation" aria-live="polite">
                            {previewMessages.length === 0 && (
                              <p className="learning-muted">Send a learner response to see how the tutor teaches and evaluates this objective.</p>
                            )}
                            {previewMessages.map((item, index) => (
                              <div className={`learning-message learning-message-${item.role}`} key={`${index}-${item.role}`}>
                                <strong>{item.role === "user" ? "Simulated learner" : "Tutor"}</strong>
                                <p>{item.content}</p>
                              </div>
                            ))}
                            {previewBusy && <p className="learning-muted" role="status">Tutor is responding…</p>}
                          </div>
                          {previewError && <p className="learning-field-error" role="alert">{previewError}</p>}
                          {previewResult && (
                            <div className="learning-preview-evaluation" aria-live="polite">
                              <p><b>Current objective:</b> {selectedPreviewObjective?.title || "Not selected"}</p>
                              {previewResult.task && (
                                <p><b>Task:</b> {previewResult.task.title} ({previewResult.task.type})</p>
                              )}
                              <strong>
                                Evaluation: {(previewResult.evaluation?.correctness || previewResult.taskResult?.status || "pending").replaceAll("_", " ")}
                              </strong>
                              <p>{previewResult.reason}</p>
                              <p><b>Mastery decision:</b> {previewResult.masteryDecision?.mastered ? "Mastered in simulation" : "Not mastered"}</p>
                              <p><b>Next action:</b> {(previewResult.nextAction || previewResult.evaluation?.recommendedNextAction || "CONTINUE").replaceAll("_", " ")}</p>
                              {previewResult.taskResult && (
                                <p>
                                  <b>Task result:</b> {previewResult.taskResult.status.replaceAll("_", " ")}
                                  {" — "}{previewResult.taskResult.accepted ? "accepted" : "not accepted"}
                                </p>
                              )}
                              <p><b>Evidence collected:</b> {previewResult.evidence.length}</p>
                              {(previewResult.evaluation?.evidence || []).length > 0 && (
                                <ul>
                                  {previewResult.evaluation.evidence.map((item, index) => (
                                    <li key={`${item.criterionKey}-${index}`}>
                                      {item.criterionKey}: {item.demonstrated ? "demonstrated" : "not demonstrated"}
                                      {item.evidenceQuote ? ` - "${item.evidenceQuote}"` : ""}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <p><b>Criteria still missing:</b> {previewResult.missingCriteria.length
                                ? previewResult.missingCriteria.map((criterion) => criterion.description).join("; ")
                                : "None"}
                              </p>
                              {(previewResult.evaluation?.identifiedMisconceptions || []).length > 0 && (
                                <p><b>Misconceptions:</b> {previewResult.evaluation.identifiedMisconceptions.join("; ")}</p>
                              )}
                              {(previewResult.taskResult?.visibleResults || []).map((result) => (
                                <p key={`visible-test-${result.testCase}`}>
                                  <b>Visible test {result.testCase}:</b> {result.status}
                                  {result.output ? ` — ${result.output}` : ""}
                                </p>
                              ))}
                            </div>
                          )}
                          <div className="learning-preview-form">
                            {previewMode === "TASK" && selectedPreviewTask && (
                              <div>
                                <b>{selectedPreviewTask.title}:</b>{" "}
                                <MathContent>{selectedPreviewTask.instructions}</MathContent>
                              </div>
                            )}
                            <textarea
                              aria-label={previewMode === "TASK" && selectedPreviewTask?.type === "CODE"
                                ? "Simulated Java code"
                                : "Simulated learner response"}
                              maxLength={previewMode === "TASK" && selectedPreviewTask?.type === "CODE" ? 20000 : 5000}
                              placeholder={previewMode === "TASK" && selectedPreviewTask?.type === "CODE"
                                ? selectedPreviewTask.starterCode || "Enter Java code"
                                : previewMode === "TASK" && selectedPreviewTask?.type === "MATH"
                                  ? "Enter the mathematical answer"
                                  : "Type a simulated learner response"}
                              rows={previewMode === "TASK" && selectedPreviewTask?.type === "CODE" ? 8 : 2}
                              value={previewInput}
                              onChange={(event) => setPreviewInput(event.target.value)}
                            />
                            {previewMode === "TASK" &&
                              selectedPreviewTask?.type === "MATH" &&
                              selectedPreviewTask.requireReasoning && (
                                <textarea
                                  aria-label="Simulated calculation reasoning"
                                  maxLength={5000}
                                  placeholder="Show the calculation steps"
                                  rows={3}
                                  value={previewReasoning}
                                  onChange={(event) => setPreviewReasoning(event.target.value)}
                                />
                              )}
                            <button
                              className="learning-button"
                              disabled={previewBusy || !previewInput.trim()}
                              onClick={sendPreviewMessage}
                              type="button"
                            >
                              {previewBusy
                                ? "Evaluating…"
                                : previewMode === "TASK"
                                  ? "Evaluate simulated task"
                                  : "Send response"}
                            </button>
                          </div>
                        </>
                      )}
                    </section>
                    <div className="learning-actions">
                      <button className="learning-button" disabled={saving} onClick={saveTopic} type="button">
                        {editingTopicId ? "Save topic" : "Add topic"}
                      </button>
                      {editingTopicId && (
                        <button
                          className="learning-button learning-button-secondary"
                          onClick={cancelTopicEdit}
                          type="button"
                        >
                          Cancel edit
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}
              {adminPage === "modules" && (
                <>
                  <div className="learning-actions learning-admin-form-actions">
                    <button className="learning-button" disabled={saving} type="submit">
                      <Save size={15} /> {saving ? "Saving…" : "Save module"}
                    </button>
                  </div>
                  {!newModule && (
                    <div className="learning-actions">
                      <button className="learning-button learning-button-secondary" disabled={saving} onClick={archiveModule} type="button">
                        Delete module
                      </button>
                    </div>
                  )}
                </>
              )}
            </form>
          )}
          {adminPage === "topics" && moduleId && !newModule && (
            <section className="learning-panel learning-topic-management">
              <h2>Topics for {moduleForm.title}</h2>
              <p className="learning-help">Each topic teaches only its pasted objective content.</p>
              <div className="learning-admin-topic-grid">
                {(moduleForm.topics || []).map((topic, index) => (
                  <article className="learning-admin-topic-card" key={topic._id}>
                    <button
                      className="learning-admin-topic-card-main"
                      onClick={() => editTopic(topic)}
                      type="button"
                    >
                      <strong>{topic.title}</strong>
                      <span>{topic.description}</span>
                      <small>{topic.objectives?.length || 0} objectives</small>
                    </button>
                    <div className="learning-actions">
                      <button
                        className="learning-link-button"
                        aria-label={`Move ${topic.title} up`}
                        disabled={saving || index === 0}
                        onClick={() => moveTopic(index, -1)}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        className="learning-link-button"
                        aria-label={`Move ${topic.title} down`}
                        disabled={saving || index === moduleForm.topics.length - 1}
                        onClick={() => moveTopic(index, 1)}
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        className="learning-link-button"
                        aria-label={`Edit ${topic.title}`}
                        onClick={() => editTopic(topic)}
                        type="button"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="learning-link-button"
                        aria-label={`Delete ${topic.title}`}
                        onClick={() => removeTopic(String(topic._id))}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <button
                className="learning-button"
                onClick={() => {
                  setEditingTopicId("");
                  setTopicDraft(EMPTY_TOPIC);
                  setTopicError("");
                  setPreviewOpen(false);
                  resetTutorPreview("NO_PRIOR_KNOWLEDGE", "");
                  setAdminPage("topics-editor");
                }}
                type="button"
              >Add topic</button>
            </section>
          )}
          {adminPage === "topics-editor" && moduleId && !newModule && (
            <section className="learning-panel learning-topic-management">
              <h2>{editingTopicId ? "Edit topic" : "Create topic"}</h2>
              <p className="learning-help">
                Pick the content type, write a prompt — the AI builds the objectives, material and questions for you.
              </p>
              {topicError && <p className="learning-field-error" role="alert">{topicError}</p>}
              <label className="learning-field">
                Content type
                <select
                  value={topicDraft.contentType}
                  onChange={(event) => setTopicDraft({
                    ...topicDraft,
                    contentType: event.target.value,
                    curriculumProposal: null,
                    curriculumApproved: false,
                  })}
                >
                  <option value="CONCEPTS">Concepts</option>
                  <option value="MCQS">MCQs</option>
                </select>
              </label>
              <details className="learning-topic-advanced">
                <summary>Topic configuration (optional — the AI derives sensible defaults from your prompt)</summary>
              {topicDraft.contentType === "CONCEPTS" &&
                moduleForm.evaluationMode === "SELF_EVALUATION" && (
                <fieldset className="learning-fieldset">
                  <legend>Self Evaluation · Concepts configuration</legend>
                  <label className="learning-field">
                    Key concepts to understand (one per line)
                    <textarea rows={3} value={topicDraft.selfConceptConfig.keyConceptsText || ""}
                      onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, keyConceptsText: event.target.value } })} />
                  </label>
                  <label className="learning-field">
                    Expected knowledge (one per line)
                    <textarea rows={3} value={topicDraft.selfConceptConfig.expectedKnowledgeText || ""}
                      onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, expectedKnowledgeText: event.target.value } })} />
                  </label>
                  <label className="learning-field">
                    Important definitions (optional, one per line)
                    <textarea rows={2} value={topicDraft.selfConceptConfig.importantDefinitionsText || ""}
                      onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, importantDefinitionsText: event.target.value } })} />
                  </label>
                  <label className="learning-field">
                    Real-life examples (optional, one per line)
                    <textarea rows={2} value={topicDraft.selfConceptConfig.realLifeExamplesText || ""}
                      onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, realLifeExamplesText: event.target.value } })} />
                  </label>
                  <label className="learning-field">
                    Common misconceptions (optional, one per line)
                    <textarea rows={2} value={topicDraft.selfConceptConfig.commonMisconceptionsText || ""}
                      onChange={(event) => setTopicDraft({ ...topicDraft, selfConceptConfig: { ...topicDraft.selfConceptConfig, commonMisconceptionsText: event.target.value } })} />
                  </label>
                </fieldset>
              )}
              {topicDraft.contentType === "MCQS" &&
                moduleForm.evaluationMode === "SELF_EVALUATION" && (
                <fieldset className="learning-fieldset">
                  <legend>Self Evaluation · MCQ configuration</legend>
                  <label className="learning-field">
                    Question coverage (what the questions must cover)
                    <textarea rows={3} maxLength={4000} value={topicDraft.selfMcqConfig.questionCoverage || ""}
                      onChange={(event) => setTopicDraft({ ...topicDraft, selfMcqConfig: { ...topicDraft.selfMcqConfig, questionCoverage: event.target.value } })} />
                  </label>
                  <label className="learning-field">
                    Questions per session
                    <input type="number" min="1" max="50" value={topicDraft.selfMcqConfig.questionsPerSession ?? 5}
                      onChange={(event) => setTopicDraft({ ...topicDraft, selfMcqConfig: { ...topicDraft.selfMcqConfig, questionsPerSession: event.target.value } })} />
                  </label>
                  <label className="learning-field">
                    Difficulty range
                    <select value={topicDraft.selfMcqConfig.difficultyRange || "EASY_TO_MEDIUM"}
                      onChange={(event) => setTopicDraft({ ...topicDraft, selfMcqConfig: { ...topicDraft.selfMcqConfig, difficultyRange: event.target.value } })}>
                      <option value="EASY_TO_MEDIUM">Easy to medium</option>
                      <option value="EASY_TO_HARD">Easy to hard</option>
                      <option value="MEDIUM_TO_HARD">Medium to hard</option>
                    </select>
                  </label>
                </fieldset>
              )}
              {topicDraft.contentType === "CONCEPTS" &&
                moduleForm.evaluationMode === "STRICT_EVALUATION" && (
                <fieldset className="learning-fieldset">
                  <legend>Strict Evaluation · Concepts configuration</legend>
                  <label className="learning-field">
                    Expected knowledge indicators (one per line)
                    <textarea rows={3} value={topicDraft.strictConceptConfig.expectedKnowledgeIndicatorsText || ""}
                      onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, expectedKnowledgeIndicatorsText: event.target.value } })} />
                  </label>
                  <label className="learning-field">
                    Evaluation criteria (one per line)
                    <textarea rows={3} value={topicDraft.strictConceptConfig.evaluationCriteriaText || ""}
                      onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, evaluationCriteriaText: event.target.value } })} />
                  </label>
                  <label className="learning-field">
                    Level classification criteria
                    <textarea rows={4} maxLength={8000} value={topicDraft.strictConceptConfig.levelClassificationCriteria || ""}
                      placeholder="Describe what separates Beginner, Developing, Intermediate, Advanced and Expert."
                      onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, levelClassificationCriteria: event.target.value } })} />
                  </label>
                  <div className="learning-field-row">
                    <label className="learning-field">
                      Number of evaluation questions
                      <input type="number" min="1" max="60" value={topicDraft.strictConceptConfig.questionCount ?? 5}
                        onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, questionCount: event.target.value } })} />
                    </label>
                    <label className="learning-field">
                      Time limit (minutes, optional)
                      <input type="number" min="1" max="600" value={topicDraft.strictConceptConfig.timeLimitMinutes ?? ""}
                        onChange={(event) => setTopicDraft({ ...topicDraft, strictConceptConfig: { ...topicDraft.strictConceptConfig, timeLimitMinutes: event.target.value } })} />
                    </label>
                  </div>
                </fieldset>
              )}
              {topicDraft.contentType === "MCQS" &&
                moduleForm.evaluationMode === "STRICT_EVALUATION" && (
                <fieldset className="learning-fieldset">
                  <legend>Strict Evaluation · MCQ configuration</legend>
                  <div className="learning-field-row">
                    <label className="learning-field">
                      Number of questions
                      <input type="number" min="1" max="200" value={topicDraft.strictMcqConfig.questionCount ?? 10}
                        onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, questionCount: event.target.value } })} />
                    </label>
                    <label className="learning-field">
                      Difficulty distribution
                      <select value={topicDraft.strictMcqConfig.difficultyDistribution || "BALANCED"}
                        onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, difficultyDistribution: event.target.value } })}>
                        <option value="EASY">Mostly easy</option>
                        <option value="BALANCED">Balanced</option>
                        <option value="CHALLENGING">Mostly challenging</option>
                      </select>
                    </label>
                  </div>
                  <div className="learning-field-row">
                    <label className="learning-field">
                      Time limit (minutes, optional)
                      <input type="number" min="1" max="600" value={topicDraft.strictMcqConfig.timeLimitMinutes ?? ""}
                        onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, timeLimitMinutes: event.target.value } })} />
                    </label>
                    <label className="learning-field">
                      Negative marking (%)
                      <input type="number" min="0" max="100" value={topicDraft.strictMcqConfig.negativeMarkingPercent ?? 0}
                        onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, negativeMarkingPercent: event.target.value } })} />
                    </label>
                  </div>
                  <label className="learning-field">
                    Evaluation criteria (one per line)
                    <textarea rows={2} value={topicDraft.strictMcqConfig.evaluationCriteriaText || ""}
                      onChange={(event) => setTopicDraft({ ...topicDraft, strictMcqConfig: { ...topicDraft.strictMcqConfig, evaluationCriteriaText: event.target.value } })} />
                  </label>
                </fieldset>
              )}
              </details>
              <label className="learning-field">
                Topic title
                <input
                  required
                  maxLength={160}
                  value={topicDraft.title}
                  onChange={(event) => setTopicDraft({
                    ...topicDraft,
                    title: event.target.value,
                    curriculumProposal: null,
                    curriculumApproved: false,
                  })}
                />
              </label>
              <label className="learning-field">
                Short description
                <textarea
                  required
                  rows={2}
                  maxLength={2000}
                  value={topicDraft.description}
                  onChange={(event) => setTopicDraft({
                    ...topicDraft,
                    description: event.target.value,
                    curriculumProposal: null,
                    curriculumApproved: false,
                  })}
                />
              </label>
              <label className="learning-field">
                What should this topic teach or assess? (prompt)
                <span className="learning-field-required">Required</span>
                <textarea
                  required
                  rows={5}
                  maxLength={12000}
                  placeholder={
                    moduleForm.evaluationMode === "STRICT_EVALUATION"
                      ? "Describe what to assess. e.g. 'Assess the learner's understanding of exception handling in Java — try-with-resources, custom exceptions, and when finally blocks run. About 5 questions, medium difficulty, include a scenario question.'"
                      : "Describe what to teach. e.g. 'Teach how classes group related code in Java, ending with the learner writing their own class with two fields and a method. Use relatable everyday examples.'"
                  }
                  value={topicDraft.aiPrompt}
                  onChange={(event) => setTopicDraft({
                    ...topicDraft,
                    aiPrompt: event.target.value,
                  })}
                />
                <span
                  style={{
                    display: "block",
                    marginTop: 4,
                    color: "var(--text-muted)",
                    fontSize: 11,
                  }}
                >
                  The AI builds the objectives, teaching material and questions from this prompt when the course is published. Anything you add below only refines it.
                </span>
              </label>
              <details className="learning-topic-advanced">
                <summary>Advanced authoring (optional — manual objectives and source material)</summary>
                <label className="learning-field" style={{ marginTop: 12 }}>
                  Learning objectives (optional — overrides the prompt-derived objectives)
                  <textarea
                    rows={6}
                    maxLength={12000}
                    placeholder={"Leave empty to let the AI derive these from your prompt.\n\nOr paste objectives as bullets:\n- Explain how a class groups related code.\n- Construct a basic program using the main method."}
                    value={topicDraft.objectivesText}
                    onChange={(event) => setTopicDraft({
                      ...topicDraft,
                      objectivesText: event.target.value,
                      curriculumProposal: null,
                      curriculumApproved: false,
                    })}
                  />
                </label>
                <label className="learning-field">
                  Source material (optional — exact reference content the AI must teach/assess from)
                  <textarea
                    rows={8}
                    maxLength={64000}
                    placeholder="Paste authoritative explanations, definitions, examples, formulas or other material. Leave empty and the AI writes the teaching material from your prompt."
                    value={topicDraft.coreKnowledgeText}
                    onChange={(event) => setTopicDraft({
                      ...topicDraft,
                      coreKnowledgeText: event.target.value,
                      curriculumProposal: null,
                      curriculumApproved: false,
                    })}
                  />
                </label>
              </details>
              {!!moduleForm.topics?.length && (
                <label className="learning-field">
                  Prerequisite topics (optional)
                  <select
                    multiple
                    value={topicDraft.prerequisiteTopicIds}
                    onChange={(event) => setTopicDraft({
                      ...topicDraft,
                      prerequisiteTopicIds: [...event.target.selectedOptions].map((option) => option.value),
                    })}
                  >
                    {moduleForm.topics
                      .filter((topic) => String(topic._id) !== editingTopicId)
                      .map((topic) => (
                        <option key={topic._id} value={String(topic._id)}>{topic.title}</option>
                      ))}
                  </select>
                </label>
              )}
              {topicDraft.contentType === "CONCEPTS" &&
                moduleForm.evaluationMode === "SELF_EVALUATION" && (
                <button
                  className="learning-button learning-button-secondary"
                  disabled={saving || !topicDraft.title.trim() || (!topicDraft.aiPrompt.trim() && !topicDraft.objectivesText.trim())}
                  onClick={generateTopicProposal}
                  type="button"
                >
                  {saving ? "Analyzing curriculum…" : "Generate curriculum preview (optional AI draft)"}
                </button>
              )}
              {topicDraft.curriculumProposal && (
                <section className="learning-topic-editor-group" aria-label="Generated curriculum preview">
                  <h3>Curriculum preview</h3>
                  {topicDraft.curriculumProposal.coverageReport?.map((item) => {
                    const objective = topicDraft.objectiveDefinitions.find(
                      (candidate) => candidate.key === item?.objectiveKey,
                    );
                    return (
                      <article className="learning-topic-editor-card" key={item?.objectiveKey || objective?.key}>
                        <strong>{objective?.title || item?.objectiveKey || "Objective"}</strong>
                        <p>Source coverage: {String(item?.status || "REVIEW").toLowerCase()}</p>
                        {item?.sourceExcerpt && <blockquote>{item.sourceExcerpt}</blockquote>}
                        {item?.notes && <small>{item.notes}</small>}
                      </article>
                    );
                  })}
                  {!!topicDraft.curriculumProposal.coverageIssues?.length && (
                    <p className="learning-field-error" role="alert">
                      Some objectives are not fully supported by the supplied content. Edit the source material and regenerate before approval.
                    </p>
                  )}
                  <div className="learning-topic-editor-card">
                    <strong>Generated verification tasks</strong>
                    <ul>
                      {topicDraft.curriculumProposal.practiceTasks?.map((task, taskIndex) => (
                        <li key={`${task?.title || "task"}-${taskIndex}`}>
                          {task?.title || "Untitled task"}: {task?.instructions || ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    className="learning-button"
                    disabled={Boolean(topicDraft.curriculumProposal.coverageIssues?.length)}
                    onClick={() => setTopicDraft((current) => ({
                      ...current,
                      curriculumApproved: true,
                    }))}
                    type="button"
                  >
                    {topicDraft.curriculumApproved ? "Curriculum approved" : "Approve curriculum"}
                  </button>
                </section>
              )}
              <div className="learning-actions">
                <button
                  className="learning-button"
                  disabled={saving}
                  onClick={saveTopic}
                  type="button"
                >
                  {saving ? "Saving…" : editingTopicId ? "Save approved topic" : "Save topic"}
                </button>
                <button className="learning-button learning-button-secondary" onClick={() => setAdminPage("topics")} type="button">Cancel</button>
              </div>
            </section>
          )}
        </div>}
      </section>

    </div>
  );
}

function StudentLearning() {
  const { user } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [savedProgramIds, setSavedProgramIds] = useState([]);
  const [moduleData, setModuleData] = useState(null);
  const [topicContent, setTopicContent] = useState(null);
  const [objectiveStates, setObjectiveStates] = useState([]);
  const [taskResponses, setTaskResponses] = useState({});
  const [taskResults, setTaskResults] = useState({});
  const [taskBusyId, setTaskBusyId] = useState("");
  const [topicComplete, setTopicComplete] = useState(false);
  const [topicId, setTopicId] = useState("");
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const conversationRef = useRef(null);
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState("en");
  const [voices, setVoices] = useState([]);
  const [voiceProfile, setVoiceProfile] = useState("girl");
  const [voiceOutput, setVoiceOutput] = useState(true);
  const [nickname, setNickname] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceInputState, setVoiceInputState] = useState("idle");
  const voiceInputStopRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [courseSummary, setCourseSummary] = useState(null);
  const voiceProviders = useMemo(
    () => ({
      input: createSpeechInputProvider(window),
      output: createSpeechOutputProvider(window),
    }),
    [],
  );
  const voiceChoices = useMemo(
    () => getVoiceProfileChoices(voices, "en"),
    [voices],
  );
  const savedCoursesKey = `thrive:saved-courses:${user?._id || user?.id || user?.email || "user"}`;
  const nicknameKey = `thrive:nickname:${user?._id || user?.id || user?.email || "user"}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(savedCoursesKey) || "[]");
      setSavedProgramIds(Array.isArray(saved) ? saved.map(String) : []);
      const savedNickname = window.localStorage.getItem(nicknameKey) || "";
      setNickname(savedNickname);
      setNicknameDraft(savedNickname);
    } catch (storageError) {
      console.warn("Unable to load Thrive preferences:", storageError.message);
    }
  }, [nicknameKey, savedCoursesKey]);

  const saveCourse = (programId) => {
    setSavedProgramIds((current) => {
      const next = current.includes(String(programId))
        ? current.filter((id) => id !== String(programId))
        : [...current, String(programId)];
      window.localStorage.setItem(savedCoursesKey, JSON.stringify(next));
      return next;
    });
  };

  const saveNickname = (event) => {
    event.preventDefault();
    const value = nicknameDraft.trim();
    if (!value) return;
    window.localStorage.setItem(nicknameKey, value);
    setNickname(value);
  };

  const visiblePrograms = useMemo(
    () => [...programs].sort((left, right) =>
      Number(savedProgramIds.includes(String(right._id))) -
      Number(savedProgramIds.includes(String(left._id))),
    ),
    [programs, savedProgramIds],
  );
  const selectedProgram = programs.find(
    (program) => String(program._id) === selectedProgramId,
  );

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) {
      conversation.scrollTo({
        top: conversation.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, busy, voiceInputState]);

  const loadStudentData = async () => {
    try {
      const { data } = await api.get("/learning/programs");
      setPrograms(data.programs || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load learning programs.");
    }
  };

  useEffect(() => {
    loadStudentData();
  }, []);

  useEffect(() => {
    if (!voiceProviders.output) return undefined;
    const refreshVoices = () => setVoices(voiceProviders.output.getVoices());
    refreshVoices();
    return voiceProviders.output.onVoicesChanged(refreshVoices);
  }, [voiceProviders]);

  useEffect(() => () => {
    void voiceInputStopRef.current?.({ transcribe: false });
  }, []);

  useEffect(() => {
    if (!voiceChoices[voiceProfile] && voiceChoices.boy) setVoiceProfile("boy");
    else if (!voiceChoices[voiceProfile] && voiceChoices.girl) setVoiceProfile("girl");
  }, [voiceChoices, voiceProfile]);

  const selectedTopic = String(topicContent?._id) === topicId ? topicContent : null;
  const completedObjectiveKeys = useMemo(
    () => new Set((moduleData?.progress?.completedObjectiveKeys || []).map(String)),
    [moduleData?.progress?.completedObjectiveKeys],
  );
  const completedTopicIds = new Set(
    (moduleData?.progress?.completedTopicIds || []).map(String),
  );
  const currentObjective = selectedTopic?.objectiveDefinitions?.find((objective) =>
    objectiveStates.some((state) =>
      state.objectiveKey === objective.key && state.state !== "MASTERED",
    ),
  );
  const isVerificationStage = [
    "OBJECTIVE_VERIFICATION",
    "VERIFICATION_HINT",
  ].includes(session?.learningStage);
  const availableTasks = currentObjective
    ? [
        ...(selectedTopic?.exercises || []).map((exercise) => ({ ...exercise, subtopicId: "" })),
        ...(selectedTopic?.subtopics || []).flatMap((subtopic) =>
          (subtopic.exercises || []).map((exercise) => ({
            ...exercise,
            subtopicId: String(subtopic._id),
          })),
        ),
      ].filter((exercise) =>
        !exercise.objectiveKeys?.length ||
        exercise.objectiveKeys.includes(currentObjective.key),
      )
    : [];
  const beginSession = async (module, topic) => {
    if (!topic) return;
    voiceProviders.output?.cancel();
    await voiceInputStopRef.current?.({ transcribe: false });
    voiceInputStopRef.current = null;
    setVoiceInputState("idle");
    setMessage("");
    setTopicContent(null);
    setTopicComplete(false);
    setObjectiveStates([]);
    setTaskResponses({});
    setTaskResults({});
    const { data } = await api.post("/learning/sessions", {
      moduleId: module._id,
      topicId: topic._id,
      language: "en",
    });
    const { data: topicResponse } = await api.get(
      `/learning/programs/${module.programId}/modules/${module._id}/topics/${topic._id}`,
    );
    setTopicContent(topicResponse.topic);
    setObjectiveStates(topicResponse.objectiveProgress || []);
    setTaskResults(Object.fromEntries(
      (topicResponse.taskResults || []).map((result) => [String(result.taskId), result]),
    ));
    setTopicComplete(
      (topicResponse.objectiveProgress || []).length > 0 &&
      topicResponse.objectiveProgress.every((state) => state.state === "MASTERED"),
    );
    let activeSession = data.session;
    setSession(activeSession);
    setMessages(activeSession.messages || []);
    setTopicId(String(topic._id));
    setLanguage("en");
    window.localStorage.setItem(
      "ccp-learning-last-session",
      JSON.stringify({ moduleId: String(module._id), topicId: String(topic._id) }),
    );
    if (activeSession.awaitingTeachingIntroduction) {
      setBusy(true);
      try {
        const { data: tutorStart } = await api.post(
          `/learning/sessions/${activeSession._id}/messages`,
          { beginLesson: true, language: "en", studentName: nickname },
        );
        activeSession = tutorStart.session;
        setSession(activeSession);
        setMessages(activeSession.messages || []);
      } finally {
        setBusy(false);
      }
    }
  };

  const openProgram = (programId) => {
    setSelectedProgramId(String(programId));
    setError("");
    setNotice("");
    api
      .get(`/learning/certification/${programId}/summary`)
      .then(({ data }) => setCourseSummary(data))
      .catch(() => setCourseSummary(null));
  };

  const openModule = async (programId, moduleId) => {
    setError("");
    setNotice("");
    try {
      const { data } = await api.get(`/learning/programs/${programId}/modules/${moduleId}`);
      setModuleData(data);
      const topics = data.module.topics || [];
      const saved = JSON.parse(window.localStorage.getItem("ccp-learning-last-session") || "null");
      const completed = new Set((data.progress.completedTopicIds || []).map(String));
      const eligible = (topic) =>
        (topic.prerequisiteTopicIds || []).every((requiredId) => completed.has(String(requiredId)));
      const preferredTopic = saved?.moduleId === String(moduleId)
        ? topics.find((topic) => String(topic._id) === saved.topicId)
        : null;
      const firstIncomplete = topics.find((topic) =>
        !completed.has(String(topic._id)) && eligible(topic),
      );
      const nextTopic = (preferredTopic && eligible(preferredTopic) && !completed.has(String(preferredTopic._id))
        ? preferredTopic
        : firstIncomplete) || topics.find((topic) => eligible(topic) && !completed.has(String(topic._id)));
      if (nextTopic) {
        await beginSession(data.module, nextTopic);
      } else {
        setTopicId("");
        setTopicContent(null);
        setObjectiveStates([]);
        setSession(null);
        setMessages([]);
        setTopicComplete(true);
      }
    } catch (openError) {
      setError(openError.message || "Could not open this learning module.");
    }
  };

  const selectTopic = async (topic) => {
    if (!moduleData) return;
    if (completedTopicIds.has(String(topic._id))) return;
    if (!(topic.prerequisiteTopicIds || []).every((requiredId) =>
      completedTopicIds.has(String(requiredId)),
    )) return;
    setError("");
    try {
      await beginSession(moduleData.module, topic);
    } catch (sessionError) {
      setError(sessionError.message || "Could not resume this topic.");
    }
  };

  const speak = (text, replyLanguage = language) => {
    if (!voiceOutput) return;
    if (!voiceProviders.output) {
      setVoiceError("Voice output is not available in this desktop runtime. Tutor text remains available.");
      return;
    }
    try {
      voiceProviders.output.speak(text, { language: replyLanguage, profile: voiceProfile });
    } catch (speechError) {
      setVoiceError(speechError.message || "The selected voice is not installed for this language.");
    }
  };

  const sendMessage = async (input = message, { transcribedFromSpeech = false } = {}) => {
    const text = String(input || "").trim();
    if (!text || !session || !nickname) return;
    voiceProviders.output?.cancel();
    setMessages((current) => [
      ...current,
      { role: "user", content: text, createdAt: new Date().toISOString() },
    ]);
    setBusy(true);
    setError("");
    setVoiceError("");
    setMessage("");
    try {
      const { data } = await api.post(`/learning/sessions/${session._id}/messages`, {
        message: text,
        language: "en",
        studentName: nickname,
        inputTranscribedFromSpeech: transcribedFromSpeech,
      });
      setSession(data.session);
      setMessages(data.session.messages || []);
      if (Array.isArray(data.objectiveProgress)) {
        setObjectiveStates(data.objectiveProgress);
      }
      if (data.progress) {
        setModuleData((current) => current && ({
          ...current,
          progress: data.progress,
          certificate: data.certificate || current.certificate,
        }));
        const states = data.objectiveProgress || [];
        if (states.length && states.every((state) => state.state === "MASTERED")) {
          const completed = new Set((data.progress.completedTopicIds || []).map(String));
          const eligibleNext = moduleData.module.topics.find((topic) =>
            !completed.has(String(topic._id)) &&
            (topic.prerequisiteTopicIds || []).every((requiredId) => completed.has(String(requiredId))),
          );
          if (eligibleNext) {
            setNotice("Objective mastered. Moving to the next eligible topic.");
            await beginSession(moduleData.module, eligibleNext);
          } else {
            setTopicComplete(true);
            setSession(null);
            setNotice("You have mastered every objective in this topic.");
          }
        }
        await loadStudentData();
        if (data.courseCertificate) {
          setNotice(data.courseCertificateEmailSent
            ? "You completed the whole course! Your course certificate has been emailed and is available to download."
            : "You completed the whole course! Your course certificate is ready to download.");
        } else if (data.certificate) {
          setNotice(data.certificateEmailSent
            ? "You completed this module. Your certificate is ready and has been emailed."
            : "You completed this module. Your certificate is ready to download.");
        }
      }
      const reply = data.session.messages?.at(-1)?.content;
      if (reply) speak(reply, data.replyLanguage || language);
    } catch (sendError) {
      setError(sendError.message || "The tutor could not respond. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitTask = async (event, exercise) => {
    event.preventDefault();
    if (!session || !selectedTopic || taskBusyId) return;
    const taskId = String(exercise._id);
    const response = taskResponses[taskId] ?? exercise.starterCode ?? "";
    const submission = exercise.type === "CODE"
      ? String(response)
      : exercise.type === "MATH"
        ? {
            answer: String(taskResponses[`${taskId}:answer`] || ""),
            reasoning: String(taskResponses[`${taskId}:reasoning`] || ""),
          }
        : { answer: String(response) };
    if (
      exercise.type === "MATH"
        ? !submission.answer.trim()
        : !String(response).trim()
    ) return;
    setTaskBusyId(taskId);
    setError("");
    try {
      const { data } = await api.post(
        `/learning/modules/${moduleData.module._id}/topics/${selectedTopic._id}/exercises/${taskId}`,
        {
          submission,
          sessionId: session._id,
          subtopicId: exercise.subtopicId || undefined,
        },
      );
      setTaskResults((current) => ({
        ...current,
        [taskId]: {
          accepted: data.accepted,
          status: data.status,
          feedback: data.feedback,
          evaluation: data.evaluation,
          visibleResults: data.visibleResults || [],
        },
      }));
      if (data.session) {
        setSession(data.session);
        setMessages(data.session.messages || []);
      }
      setObjectiveStates(data.objectiveProgress || []);
      if (data.progress) {
        setModuleData((current) => current && ({
          ...current,
          progress: data.progress,
          certificate: data.certificate || current.certificate,
        }));
        const states = data.objectiveProgress || [];
        if (states.length && states.every((state) => state.state === "MASTERED")) {
          const completed = new Set((data.progress.completedTopicIds || []).map(String));
          const nextTopic = moduleData.module.topics.find((topic) =>
            !completed.has(String(topic._id)) &&
            (topic.prerequisiteTopicIds || []).every((requiredId) => completed.has(String(requiredId))),
          );
          if (nextTopic) {
            setNotice("You demonstrated every objective. Moving to the next topic.");
            await beginSession(moduleData.module, nextTopic);
          } else {
            setTopicComplete(true);
            setSession(null);
            setNotice("You have mastered every objective in this topic.");
          }
        }
        await loadStudentData();
        if (data.courseCertificate) {
          setNotice(data.courseCertificateEmailSent
            ? "You completed the whole course! Your course certificate has been emailed and is available to download."
            : "You completed the whole course! Your course certificate is ready to download.");
        } else if (data.certificate) {
          setNotice(data.certificateEmailSent
            ? "You completed this module. Your certificate is ready and has been emailed."
            : "You completed this module. Your certificate is ready to download.");
        }
      }
      if (data.session?.awaitingTeachingIntroduction) {
        await beginSession(moduleData.module, selectedTopic);
      }
    } catch (submitError) {
      setError(submitError.message || "The task could not be evaluated. Your response is still available to retry.");
    } finally {
      setTaskBusyId("");
    }
  };

  const startVoiceInput = async () => {
    voiceProviders.output?.cancel();
    if (!voiceProviders.input) {
      setVoiceError("Offline speech input is not available in this desktop runtime. You can still type to the tutor.");
      return;
    }
    if (voiceInputStopRef.current) {
      const stop = voiceInputStopRef.current;
      voiceInputStopRef.current = null;
      await stop();
      return;
    }
    if (["requesting", "transcribing"].includes(voiceInputState)) return;
    setVoiceError("");
    try {
      voiceInputStopRef.current = await voiceProviders.input.start({
        onInterim: (transcript) => setMessage(transcript),
        onTranscript: (transcript) => {
          void sendMessage(transcript, { transcribedFromSpeech: true });
        },
        onError: setVoiceError,
        onStateChange: (state) => {
          setVoiceInputState(state);
          if (state === "idle") voiceInputStopRef.current = null;
        },
      });
    } catch (speechError) {
      setVoiceInputState("idle");
      setVoiceError(speechError.message || "Could not start microphone capture.");
    }
  };

  const requestPurchase = async ({ moduleId: requestedModuleId }) => {
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/learning/purchases", { moduleId: requestedModuleId });
      if (data.purchase?.status === "ACTIVE") {
        setNotice("This module is now available in your learning account.");
        await loadStudentData();
        return;
      }
      if (!data.checkout?.keyId || !data.checkout?.orderId) {
        throw new Error("The server did not create a valid Razorpay checkout order.");
      }
      const Razorpay = await loadRazorpayCheckout();
      const checkout = new Razorpay({
        key: data.checkout.keyId,
        amount: data.checkout.amount,
        currency: data.checkout.currency,
        order_id: data.checkout.orderId,
        name: "CodeClash",
        description: data.checkout.moduleTitle,
        handler: async (paymentResponse) => {
          try {
            await api.post(`/learning/purchases/${data.purchase._id}/verify`, {
              orderId: paymentResponse.razorpay_order_id,
              paymentId: paymentResponse.razorpay_payment_id,
              signature: paymentResponse.razorpay_signature,
            });
            setNotice("Payment verified. Module access is now active.");
            await loadStudentData();
          } catch (verifyError) {
            setError(verifyError.message || "Payment confirmation is pending. Please refresh later.");
          }
        },
        modal: {
          ondismiss: () => setNotice("Checkout closed. No access is granted until payment is confirmed."),
        },
      });
      checkout.on("payment.failed", () => {
        setError("Razorpay could not complete the payment. You can try again.");
      });
      checkout.open();
    } catch (purchaseError) {
      setError(purchaseError.message || "Could not create the purchase request.");
    }
  };

  const closeModule = () => {
    void voiceInputStopRef.current?.({ transcribe: false });
    voiceInputStopRef.current = null;
    setVoiceInputState("idle");
    voiceProviders.output?.cancel();
    setModuleData(null);
    setTopicId("");
    setSession(null);
    setMessages([]);
  };

  const downloadCertificate = async (certificate) => {
    setError("");
    try {
      const { data } = await api.get(
        `/learning/certificates/${certificate._id}/pdf`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Thrive-${certificate.code}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError.message || "Could not download this certificate.");
    }
  };

  if (moduleData) {
    const { module, progress } = moduleData;
    const completedTopics = progress.completedTopicIds || [];
    const moduleObjectives = module.topics.flatMap((topic) =>
      (topic.objectiveKeys || (topic.objectives || []).map((_objective, index) => index))
        .map((objectiveKey) =>
        objectiveProgressKey(topic._id, objectiveKey),
      ),
    );
    const moduleCompletedObjectives = moduleObjectives.filter((key) =>
      completedObjectiveKeys.has(key),
    ).length;
    const moduleProgress = moduleObjectives.length
      ? Math.round((moduleCompletedObjectives / moduleObjectives.length) * 100)
      : 0;
    return (
      <div className="learning-center learning-workspace">
        <div className="learning-workspace-top">
          <button className="learning-back-button" onClick={closeModule} type="button">
            <ArrowLeft size={16} /> All modules
          </button>
          <header className="learning-heading learning-workspace-heading">
            <div>
              <p className="learning-eyebrow">{moduleData.program?.title || "Learning program"} · {module.title}</p>
              <h1>{selectedTopic?.title || "Choose a topic"}</h1>
              <p>{selectedTopic?.description || module.description}</p>
              {selectedTopic && objectiveStates.length > 0 && (
                <p className="learning-objective-summary" role="status">
                  {objectiveStates.filter((state) => state.state === "MASTERED").length} of {objectiveStates.length} objectives mastered
                  {currentObjective ? ` · Current objective: ${currentObjective.title}` : ""}
                </p>
              )}
            </div>
            <div className="learning-progress-summary">
              <span>Module objectives</span>
              <strong>{moduleProgress}%</strong>
              <div className="learning-progress-track"><span style={{ width: `${moduleProgress}%` }} /></div>
            </div>
          </header>
        </div>
        {error && <p className="learning-alert learning-alert-error" role="alert">{error}</p>}
        {notice && <p className="learning-alert learning-alert-success" role="status">{notice}</p>}
        <div className="learning-workspace-grid">
          <section className="learning-panel learning-tutor-panel">
            {topicComplete ? (
              <div className="learning-topic-complete" role="status">
                <Check size={24} />
                <h2>Topic objectives mastered</h2>
                <p>You have met every required learning objective for this topic.</p>
                <p>Choose an available topic to continue; no extra lesson is needed here.</p>
              </div>
            ) : (
            <>
              <div className="learning-panel-title">
                <div><h2>{voiceProfile === "boy" ? "Rishi" : "Daisy"}</h2><p>Learn one objective at a time with your tutor.</p></div>
              </div>
              <div className="learning-tutor-controls">
                <label className="learning-field">
                  Voice
                  <select value={voiceProfile} onChange={(event) => setVoiceProfile(event.target.value)}>
                    <option value="boy" disabled={!voiceChoices.boy}>
                      {voiceChoices.boy ? "Rishi" : "Rishi (voice not installed)"}
                    </option>
                    <option value="girl" disabled={!voiceChoices.girl}>
                      {voiceChoices.girl ? "Daisy" : "Daisy (voice not installed)"}
                    </option>
                  </select>
                </label>
                {!voiceChoices[voiceProfile] && (
                  <p className="learning-help" role="status">
                    The selected English voice is not installed. Add an English voice in your device language settings.
                  </p>
                )}
                <label className="learning-voice-toggle">
                  <input type="checkbox" checked={voiceOutput} onChange={(event) => setVoiceOutput(event.target.checked)} />
                  <Volume2 size={16} /> Voice output
                </label>
              </div>
              {!nickname ? (
                <form className="learning-nickname-form" onSubmit={saveNickname}>
                  <p>Before we begin, what should I call you?</p>
                  <label className="learning-field">
                    Your nickname
                    <input
                      autoComplete="nickname"
                      maxLength={40}
                      required
                      value={nicknameDraft}
                      onChange={(event) => setNicknameDraft(event.target.value)}
                    />
                  </label>
                  <button className="learning-button" type="submit">Start learning</button>
                </form>
              ) : (
              <div className="learning-conversation" aria-live="polite" ref={conversationRef}>
                <div className="learning-message learning-message-assistant">
                  <strong>{voiceProfile === "boy" ? "Rishi" : "Daisy"}</strong>
                  <p>Welcome, {nickname}. Your lesson will begin with a story, then you can explore the ideas together.</p>
                </div>
                {messages.map((item, index) => (
                  <div className={`learning-message learning-message-${item.role}`} key={`${item.createdAt || index}-${index}`}>
                    <strong>{item.role === "assistant" ? (voiceProfile === "boy" ? "Rishi" : "Daisy") : nickname}</strong>
                    <p>{item.content}</p>
                  </div>
                ))}
                {busy && <p className="learning-muted" role="status">{voiceProfile === "boy" ? "Rishi" : "Daisy"} is thinking…</p>}
              {nickname && currentObjective && isVerificationStage && (
                <section className="learning-task-area" aria-label="Objective practice tasks">
                  <div className="learning-panel-title">
                    <div>
                      <h3>Try a task</h3>
                      <p>Show what you understand about: {currentObjective.title}</p>
                    </div>
                  </div>
                  {availableTasks.length === 0 ? (
                    <p className="learning-muted">A verification task is not available for this objective yet. Please ask your course administrator to review this topic.</p>
                  ) : availableTasks.map((exercise) => {
                    const taskId = String(exercise._id);
                    const result = taskResults[taskId];
                    return (
                      <form
                        className="learning-task-card"
                        key={taskId}
                        onSubmit={(event) => submitTask(event, exercise)}
                      >
                        <div>
                          <strong>{exercise.title}</strong>
                          <div><MathContent>{exercise.instructions}</MathContent></div>
                        </div>
                        {exercise.type === "MATH" ? (
                          <>
                            <label className="learning-field">
                              Your answer{exercise.unit ? ` (${exercise.unit})` : ""}
                              <input
                                aria-label={`${exercise.title} answer`}
                                inputMode="decimal"
                                maxLength={3000}
                                value={taskResponses[`${taskId}:answer`] || ""}
                                onChange={(event) => setTaskResponses((current) => ({
                                  ...current,
                                  [`${taskId}:answer`]: event.target.value,
                                }))}
                              />
                            </label>
                            {exercise.requireReasoning && (
                              <label className="learning-field">
                                How did you work it out?
                                <textarea
                                  rows={3}
                                  maxLength={3000}
                                  value={taskResponses[`${taskId}:reasoning`] || ""}
                                  onChange={(event) => setTaskResponses((current) => ({
                                    ...current,
                                    [`${taskId}:reasoning`]: event.target.value,
                                  }))}
                                />
                              </label>
                            )}
                          </>
                        ) : (
                          <label className="learning-field">
                            {exercise.type === "CODE" ? "Your Java solution" : "Your response"}
                            <textarea
                              className={exercise.type === "CODE" ? "learning-task-code" : ""}
                              maxLength={exercise.type === "CODE" ? 20000 : 5000}
                              rows={exercise.type === "CODE" ? 9 : 4}
                              value={taskResponses[taskId] ?? exercise.starterCode ?? ""}
                              onChange={(event) => setTaskResponses((current) => ({
                                ...current,
                                [taskId]: event.target.value,
                              }))}
                            />
                          </label>
                        )}
                        <button
                          className="learning-button"
                          disabled={Boolean(taskBusyId) || !session}
                          type="submit"
                        >
                          {taskBusyId === taskId ? "Checking…" : "Submit response"}
                        </button>
                        {result && (
                          <div
                            className={`learning-task-result${result.accepted ? " is-success" : ""}`}
                            aria-live="polite"
                          >
                            <strong>{result.accepted ? "Task completed" : String(result.status || "NEEDS_REVIEW").replaceAll("_", " ")}</strong>
                            <p>{result.feedback}</p>
                            {(result.visibleResults || []).map((visible, index) => (
                              <pre key={`${visible.testCase || index}-${index}`}>
                                Example {visible.testCase || index + 1}: {visible.status}
                                {visible.output ? `\n${visible.output}` : ""}
                              </pre>
                            ))}
                          </div>
                        )}
                      </form>
                    );
                  })}
                </section>
              )}
              </div>
              )}
              {nickname && <form className="learning-chat-form" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
                <textarea
                  aria-label="Message the AI tutor"
                  className="learning-chat-input"
                  maxLength={2000}
                  placeholder="Ask a question about this topic"
                  rows={2}
                  value={message}
                  onChange={(event) => {
                    voiceProviders.output?.cancel();
                    setMessage(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <button
                  aria-label={voiceInputState === "recording" ? "Stop recording" : "Speak to tutor"}
                  aria-pressed={voiceInputState === "recording"}
                  className="learning-button learning-button-secondary"
                  disabled={["requesting", "transcribing"].includes(voiceInputState)}
                  onClick={startVoiceInput}
                  type="button"
                >
                  <Mic size={17} />
                </button>
                <button className="learning-button learning-chat-send" disabled={busy || !message.trim()} type="submit">
                  Send
                </button>
              </form>
              }
              {voiceInputState === "recording" && (
                <p className="learning-help" role="status">Listening… Tap the microphone again to stop recording.</p>
              )}
              {voiceInputState === "requesting" && (
                <p className="learning-help" role="status">Requesting microphone access…</p>
              )}
              {voiceInputState === "transcribing" && (
                <p className="learning-help" role="status">Transcribing locally. First use may download the offline speech model.</p>
              )}
              {voiceError && <p className="learning-alert learning-alert-error" role="status">{voiceError}</p>}
            </>
            )}
          </section>
          <aside className="learning-panel learning-topic-panel">
            <h2>Topics</h2>
            {module.topics.map((topic, index) => {
              const isComplete = completedTopics.some((id) => String(id) === String(topic._id));
              const isPrerequisiteLocked = !(topic.prerequisiteTopicIds || []).every((requiredId) =>
                completedTopics.some((id) => String(id) === String(requiredId)),
              );
              return (
                <button
                  className={`learning-topic-button${String(topic._id) === topicId ? " is-active" : ""}`}
                  key={topic._id}
                  onClick={() => selectTopic(topic)}
                  disabled={isComplete || isPrerequisiteLocked}
                  type="button"
                >
                  <span>{isComplete ? <Check size={15} /> : <span className="learning-topic-number">{index + 1}</span>}</span>
                  <span>{topic.title}</span>
                  {isPrerequisiteLocked ? <span className="learning-muted">Locked</span> : <ChevronRight size={15} />}
                </button>
              );
            })}
          </aside>
        </div>
      </div>
    );
  }

  if (selectedProgramId && selectedProgram) {
    return (
      <div className="learning-center">
        <button
          className="learning-back-button"
          onClick={() => setSelectedProgramId("")}
          type="button"
        >
          <ArrowLeft size={16} /> All courses
        </button>
        <header className="learning-heading">
          <div>
            <p className="learning-eyebrow">Thrive course</p>
            <h1>{selectedProgram.title}</h1>
            <p>{selectedProgram.description}</p>
          </div>
        </header>
        {error && <p className="learning-alert learning-alert-error" role="alert">{error}</p>}
        {notice && <p className="learning-alert learning-alert-success" role="status">{notice}</p>}
        {courseSummary && (
          <section className="learning-panel learning-course-certificate">
            <div>
              <h2>Course certificate</h2>
              {courseSummary.certificate ? (
                <p>
                  Completed {new Date(courseSummary.certificate.earnedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })} —
                  your certificate has been emailed and is available below.
                </p>
              ) : courseSummary.remaining?.length ? (
                <p>
                  Complete {courseSummary.remaining.length} more required
                  module{courseSummary.remaining.length === 1 ? "" : "s"} ({courseSummary.remaining.map((item) => item.title).join(", ")}) to earn the course certificate.
                </p>
              ) : (
                <p>All required modules completed. Your certificate will be issued shortly.</p>
              )}
            </div>
            {courseSummary.certificate && (
              <button
                className="learning-button"
                onClick={() => downloadCertificate(courseSummary.certificate)}
                type="button"
              >
                <Download size={15} /> Download course certificate
              </button>
            )}
          </section>
        )}
        <div className="learning-module-cards">
          {selectedProgram.modules.map((module, index) => (
            <article className="learning-panel learning-module-card" key={module._id}>
              <div>
                <small className="learning-module-number">
                  {module.progress.completed && <Check size={12} />}
                  Module {index + 1}
                </small>
                <h2>{module.title}</h2>
                <p>{module.shortDescription || module.description}</p>
              </div>
              <div className="learning-module-card-meta">
                <strong>{displayPrice(module.price, module.currency)}</strong>
                <span className={module.progress.completed ? "learning-module-completed" : ""}>
                  {module.progress.completed && <Check size={14} />}
                  {module.progress.completed
                    ? "Completed"
                    : `${module.progress.completedTopics || 0} topics completed`}
                </span>
                {module.requiredForCompletion === false && (
                  <span className="learning-module-optional">Optional</span>
                )}
              </div>
              <div className="learning-module-card-actions">
                {module.hasAccess ? (
                  <button
                    className="learning-button"
                    onClick={() => openModule(selectedProgram._id, module._id)}
                    type="button"
                  >
                    Start now
                    <ChevronRight size={15} />
                  </button>
                ) : (
                  <button
                    className="learning-button"
                    disabled={module.purchaseStatus === "PENDING" || module.purchaseStatus === "ACTIVE"}
                    onClick={() => requestPurchase({ moduleId: module._id })}
                    type="button"
                  >
                    {module.purchaseStatus === "PENDING"
                      ? "Payment pending"
                      : module.purchaseStatus === "ACTIVE"
                        ? "Prerequisite required"
                        : module.purchaseStatus === "EXPIRED"
                          ? `Repurchase · ${displayPrice(module.price, module.currency)}`
                          : Number(module.price) === 0
                            ? "Start free module"
                            : `Pay ${displayPrice(module.price, module.currency)}`}
                  </button>
                )}
                {module.progress.completed && module.certificate && (
                  <button
                    aria-label={`Download certificate for ${module.title}`}
                    className="learning-certificate-download"
                    onClick={() => downloadCertificate(module.certificate)}
                    title="Download certificate"
                    type="button"
                  >
                    <Download size={17} />
                  </button>
                )}
              </div>
            </article>
          ))}
          {!selectedProgram.modules.length && (
            <p className="learning-empty-state">This course has no available modules yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="learning-center">
      <header className="learning-heading">
        <div>
          <p className="learning-eyebrow">Thrive learning</p>
          <h1>Thrive</h1>
          <p>Choose a course and learn at your own pace.</p>
        </div>
      </header>
      {error && <p className="learning-alert learning-alert-error" role="alert">{error}</p>}
      {notice && <p className="learning-alert learning-alert-success" role="status">{notice}</p>}
      {programs.length === 0 ? (
        <section className="learning-panel"><p className="learning-muted">No courses are available yet.</p></section>
      ) : (
        <div className="learning-program-grid">
          {visiblePrograms.map((program) => {
            const isFree = program.modules.length > 0 &&
              program.modules.every((module) => Number(module.price) === 0);
            const isSaved = savedProgramIds.includes(String(program._id));
            return (
            <article className="learning-panel learning-program-card" key={program._id}>
              <div className="learning-program-header">
                <button
                  className="learning-course-open"
                  onClick={() => openProgram(program._id)}
                  type="button"
                >
                  <h2>{program.title}</h2>
                </button>
                {isFree && <span className="learning-free-badge">Free</span>}
              </div>
              <button
                className="learning-course-description"
                onClick={() => openProgram(program._id)}
                type="button"
              >
                {program.shortDescription || program.description}
              </button>
              <button
                aria-label={isSaved ? `Remove ${program.title} from saved courses` : `Save ${program.title}`}
                aria-pressed={isSaved}
                className="learning-save-course"
                onClick={() => saveCourse(program._id)}
                type="button"
              >
                {isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                {isSaved ? "Saved" : "Save"}
              </button>
            </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function LearningCenter({ adminView = false }) {
  const { user } = useAuth();
  const isAdmin = getAssessmentRole(user) === ASSESSMENT_ROLES.SUPER_ADMIN;
  if (adminView && isAdmin) return <AdminLearning />;
  if (!adminView && !isAdmin) return <StudentLearning />;
  return (
    <div className="learning-center">
      <p className="learning-alert learning-alert-error" role="alert">This learning area is not available to your account.</p>
      <Link to="/" className="learning-link-button">Return to CodeClash</Link>
    </div>
  );
}
