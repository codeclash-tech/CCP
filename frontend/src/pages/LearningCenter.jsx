import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronRight,
  Pencil,
  Mic,
  Save,
  Trash2,
  Volume2,
} from "lucide-react";
import { Link } from "react-router-dom";
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
  objectivesText: "",
};
function displayPrice(price, currencyInput = "INR") {
  const currency = /^[A-Z]{3}$/.test(currencyInput) ? currencyInput : "INR";
  return Number(price) === 0
    ? "Free"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(price));
}
function objectiveProgressKey(topicId, objectiveIndex) {
  return `${String(topicId)}:${objectiveIndex}`;
}

function createTopicDraft(topic = {}) {
  return {
    title: topic.title || "",
    description: topic.description || "",
    objectivesText: (topic.objectives || []).length
      ? topic.objectives.join("\n")
      : topic.explanation || "",
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
      setEditingTopicId("");
      setTopicError("");
      setTopicDraft(EMPTY_TOPIC);
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
        price: Number(moduleForm.price),
        accessDurationDays: moduleForm.accessDurationDays === "" ||
          moduleForm.accessDurationDays === null
          ? null
          : Number(moduleForm.accessDurationDays),
        sequence: moduleId ? Number(moduleForm.sequence) : undefined,
        estimatedDurationMinutes: Number(moduleForm.estimatedDurationMinutes) || 60,
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
    const objectives = topicDraft.objectivesText
      .split(/\r?\n/)
      .map((objective) => objective.trim())
      .filter(Boolean);
    if (!objectives.length) {
      setTopicError("Paste at least one learning objective.");
      return;
    }
    setSaving(true);
    setTopicError("");
    setError("");
    try {
      const topic = {
        title: topicDraft.title.trim(),
        description: topicDraft.description.trim(),
        explanation: objectives.join("\n"),
        objectives,
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
      setAdminPage("topics");
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
      await loadModule(moduleId);
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
            </form>
          )}
          {adminPage === "topics" && moduleId && !newModule && (
            <section className="learning-panel learning-topic-management">
              <h2>Topics for {moduleForm.title}</h2>
              <p className="learning-help">Each topic teaches only its pasted objective content.</p>
              <div className="learning-admin-topic-grid">
                {(moduleForm.topics || []).map((topic) => (
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
                  topicDraft.objectivesText.trim() &&
                  !saving
                ) void saveTopic();
              }}
            >
              <h2>{editingTopicId ? "Edit topic" : "Create topic"}</h2>
              {topicError && <p className="learning-field-error" role="alert">{topicError}</p>}
              <label className="learning-field">
                Topic name
                <input required maxLength={160} value={topicDraft.title} onChange={(event) => setTopicDraft({ ...topicDraft, title: event.target.value })} />
              </label>
              <label className="learning-field">
                Description
                <textarea required rows={2} maxLength={2000} value={topicDraft.description} onChange={(event) => setTopicDraft({ ...topicDraft, description: event.target.value })} />
              </label>
              <label className="learning-field">
                Objective content
                <textarea
                  required
                  rows={8}
                  maxLength={12000}
                  placeholder="Paste one expected learning objective per line. This is the only content the tutor will teach."
                  value={topicDraft.objectivesText}
                  onChange={(event) => setTopicDraft({ ...topicDraft, objectivesText: event.target.value })}
                />
              </label>
              <div className="learning-actions">
                <button className="learning-button" disabled={saving} onClick={saveTopic} type="button">{saving ? "Saving…" : "Save topic"}</button>
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
  const topicObjectives = selectedTopic?.objectives || [];
  const completedTopicObjectiveCount = topicObjectives.reduce(
    (count, _objective, index) =>
      count + Number(completedObjectiveKeys.has(objectiveProgressKey(selectedTopic._id, index))),
    0,
  );
  const topicProgressPercentage = topicObjectives.length
    ? Math.round((completedTopicObjectiveCount / topicObjectives.length) * 100)
    : 0;

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
    setTopicId(String(topic._id));
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
      if (data.progress) {
        setModuleData((current) => current && ({
          ...current,
          progress: data.progress,
          certificate: data.certificate || current.certificate,
        }));
        await loadStudentData();
        if (data.certificate) {
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
      (topic.objectives || []).map((_objective, index) =>
        objectiveProgressKey(topic._id, index),
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
          <section className="learning-panel learning-tutor-panel">
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
                  <p>Welcome, {nickname}. We will work through this topic together. What would you like to understand first?</p>
                </div>
                {messages.map((item, index) => (
                  <div className={`learning-message learning-message-${item.role}`} key={`${item.createdAt || index}-${index}`}>
                    <strong>{item.role === "assistant" ? (voiceProfile === "boy" ? "Rishi" : "Daisy") : nickname}</strong>
                    <p>{item.content}</p>
                  </div>
                ))}
                {busy && <p className="learning-muted" role="status">{voiceProfile === "boy" ? "Rishi" : "Daisy"} is thinking…</p>}
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
          </section>
          <aside className="learning-panel learning-lesson-panel learning-objective-card">
            {selectedTopic ? (
              <>
                <div className="learning-panel-title">
                  <div>
                    <h2>{selectedTopic.title}</h2>
                    <p>{selectedTopic.description}</p>
                  </div>
                  <strong className="learning-objective-count">
                    {completedTopicObjectiveCount}/{topicObjectives.length}
                  </strong>
                </div>
                <div className="learning-objective-progress">
                  <span style={{ width: `${topicProgressPercentage}%` }} />
                </div>
                <p className="learning-objective-progress-label">
                  {completedTopicObjectiveCount} of {topicObjectives.length} objectives complete
                </p>
                <div className="learning-objective-list">
                  {topicObjectives.map((objective, index) => {
                    const isComplete = completedObjectiveKeys.has(
                      objectiveProgressKey(selectedTopic._id, index),
                    );
                    return (
                      <div className="learning-objective-item" key={`${objective}-${index}`}>
                        <span className={isComplete ? "is-complete" : ""}>
                          {isComplete ? <Check size={14} /> : index + 1}
                        </span>
                        <p>{objective}</p>
                      </div>
                    );
                  })}
                  {!topicObjectives.length && (
                    <p className="learning-muted">This topic has no learning objectives yet.</p>
                  )}
                </div>
              </>
            ) : <p className="learning-muted">Choose a topic to see its objectives.</p>}
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
              </div>
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
