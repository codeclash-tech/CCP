import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronRight,
  Code2,
  Pencil,
  Mic,
  Play,
  Save,
  Send,
  Volume2,
} from "lucide-react";
import { Link } from "react-router-dom";
import CodeEditorSandbox from "../components/editor/CodeEditorSandbox";
import api from "../services/api";
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
  description: "",
  explanation: "",
  tutorInstructions: "",
  validationInstructions: "",
  objectivesText: "",
  examples: [],
  questions: [],
  exercises: [],
  subtopics: [],
};
function displayPrice(price, currencyInput = "INR") {
  const currency = /^[A-Z]{3}$/.test(currencyInput) ? currencyInput : "INR";
  return Number(price) === 0
    ? "Free"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(price));
}
function createTopicDraft(topic = {}) {
  return {
    title: topic.title || "",
    description: topic.description || "",
    explanation: topic.explanation || "",
    tutorInstructions: topic.tutorInstructions || "",
    validationInstructions: topic.validationInstructions || "",
    objectivesText: (topic.objectives || []).join("\n"),
    examples: (topic.examples || []).map((example) => ({ ...example })),
    questions: (topic.questions || []).map((question) => ({
      ...question,
      acceptedAnswersText: (question.acceptedAnswers || []).join("\n"),
    })),
    exercises: (topic.exercises || []).map((exercise) => ({
      ...exercise,
      tests: (exercise.tests || []).map((testCase) => ({ ...testCase })),
    })),
    subtopics: (topic.subtopics || []).map((subtopic) => ({ ...subtopic })),
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

function parseJsonField(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

function getTopicExercises(topic) {
  if (!topic) return [];
  return [
    ...(topic.exercises || []).map((exercise) => ({ ...exercise, subtopicId: null })),
    ...(topic.subtopics || []).flatMap((subtopic) =>
      (subtopic.exercises || []).map((exercise) => ({
        ...exercise,
        subtopicId: String(subtopic._id),
        subtopicTitle: subtopic.title,
      })),
    ),
  ];
}

function AdminLearning() {
  const [programs, setPrograms] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [programForm, setProgramForm] = useState(EMPTY_PROGRAM);
  const [moduleId, setModuleId] = useState("");
  const [moduleForm, setModuleForm] = useState(EMPTY_MODULE);
  const [aiSettingsText, setAiSettingsText] = useState("{}");
  const [topicDraft, setTopicDraft] = useState(EMPTY_TOPIC);
  const [editingTopicId, setEditingTopicId] = useState("");
  const [topicError, setTopicError] = useState("");
  const [jsonFields, setJsonFields] = useState({
    objectives: "[]",
    prerequisites: "[]",
    assessment: JSON.stringify(EMPTY_MODULE.assessment, null, 2),
    completionRequirements: JSON.stringify(EMPTY_MODULE.completionRequirements, null, 2),
  });
  const [newProgram, setNewProgram] = useState(EMPTY_PROGRAM);
  const [newModule, setNewModule] = useState(false);
  const [previewModule, setPreviewModule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adminPage, setAdminPage] = useState("courses");

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [programResponse, purchaseResponse] = await Promise.all([
        api.get("/learning/admin/programs"),
        api.get("/learning/admin/purchases"),
      ]);
      const nextPrograms = programResponse.data.programs || [];
      setPrograms(nextPrograms);
      setPurchases(purchaseResponse.data.purchases || []);
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
    setAiSettingsText("{}");
    setNewModule(false);
    setEditingTopicId("");
    setTopicError("");
    setTopicDraft(EMPTY_TOPIC);
  }, [selectedProgramId]);

  const loadModule = async (id) => {
    setError("");
    setNotice("");
    try {
      const { data } = await api.get(`/learning/admin/modules/${id}`);
      const module = data.module;
      setModuleId(String(module._id));
      setAdminPage("modules");
      setNewModule(false);
      setModuleForm(module);
      setAiSettingsText(JSON.stringify(module.aiConfiguration?.advancedSettings || {}, null, 2));
      setPreviewModule(false);
      setEditingTopicId("");
      setTopicError("");
      setTopicDraft(EMPTY_TOPIC);
      setJsonFields({
        objectives: JSON.stringify(module.objectives || [], null, 2),
        prerequisites: JSON.stringify(module.prerequisites || [], null, 2),
        assessment: JSON.stringify(module.assessment || EMPTY_MODULE.assessment, null, 2),
        completionRequirements: JSON.stringify(
          module.completionRequirements || EMPTY_MODULE.completionRequirements,
          null,
          2,
        ),
      });
    } catch (loadError) {
      setError(loadError.message || "Could not load the learning module.");
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
      const status = selectedProgram.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
      await api.patch(`/learning/admin/programs/${selectedProgram._id}`, { status });
      setNotice(status === "PUBLISHED" ? "Program published." : "Program unpublished.");
      await loadAdminData();
    } catch (saveError) {
      setError(saveError.message || "Could not change the program status.");
    } finally {
      setSaving(false);
    }
  };

  const archiveProgram = async () => {
    if (!selectedProgram || !window.confirm("Delete this course? Existing student records will be retained.")) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/learning/admin/programs/${selectedProgram._id}`);
      setSelectedProgramId("");
      setNotice("Course deleted. Existing student records remain preserved.");
      await loadAdminData();
    } catch (archiveError) {
      setError(archiveError.message || "Could not archive this course.");
    } finally {
      setSaving(false);
    }
  };

  const changeModuleStatus = async () => {
    if (!moduleId || !moduleForm) return;
    const status = moduleForm.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    if (status === "PUBLISHED") {
      const topics = (moduleForm.topics || []).filter((topic) => String(topic.title || "").trim());
      if (!topics.length) {
        setError("Add at least one topic before publishing this module.");
        return;
      }
      if (topics.some((topic) => !(topic.questions || []).some((question) =>
        String(question.prompt || "").trim() && String(question.expectedAnswer || "").trim()
      ))) {
        setError("Add a check question and expected answer to every topic before publishing.");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await api.patch(`/learning/admin/modules/${moduleId}/status`, { status });
      setNotice(status === "PUBLISHED" ? "Module published." : "Module unpublished.");
      await loadAdminData();
      await loadModule(moduleId);
    } catch (statusError) {
      setError(statusError.message || "Could not change the module publication status.");
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
    setAiSettingsText("{}");
    setEditingTopicId("");
    setTopicError("");
    setTopicDraft(EMPTY_TOPIC);
    setModuleForm({
      ...EMPTY_MODULE,
      sequence: (selectedProgram?.modules?.length || 0) + 1,
    });
    setPreviewModule(false);
    setJsonFields({
      objectives: "[]",
      prerequisites: "[]",
      assessment: JSON.stringify(EMPTY_MODULE.assessment, null, 2),
      completionRequirements: JSON.stringify(EMPTY_MODULE.completionRequirements, null, 2),
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
        ...moduleForm,
        price: Number(moduleForm.price),
        accessDurationDays: moduleForm.accessDurationDays === "" ||
          moduleForm.accessDurationDays === null
          ? null
          : Number(moduleForm.accessDurationDays),
        sequence: moduleId ? Number(moduleForm.sequence) : undefined,
        estimatedDurationMinutes: Number(moduleForm.estimatedDurationMinutes) || 60,
        objectives: parseJsonField(jsonFields.objectives, "Objectives"),
        prerequisites: parseJsonField(jsonFields.prerequisites, "Prerequisites"),
        topics: newModule ? [] : (moduleForm.topics || []),
        aiConfiguration: {
          ...(moduleForm.aiConfiguration || {}),
          advancedSettings: parseJsonField(aiSettingsText, "AI advanced settings"),
        },
        assessment: parseJsonField(jsonFields.assessment, "Assessment"),
        completionRequirements: parseJsonField(
          jsonFields.completionRequirements,
          "Completion requirements",
        ),
      };
      if (newModule) {
        const { data } = await api.post(
          `/learning/admin/programs/${selectedProgram._id}/modules`,
          payload,
        );
        setModuleId(String(data.module._id));
        setNewModule(false);
        setModuleForm(data.module);
        setAiSettingsText(JSON.stringify(data.module.aiConfiguration?.advancedSettings || {}, null, 2));
        setJsonFields({
          objectives: JSON.stringify(data.module.objectives || [], null, 2),
          prerequisites: JSON.stringify(data.module.prerequisites || [], null, 2),
          assessment: JSON.stringify(data.module.assessment || EMPTY_MODULE.assessment, null, 2),
          completionRequirements: JSON.stringify(
            data.module.completionRequirements || EMPTY_MODULE.completionRequirements,
            null,
            2,
          ),
        });
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
    if (!topicDraft.explanation.trim()) {
      setTopicError("Add lesson content describing what students will learn.");
      return;
    }
    if (!topicDraft.objectivesText.split(/\r?\n/).some((objective) => objective.trim())) {
      setTopicError("Add at least one expected learning outcome.");
      return;
    }
    if (topicDraft.questions.some((question) =>
      String(question.prompt || "").trim() && !String(question.expectedAnswer || "").trim()
    )) {
      setTopicError("Add an expected answer for each question or remove the empty question.");
      return;
    }
    if (topicDraft.exercises.some((exercise) =>
      [exercise.title, exercise.instructions].some((value) => String(value || "").trim()) &&
      (!String(exercise.title || "").trim() || !String(exercise.instructions || "").trim())
    )) {
      setTopicError("Each activity needs a title and instructions.");
      return;
    }
    if (topicDraft.exercises.some((exercise) =>
      exercise.type !== "ACTIVITY" &&
      (exercise.tests || []).some((testCase) => !String(testCase.expectedOutput || "").trim())
    )) {
      setTopicError("Add an expected output for each coding test case.");
      return;
    }
    setSaving(true);
    setTopicError("");
    setError("");
    try {
      const topic = {
        title: topicDraft.title.trim(),
        description: topicDraft.description.trim(),
        explanation: topicDraft.explanation.trim(),
        tutorInstructions: topicDraft.tutorInstructions.trim(),
        validationInstructions: topicDraft.validationInstructions.trim(),
        objectives: topicDraft.objectivesText.split(/\r?\n/).map((objective) => objective.trim()).filter(Boolean),
        examples: topicDraft.examples.filter((example) =>
          [example.title, example.explanation, example.code].some((value) => String(value || "").trim()),
        ),
        questions: topicDraft.questions
          .filter((question) => String(question.prompt || "").trim())
          .map((question) => ({
            ...question,
            acceptedAnswers: String(question.acceptedAnswersText || "")
              .split(/\r?\n/)
              .map((answer) => answer.trim())
              .filter(Boolean),
          })),
        exercises: topicDraft.exercises.filter((exercise) =>
          [exercise.title, exercise.instructions].some((value) => String(value || "").trim()),
        ),
        subtopics: topicDraft.subtopics.filter((subtopic) => String(subtopic.title || "").trim()),
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
      setAdminPage("topics");
      await loadModule(moduleId);
      await loadAdminData();
    } catch (topicError) {
      setError(topicError.message || "Could not save this topic.");
    } finally {
      setSaving(false);
    }
  };

  const editTopic = (topic) => {
    setAdminPage("topics-editor");
    setEditingTopicId(String(topic._id));
    setTopicError("");
    setTopicDraft(createTopicDraft(topic));
  };

  const cancelTopicEdit = () => {
    setEditingTopicId("");
    setTopicError("");
    setTopicDraft(EMPTY_TOPIC);
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
      await loadModule(moduleId);
    } catch (topicError) {
      setError(topicError.message || "Could not reorder topics.");
    }
  };

  const reviewPurchase = async (purchaseId, status) => {
    setError("");
    try {
      await api.patch(`/learning/admin/purchases/${purchaseId}`, { status });
      setNotice(`Purchase request ${status.toLowerCase()}.`);
      await loadAdminData();
    } catch (reviewError) {
      setError(reviewError.message || "Could not update the purchase request.");
    }
  };

  if (loading) return <div className="learning-loading" role="status">Loading learning management…</div>;

  return (
    <div className="learning-center">
      <header className="learning-heading">
        <div>
          <p className="learning-eyebrow">Thrive management</p>
          <h1>Thrive courses</h1>
          <p>Create and maintain all official lessons, activities, and module requirements.</p>
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
      </nav>

      <section className="learning-management-grid">
        {adminPage === "courses" && <div className="learning-panel">
          <h2>Courses</h2>
          {programs.length > 0 && (
            <div className="learning-module-list learning-course-list" aria-label="Your courses">
              {programs.map((program) => (
                <div className="learning-module-row" key={program._id}>
                  <button
                    className={String(program._id) === selectedProgramId ? "is-selected" : ""}
                    onClick={() => setSelectedProgramId(String(program._id))}
                    type="button"
                  >
                    <span>{program.title}</span>
                    <small>{program.modules.length} module(s) · {program.status}</small>
                  </button>
                </div>
              ))}
            </div>
          )}
          <form
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
            <h3>Create a course</h3>
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
          </form>

          {selectedProgram && (
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
                  {selectedProgram.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                </button>
                <button className="learning-button learning-button-secondary" disabled={saving} onClick={archiveProgram} type="button">
                  Delete course
                </button>
              </div>
              {selectedProgram.status !== "PUBLISHED" && !(selectedProgram.modules || []).length && (
                <p className="learning-help">Create a module to enable course publishing.</p>
              )}
            </form>
          )}
        </div>}

        {adminPage !== "courses" && <div className="learning-panel learning-module-admin-panel">
          <div className="learning-panel-title">
            <div>
              <h2>Modules and lesson content</h2>
              <p>{selectedProgram ? `${selectedProgram.modules.length} module(s) · add each module when you need it` : "Select or create a course first."}</p>
            </div>
          </div>
          {selectedProgram && selectedProgram.modules?.length === 0 && !newModule && (
            <p className="learning-empty-state">No modules yet. Add the first module when you are ready.</p>
          )}
          {selectedProgram?.modules?.length > 0 && (
            <div className="learning-module-list">
              {selectedProgram.modules.map((module) => (
                <div className="learning-module-row" key={module._id}>
                  <button
                    className={String(module._id) === moduleId ? "is-selected" : ""}
                    onClick={() => loadModule(module._id)}
                    type="button"
                  >
                    <span>{module.title}</span>
                  </button>
                  <span className="learning-actions">
                    <button className="learning-link-button" aria-label={`Edit ${module.title}`} onClick={() => loadModule(module._id)} type="button"><Pencil size={14} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {selectedProgram && (
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
              onSubmit={saveModule}
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget) &&
                  moduleForm.title?.trim() &&
                  moduleForm.description?.trim() &&
                  !saving
                ) void saveModule();
              }}
            >
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
              <div className="learning-field-row">
                <label className="learning-field">
                  Fee (INR)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={moduleForm.price ?? 0}
                    onChange={(event) => setModuleForm({ ...moduleForm, price: event.target.value })}
                  />
                </label>
                <label className="learning-field">
                  Access duration (days)
                  <input
                    type="number"
                    min="1"
                    max="36500"
                    step="1"
                    placeholder="Blank means lifetime"
                    value={moduleForm.accessDurationDays ?? ""}
                    onChange={(event) => setModuleForm({ ...moduleForm, accessDurationDays: event.target.value })}
                  />
                  <small className="learning-help">Starts after verified payment. Free modules start when access is granted; leave blank for lifetime access.</small>
                </label>
              </div>
              <details className="learning-advanced-section">
                <summary>Advanced module settings</summary>
                <label className="learning-field">
                  Currency
                  <input
                    maxLength={3}
                    value={moduleForm.currency || "INR"}
                    onChange={(event) => setModuleForm({ ...moduleForm, currency: event.target.value.toUpperCase() })}
                  />
                </label>
                <label className="learning-field">
                  Difficulty
                  <select
                    value={moduleForm.difficulty || "BEGINNER"}
                    onChange={(event) => setModuleForm({ ...moduleForm, difficulty: event.target.value })}
                  >
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="ADVANCED">Advanced</option>
                  </select>
                </label>
                <label className="learning-field">
                  Estimated duration in minutes (optional)
                  <input
                    type="number"
                    min="1"
                    value={moduleForm.estimatedDurationMinutes || 60}
                    onChange={(event) => setModuleForm({ ...moduleForm, estimatedDurationMinutes: event.target.value })}
                  />
                </label>
                {[
                  ["objectives", "Learning objectives (JSON)"],
                  ["prerequisites", "Prerequisite module IDs (JSON)"],
                  ["assessment", "Assessment questions (JSON)"],
                  ["completionRequirements", "Completion requirements (JSON)"],
                ].map(([field, label]) => (
                  <label className="learning-field" key={field}>
                    {label}
                    <textarea
                      className="learning-json-field"
                      rows={4}
                      spellCheck="false"
                      value={jsonFields[field]}
                      onChange={(event) => setJsonFields({ ...jsonFields, [field]: event.target.value })}
                    />
                  </label>
                ))}
                <details className="learning-advanced-section">
                  <summary>AI tutor behavior (optional)</summary>
                  <label className="learning-field">
                    How should the tutor teach this module?
                    <textarea
                      rows={4}
                      maxLength={8000}
                      value={moduleForm.aiConfiguration?.behaviorPrompt || ""}
                      onChange={(event) => setModuleForm({
                        ...moduleForm,
                        aiConfiguration: {
                          ...(moduleForm.aiConfiguration || {}),
                          behaviorPrompt: event.target.value,
                        },
                      })}
                      placeholder="Leave blank to use the friendly, topic-focused default tutor."
                    />
                  </label>
                  <details className="learning-advanced-section">
                    <summary>Advanced AI settings (JSON, optional)</summary>
                    <textarea
                      className="learning-json-field"
                      rows={4}
                      spellCheck="false"
                      value={aiSettingsText}
                      onChange={(event) => setAiSettingsText(event.target.value)}
                    />
                  </details>
                  <details className="learning-content-template">
                    <summary>Preview tutor instructions</summary>
                    <pre>{moduleForm.aiConfiguration?.behaviorPrompt || "The platform's safe, friendly teaching defaults will be used."}</pre>
                  </details>
                </details>
              </details>
              {!newModule && adminPage === "topics-inline" && (
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
                    <h5>{editingTopicId ? "Edit topic" : "Add a topic"}</h5>
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
                      What will students learn?
                      <textarea
                        required
                        rows={5}
                        maxLength={12000}
                        placeholder="Explain the topic clearly. Include theory or code as appropriate."
                        value={topicDraft.explanation}
                        onChange={(event) => setTopicDraft({ ...topicDraft, explanation: event.target.value })}
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
                    <label className="learning-field">
                      Expected learning outcomes (one per line)
                      <span className="learning-field-required">Required</span>
                      <textarea
                        required
                        rows={2}
                        value={topicDraft.objectivesText}
                        onChange={(event) => setTopicDraft({ ...topicDraft, objectivesText: event.target.value })}
                      />
                    </label>
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
                        <h5>Topic completion check</h5>
                        <p className="learning-help">Add at least one question with its expected answer. The server checks answers before marking this topic complete.</p>
                        <button
                          className="learning-button learning-button-small learning-button-secondary"
                          onClick={() => setTopicDraft({
                            ...topicDraft,
                            questions: [...topicDraft.questions, {
                              prompt: "",
                              expectedAnswer: "",
                              acceptedAnswersText: "",
                            }],
                          })}
                          type="button"
                        >
                          Add question
                        </button>
                      </div>
                      {topicDraft.questions.map((question, index) => (
                        <div className="learning-topic-editor-card" key={`question-${index}`}>
                          <label className="learning-field">
                            Check question
                            <textarea
                              rows={2}
                              value={question.prompt || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                questions: updateTopicItem(topicDraft.questions, index, "prompt", event.target.value),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            Expected answer
                            <textarea
                              rows={2}
                              value={question.expectedAnswer || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                questions: updateTopicItem(topicDraft.questions, index, "expectedAnswer", event.target.value),
                              })}
                            />
                          </label>
                          <label className="learning-field">
                            Other accepted answers (optional, one per line)
                            <textarea
                              rows={2}
                              value={question.acceptedAnswersText || ""}
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                questions: updateTopicItem(topicDraft.questions, index, "acceptedAnswersText", event.target.value),
                              })}
                            />
                          </label>
                          <button
                            className="learning-link-button"
                            onClick={() => setTopicDraft({
                              ...topicDraft,
                              questions: topicDraft.questions.filter((_item, itemIndex) => itemIndex !== index),
                            })}
                            type="button"
                          >
                            Remove question
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
                              onChange={(event) => setTopicDraft({
                                ...topicDraft,
                                exercises: updateTopicItem(topicDraft.exercises, index, "type", event.target.value),
                              })}
                            >
                              <option value="ACTIVITY">Written or discussion activity</option>
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
              {previewModule && (
                <section className="learning-module-preview">
                  <p className="learning-eyebrow">Preview</p>
                  <h4>{moduleForm.title || "Untitled module"}</h4>
                  <p>{moduleForm.description || "Add a module overview to see it here."}</p>
                  <div className="learning-preview-topics">
                    {(moduleForm.topics || []).map((topic) => (
                      <article key={topic._id || topic.title}>
                        <strong>{topic.title}</strong>
                        {topic.description && <p>{topic.description}</p>}
                      </article>
                    ))}
                    {!moduleForm.topics?.length && <p className="learning-muted">No topics have been added.</p>}
                  </div>
                </section>
              )}
              <div className="learning-actions learning-admin-form-actions">
                <button className="learning-button" disabled={saving} type="submit">
                  <Save size={15} /> {saving ? "Saving…" : "Save module"}
                </button>
                <button
                  className="learning-button learning-button-secondary"
                  onClick={() => setPreviewModule((current) => !current)}
                  type="button"
                >
                  {previewModule ? "Close preview" : "Preview"}
                </button>
              </div>
              {!newModule && (
                <div className="learning-actions">
                  <button className="learning-button learning-button-secondary" disabled={saving} onClick={changeModuleStatus} type="button">
                    {moduleForm.status === "PUBLISHED" ? "Unpublish module" : "Publish module"}
                  </button>
                  <button className="learning-button learning-button-secondary" disabled={saving} onClick={archiveModule} type="button">
                    Delete module
                  </button>
                </div>
              )}
            </form>
          )}
          {adminPage === "topics" && moduleId && !newModule && (
            <section className="learning-panel learning-topic-management">
              <h2>Topics for {moduleForm.title}</h2>
              <p className="learning-help">Select a topic to edit it, or add a new topic with its expected learning outcomes.</p>
              {(moduleForm.topics || []).map((topic) => (
                <button
                  className="learning-module-row"
                  key={topic._id}
                  onClick={() => editTopic(topic)}
                  type="button"
                >
                  <span>{topic.title}</span>
                  <Pencil size={14} aria-hidden="true" />
                </button>
              ))}
              <button
                className="learning-button"
                onClick={() => {
                  setEditingTopicId("");
                  setTopicDraft(EMPTY_TOPIC);
                  setTopicError("");
                  setAdminPage("topics-editor");
                }}
                type="button"
              >Add topic</button>
            </section>
          )}
          {adminPage === "topics-editor" && moduleId && !newModule && (
            <section
              className="learning-panel learning-topic-management"
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget) &&
                  topicDraft.title.trim() &&
                  topicDraft.description.trim() &&
                  topicDraft.explanation.trim() &&
                  topicDraft.objectivesText.trim() &&
                  !saving
                ) void saveTopic();
              }}
            >
              <h2>{editingTopicId ? "Edit topic" : "Create topic"}</h2>
              {topicError && <p className="learning-field-error" role="alert">{topicError}</p>}
              <label className="learning-field">
                Topic name
                <input value={topicDraft.title} onChange={(event) => setTopicDraft({ ...topicDraft, title: event.target.value })} />
              </label>
              <label className="learning-field">
                Description
                <textarea rows={2} value={topicDraft.description} onChange={(event) => setTopicDraft({ ...topicDraft, description: event.target.value })} />
              </label>
              <label className="learning-field">
                Learning content
                <textarea rows={6} value={topicDraft.explanation} onChange={(event) => setTopicDraft({ ...topicDraft, explanation: event.target.value })} />
              </label>
              <label className="learning-field">
                Expected learning outcomes
                <textarea rows={4} value={topicDraft.objectivesText} onChange={(event) => setTopicDraft({ ...topicDraft, objectivesText: event.target.value })} />
              </label>
              <div className="learning-actions">
                <button className="learning-button" disabled={saving} onClick={saveTopic} type="button">{saving ? "Saving…" : "Save topic"}</button>
                <button className="learning-button learning-button-secondary" onClick={() => setAdminPage("topics")} type="button">Cancel</button>
              </div>
            </section>
          )}
        </div>}
      </section>

      {adminPage === "courses" && <section className="learning-panel learning-purchase-panel">
        <h2>Purchase requests</h2>
        {purchases.length === 0 ? (
          <p className="learning-muted">No purchase requests yet.</p>
        ) : (
          <div className="learning-request-list">
            {purchases.map((purchase) => (
              <div className="learning-request-row" key={purchase._id}>
                <div>
                  <strong>{purchase.userId?.name || purchase.userId?.email || "Student"}</strong>
                  <span>{purchase.programId?.title || purchase.moduleId?.title || "Learning content"}</span>
                  <small>{purchase.currency} {Number(purchase.amount || 0).toFixed(2)}</small>
                  <small>{purchase.status}</small>
                </div>
                {["PENDING", "ACTIVE"].includes(purchase.status) && (
                  <div className="learning-actions">
                    <button
                      className="learning-button learning-button-secondary"
                      onClick={() => reviewPurchase(purchase._id, purchase.status === "ACTIVE" ? "REVOKED" : "REJECTED")}
                      type="button"
                    >
                      {purchase.status === "ACTIVE" ? "Revoke access" : "Reject purchase"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>}
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
  const [topicId, setTopicId] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const conversationEndRef = useRef(null);
  const [topicAnswers, setTopicAnswers] = useState({});
  const [topicCheckResult, setTopicCheckResult] = useState(null);
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
  const [codingOpen, setCodingOpen] = useState(false);
  const [exerciseCode, setExerciseCode] = useState("");
  const [exerciseResult, setExerciseResult] = useState(null);
  const [answers, setAnswers] = useState({});
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
  const selectedExercise = useMemo(
    () => getTopicExercises(selectedTopic).find((exercise) => String(exercise._id) === exerciseId) || null,
    [exerciseId, selectedTopic],
  );

  const beginSession = async (module, topic) => {
    if (!topic) return;
    voiceProviders.output?.cancel();
    await voiceInputStopRef.current?.({ transcribe: false });
    voiceInputStopRef.current = null;
    setVoiceInputState("idle");
    setMessage("");
    setTopicContent(null);
    const { data } = await api.post("/learning/sessions", {
      moduleId: module._id,
      topicId: topic._id,
      language: "en",
    });
    const { data: topicResponse } = await api.get(
      `/learning/programs/${module.programId}/modules/${module._id}/topics/${topic._id}`,
    );
    setTopicContent(topicResponse.topic);
    setSession(data.session);
    setMessages(data.session.messages || []);
    setTopicAnswers({});
    setTopicCheckResult(null);
    setTopicId(String(topic._id));
    const firstExercise = getTopicExercises(topicResponse.topic)[0];
    setExerciseId(String(firstExercise?._id || ""));
    setExerciseCode(firstExercise?.starterCode || "");
    setExerciseResult(null);
    setLanguage("en");
    window.localStorage.setItem(
      "ccp-learning-last-session",
      JSON.stringify({ moduleId: String(module._id), topicId: String(topic._id) }),
    );
  };

  const openProgram = (programId) => {
    setSelectedProgramId(String(programId));
    setError("");
    setNotice("");
  };

  const openModule = async (programId, moduleId) => {
    setError("");
    setNotice("");
    try {
      const { data } = await api.get(`/learning/programs/${programId}/modules/${moduleId}`);
      setModuleData(data);
      setExerciseResult(null);
      setAssessmentResult(null);
      const topics = data.module.topics || [];
      const saved = JSON.parse(window.localStorage.getItem("ccp-learning-last-session") || "null");
      const preferredTopic = saved?.moduleId === String(moduleId)
        ? topics.find((topic) => String(topic._id) === saved.topicId)
        : null;
      const firstIncomplete = topics.find((topic) =>
        !(data.progress.completedTopicIds || []).some((id) => String(id) === String(topic._id)),
      );
      await beginSession(data.module, preferredTopic || firstIncomplete || topics[0]);
    } catch (openError) {
      setError(openError.message || "Could not open this learning module.");
    }
  };

  const selectTopic = async (topic) => {
    if (!moduleData) return;
    setError("");
    setExerciseResult(null);
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
      const reply = data.session.messages?.at(-1)?.content;
      if (reply) speak(reply, data.replyLanguage || language);
    } catch (sendError) {
      setError(sendError.message || "The tutor could not respond. Please try again.");
    } finally {
      setBusy(false);
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

  const markTopicComplete = async () => {
    if (!moduleData || !selectedTopic) return;
    try {
      const { data } = await api.post(
        `/learning/modules/${moduleData.module._id}/topics/${selectedTopic._id}/complete`,
        { answers: topicAnswers },
      );
      if (!data.passed) {
        setTopicCheckResult(data);
        setNotice("Not quite yet. Ask the AI tutor for a hint, then try again.");
        return;
      }
      setTopicCheckResult(data);
      setModuleData({ ...moduleData, progress: data.progress, certificate: data.certificate || moduleData.certificate });
      setNotice(data.certificate
        ? data.certificateEmailSent
          ? "All module topics are complete. Your certificate is ready and has been emailed."
          : "Your certificate is ready. Email delivery failed; download it from your certificates."
        : "Topic completed. Continue with the next topic.");
      await loadStudentData();
    } catch (progressError) {
      setError(progressError.message || "Could not save topic progress.");
    }
  };

  const submitAssessment = async () => {
    if (!moduleData) return;
    try {
      const { data } = await api.post(
        `/learning/modules/${moduleData.module._id}/assessment`,
        { answers },
      );
      setAssessmentResult(data);
      setModuleData({
        ...moduleData,
        progress: data.progress,
        certificate: data.certificate || moduleData.certificate,
      });
      await loadStudentData();
    } catch (assessmentError) {
      setError(assessmentError.message || "Could not submit the assessment.");
    }
  };

  const runExercise = async (exercise) => {
    if (!moduleData || !selectedTopic) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(
        `/learning/modules/${moduleData.module._id}/topics/${selectedTopic._id}/exercises/${exercise._id}`,
        { code: exerciseCode || exercise.starterCode, subtopicId: exercise.subtopicId },
      );
      setExerciseResult(data);
      setModuleData({
        ...moduleData,
        progress: data.progress,
        certificate: data.certificate || moduleData.certificate,
      });
      if (data.accepted) {
        setNotice(exercise.type === "ACTIVITY"
          ? "Activity completed."
          : "All server-side exercise tests passed.");
      }
      await loadStudentData();
    } catch (exerciseError) {
      setError(exerciseError.message || "Could not run the exercise.");
    } finally {
      setBusy(false);
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
    setCodingOpen(false);
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
    const topicProgress = Number.isFinite(progress.progressPercentage)
      ? progress.progressPercentage
      : module.topics.length
        ? Math.round((completedTopics.length / module.topics.length) * 100)
        : 0;
    return (
      <div className="learning-center learning-workspace">
        <button className="learning-back-button" onClick={closeModule} type="button">
          <ArrowLeft size={16} /> All modules
        </button>
        <header className="learning-heading learning-workspace-heading">
          <div>
            <p className="learning-eyebrow">{moduleData.program?.title || "Learning program"} · {module.title}</p>
            <h1>{selectedTopic?.title || "Choose a topic"}</h1>
            <p>{selectedTopic?.description || module.description}</p>
          </div>
          <div className="learning-progress-summary">
            <span>Module progress</span>
            <strong>{topicProgress}%</strong>
            <div className="learning-progress-track"><span style={{ width: `${topicProgress}%` }} /></div>
          </div>
        </header>
        {error && <p className="learning-alert learning-alert-error" role="alert">{error}</p>}
        {notice && <p className="learning-alert learning-alert-success" role="status">{notice}</p>}
        <div className="learning-workspace-grid">
          <aside className="learning-panel learning-topic-panel">
            <h2>Topics</h2>
            {module.topics.map((topic, index) => {
              const isComplete = completedTopics.some((id) => String(id) === String(topic._id));
              return (
                <button
                  className={`learning-topic-button${String(topic._id) === topicId ? " is-active" : ""}`}
                  key={topic._id}
                  onClick={() => selectTopic(topic)}
                  type="button"
                >
                  <span>{isComplete ? <Check size={15} /> : <span className="learning-topic-number">{index + 1}</span>}</span>
                  <span>{topic.title}</span>
                  <ChevronRight size={15} />
                </button>
              );
            })}
            {moduleData.certificate && (
              <div className="learning-certificate">
                <Check size={17} />
                <div>
                  <strong>Module certificate</strong>
                  <small>{moduleData.certificate.code}</small>
                  <button className="learning-link-button" onClick={() => downloadCertificate(moduleData.certificate)} type="button">
                    Download certificate
                  </button>
                </div>
              </div>
            )}
          </aside>
          <div className="learning-main-column">
            <section className="learning-panel learning-lesson-panel">
              {selectedTopic ? (
                <>
                  <div className="learning-lesson-copy">
                    <h2>{selectedTopic.title}</h2>
                    <p>{selectedTopic.explanation || selectedTopic.description}</p>
                    {selectedTopic.objectives?.length > 0 && (
                      <div className="learning-objectives">
                        <strong>Learning objectives</strong>
                        <ul>{selectedTopic.objectives.map((objective, index) => <li key={`${objective}-${index}`}>{objective}</li>)}</ul>
                      </div>
                    )}
                    {selectedTopic.examples?.map((example) => (
                      <div className="learning-example" key={example._id || example.title}>
                        <strong>{example.title || "Example"}</strong>
                        {example.explanation && <p>{example.explanation}</p>}
                        {example.code && <pre><code>{example.code}</code></pre>}
                      </div>
                    ))}
                    {selectedTopic.questions?.length > 0 && (
                      <div className="learning-objectives">
                        <strong>Check your understanding</strong>
                        <p>Answer these questions to complete the topic. Ask the tutor for hints if you need them.</p>
                        {selectedTopic.questions.map((question) => (
                          <label className="learning-field" key={question._id}>
                            {question.prompt}
                            <textarea
                              rows={2}
                              maxLength={5000}
                              value={topicAnswers[String(question._id)] || ""}
                              onChange={(event) => setTopicAnswers({
                                ...topicAnswers,
                                [String(question._id)]: event.target.value,
                              })}
                            />
                          </label>
                        ))}
                        {topicCheckResult && !topicCheckResult.passed && (
                          <p className="learning-field-error" role="status">
                            {topicCheckResult.scorePercent}% matched. The tutor can give you a hint.
                          </p>
                        )}
                        {topicCheckResult?.passed && (
                          <p className="learning-success-text" role="status">Topic check passed.</p>
                        )}
                      </div>
                    )}
                    {selectedTopic.subtopics?.map((subtopic) => (
                      <details className="learning-subtopic" key={subtopic._id}>
                        <summary>{subtopic.title}</summary>
                        <p>{subtopic.explanation}</p>
                        {subtopic.objectives?.map((objective, index) => <p key={`${objective}-${index}`}>• {objective}</p>)}
                        {subtopic.examples?.map((example) => (
                          <div className="learning-example" key={example._id || example.title}>
                            <strong>{example.title || "Example"}</strong>
                            {example.explanation && <p>{example.explanation}</p>}
                            {example.code && <pre><code>{example.code}</code></pre>}
                          </div>
                        ))}
                        {subtopic.questions?.map((question, index) => (
                          <p key={question._id || index}><strong>Check your understanding:</strong> {question.prompt}</p>
                        ))}
                      </details>
                    ))}
                  </div>
                  <div className="learning-topic-actions">
                    <button className="learning-button learning-button-secondary" onClick={() => setCodingOpen((open) => !open)} type="button">
                      <Code2 size={16} /> {codingOpen ? "Close practice workspace" : "Open practice workspace"}
                    </button>
                    <button className="learning-button" onClick={markTopicComplete} type="button">
                      <Check size={16} /> {selectedTopic.questions?.length
                        ? "Check answers and complete topic"
                        : "Mark topic complete"}
                    </button>
                  </div>
                </>
              ) : <p className="learning-muted">This module does not have any topics yet.</p>}
            </section>

            {codingOpen && selectedTopic && (
              <section className="learning-panel learning-code-panel">
                <div className="learning-panel-title">
                  <div><h2>Practice workspace</h2><p>Complete a written activity or run a supported Java exercise.</p></div>
                </div>
                {getTopicExercises(selectedTopic).length ? (
                  <div className="learning-exercise">
                    {getTopicExercises(selectedTopic).length > 1 && (
                      <label className="learning-field">
                        Exercise
                        <select
                          value={exerciseId}
                          onChange={(event) => {
                            const nextExercise = getTopicExercises(selectedTopic).find(
                              (exercise) => String(exercise._id) === event.target.value,
                            );
                            setExerciseId(event.target.value);
                            setExerciseCode(nextExercise?.starterCode || "");
                            setExerciseResult(null);
                          }}
                        >
                          {getTopicExercises(selectedTopic).map((exercise) => (
                            <option key={exercise._id} value={exercise._id}>
                              {exercise.subtopicTitle ? `${exercise.subtopicTitle}: ` : ""}{exercise.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {selectedExercise && (
                      <>
                        <h3>{selectedExercise.title}</h3>
                        <p>{selectedExercise.instructions}</p>
                        {selectedExercise.type === "ACTIVITY" ? (
                          <label className="learning-field">
                            Your response
                            <textarea
                              rows={5}
                              maxLength={20000}
                              placeholder="Write your response or reflection here."
                              value={exerciseCode}
                              onChange={(event) => setExerciseCode(event.target.value)}
                            />
                          </label>
                        ) : String(selectedExercise.language || "java").toLowerCase() === "java" ? (
                          <>
                            <div className="learning-editor-wrap">
                              <CodeEditorSandbox
                                key={selectedExercise._id}
                                language="java"
                                value={exerciseCode}
                                onChange={setExerciseCode}
                                height="270px"
                              />
                            </div>
                            <button className="learning-button" disabled={busy} onClick={() => runExercise(selectedExercise)} type="button">
                              <Play size={15} /> {busy ? "Running…" : "Run exercise"}
                            </button>
                          </>
                        ) : (
                          <p className="learning-help">
                            The current secure runner supports Java exercises. Discuss this activity with the tutor or use a written activity for this subject.
                          </p>
                        )}
                        {selectedExercise.type === "ACTIVITY" && (
                          <button className="learning-button" disabled={busy} onClick={() => runExercise(selectedExercise)} type="button">
                            <Check size={15} /> {busy ? "Saving…" : "Complete activity"}
                          </button>
                        )}
                        {exerciseResult && (
                          <div className={`learning-run-result${exerciseResult.accepted ? " is-success" : ""}`} role="status">
                            <strong>{exerciseResult.accepted
                              ? selectedExercise.type === "ACTIVITY" ? "Activity completed" : "Passed"
                              : `Not passed · ${exerciseResult.passed}/${exerciseResult.total} tests`}</strong>
                            {exerciseResult.visibleResults?.map((result, index) => (
                              <p key={`${result.testCase}-${index}`}>Test {result.testCase}: {result.status} {result.output && `· ${result.output}`}</p>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : <p className="learning-muted">There are no practical exercises in this topic.</p>}
              </section>
            )}

            <section className="learning-panel learning-tutor-panel">
              <div className="learning-panel-title">
                <div><h2>{voiceProfile === "boy" ? "Rishi" : "Daisy"}</h2><p>Ask about this topic. The tutor uses the approved lesson content.</p></div>
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
              <div className="learning-conversation" aria-live="polite">
                <div className="learning-message learning-message-assistant">
                  <strong>{voiceProfile === "boy" ? "Rishi" : "Daisy"}</strong>
                  <p>Welcome, {nickname}. We will work through this topic together. What would you like to understand first?</p>
                </div>
                {messages.map((item, index) => (
                  <div className={`learning-message learning-message-${item.role}`} key={`${item.createdAt || index}-${index}`}>
                    <strong>{item.role === "assistant" ? (voiceProfile === "boy" ? "Rishi" : "Daisy") : nickname}</strong>
                    <p>{item.content}</p>
                  </div>
                ))}
                {busy && <p className="learning-muted" role="status">{voiceProfile === "boy" ? "Rishi" : "Daisy"} is thinking…</p>}
                <div ref={conversationEndRef} />
              </div>
              )}
              {nickname && <form className="learning-chat-form" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
                <textarea
                  aria-label="Message the AI tutor"
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
                <button aria-label="Send message" className="learning-button" disabled={busy || !message.trim()} type="submit">
                  <Send size={16} /> Send
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
            </section>

            {module.assessment?.questions?.length > 0 && (
              <section className="learning-panel learning-assessment-panel">
                <h2>Module assessment</h2>
                {module.assessment.questions.map((question, index) => (
                  <label className="learning-field" key={question._id}>
                    {index + 1}. {question.prompt}
                    <textarea
                      rows={2}
                      value={answers[String(question._id)] || ""}
                      onChange={(event) => setAnswers({ ...answers, [String(question._id)]: event.target.value })}
                    />
                  </label>
                ))}
                <button className="learning-button" onClick={submitAssessment} type="button">Submit assessment</button>
                {assessmentResult && (
                  <p className={assessmentResult.passed ? "learning-success-text" : "learning-muted"} role="status">
                    {assessmentResult.passed ? "Assessment passed" : "Not passed yet"} · {assessmentResult.scorePercent}%
                  </p>
                )}
              </section>
            )}
          </div>
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
        <div className="learning-module-cards">
          {selectedProgram.modules.map((module) => (
            <article className="learning-panel learning-module-card" key={module._id}>
              <div>
                <h2>{module.title}</h2>
                <p>{module.shortDescription || module.description}</p>
              </div>
              <div className="learning-module-card-meta">
                <strong>{displayPrice(module.price, module.currency)}</strong>
                <span>
                  {module.progress.completed
                    ? "Completed"
                    : `${module.progress.completedTopics} topic(s) completed`}
                </span>
              </div>
              {module.hasAccess ? (
                <button
                  className="learning-button"
                  onClick={() => openModule(selectedProgram._id, module._id)}
                  type="button"
                >
                  {module.progress.completed ? "Review topics" : "Open topics"}
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
