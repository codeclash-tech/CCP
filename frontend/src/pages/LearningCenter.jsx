import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
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
} from "../services/learningVoiceService";
import { getAssessmentRole, ASSESSMENT_ROLES } from "../routes/roleAccess";
import { useAuth } from "../context/AuthContext";
import "./LearningCenter.css";

const EMPTY_PROGRAM = {
  title: "",
  description: "",
  language: "java",
  price: 0,
};

const EMPTY_MODULE = {
  title: "",
  description: "",
  price: 0,
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

function displayPrice(price) {
  return Number(price) === 0 ? "Free" : `₹${Number(price).toFixed(2)}`;
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
  const [jsonFields, setJsonFields] = useState({
    objectives: "[]",
    prerequisites: "[]",
    topics: "[]",
    assessment: JSON.stringify(EMPTY_MODULE.assessment, null, 2),
    completionRequirements: JSON.stringify(EMPTY_MODULE.completionRequirements, null, 2),
  });
  const [newProgram, setNewProgram] = useState(EMPTY_PROGRAM);
  const [newModule, setNewModule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
            language: program.language,
            price: program.price,
          }
        : EMPTY_PROGRAM,
    );
  }, [programs, selectedProgramId]);

  useEffect(() => {
    setModuleId("");
    setModuleForm(EMPTY_MODULE);
    setNewModule(false);
  }, [selectedProgramId]);

  const loadModule = async (id) => {
    setError("");
    setNotice("");
    try {
      const { data } = await api.get(`/learning/admin/modules/${id}`);
      const module = data.module;
      setModuleId(String(module._id));
      setNewModule(false);
      setModuleForm(module);
      setJsonFields({
        objectives: JSON.stringify(module.objectives || [], null, 2),
        prerequisites: JSON.stringify(module.prerequisites || [], null, 2),
        topics: JSON.stringify(module.topics || [], null, 2),
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
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/learning/admin/programs", newProgram);
      setNewProgram(EMPTY_PROGRAM);
      setNotice("Learning program created as a draft.");
      const { data: list } = await api.get("/learning/admin/programs");
      setPrograms(list.programs || []);
      setSelectedProgramId(String(data.program._id));
    } catch (saveError) {
      setError(saveError.message || "Could not create the learning program.");
    } finally {
      setSaving(false);
    }
  };

  const createJavaStructure = async () => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/learning/admin/programs/java-template");
      setNotice("Created a draft Java program with 10 blank modules. Add official content before publishing.");
      await loadAdminData();
      setSelectedProgramId(String(data.program._id));
    } catch (saveError) {
      setError(saveError.message || "Could not create the Java module structure.");
    } finally {
      setSaving(false);
    }
  };

  const saveProgram = async (event) => {
    event.preventDefault();
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

  const startNewModule = () => {
    setModuleId("");
    setModuleForm({
      ...EMPTY_MODULE,
      sequence: (selectedProgram?.modules?.length || 0) + 1,
    });
    setJsonFields({
      objectives: "[]",
      prerequisites: "[]",
      topics: "[]",
      assessment: JSON.stringify(EMPTY_MODULE.assessment, null, 2),
      completionRequirements: JSON.stringify(EMPTY_MODULE.completionRequirements, null, 2),
    });
    setNewModule(true);
    setError("");
    setNotice("");
  };

  const saveModule = async (event) => {
    event.preventDefault();
    if (!selectedProgram) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...moduleForm,
        price: Number(moduleForm.price),
        sequence: Number(moduleForm.sequence),
        estimatedDurationMinutes: Number(moduleForm.estimatedDurationMinutes),
        objectives: parseJsonField(jsonFields.objectives, "Objectives"),
        prerequisites: parseJsonField(jsonFields.prerequisites, "Prerequisites"),
        topics: parseJsonField(jsonFields.topics, "Topics"),
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
          <p className="learning-eyebrow">Learning management</p>
          <h1>Learning programs</h1>
          <p>Create and maintain all official lessons, activities, and module requirements.</p>
        </div>
        <BookOpen size={24} aria-hidden="true" />
      </header>
      {error && <p className="learning-alert learning-alert-error" role="alert">{error}</p>}
      {notice && <p className="learning-alert learning-alert-success" role="status">{notice}</p>}

      <section className="learning-management-grid">
        <div className="learning-panel">
          <h2>Programs</h2>
          <label className="learning-field">
            Select program
            <select
              value={selectedProgramId}
              onChange={(event) => setSelectedProgramId(event.target.value)}
            >
              <option value="">Choose a program</option>
              {programs.map((program) => (
                <option key={program._id} value={program._id}>
                  {program.title} · {program.status}
                </option>
              ))}
            </select>
          </label>
          <form className="learning-form" onSubmit={createProgram}>
            <h3>Create a program</h3>
            <label className="learning-field">
              Program name
              <input
                required
                maxLength={140}
                value={newProgram.title}
                onChange={(event) => setNewProgram({ ...newProgram, title: event.target.value })}
              />
            </label>
            <label className="learning-field">
              Description
              <textarea
                required
                maxLength={4000}
                rows={3}
                value={newProgram.description}
                onChange={(event) => setNewProgram({ ...newProgram, description: event.target.value })}
              />
            </label>
            <div className="learning-field-row">
              <label className="learning-field">
                Language
                <input
                  required
                  value={newProgram.language}
                  onChange={(event) => setNewProgram({ ...newProgram, language: event.target.value })}
                />
              </label>
              <label className="learning-field">
                Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newProgram.price}
                  onChange={(event) => setNewProgram({ ...newProgram, price: event.target.value })}
                />
              </label>
            </div>
            <button className="learning-button" disabled={saving} type="submit">
              Create draft program
            </button>
            {!programs.some((program) => program.language === "java" && program.title === "Java") && (
              <button
                className="learning-button learning-button-secondary"
                disabled={saving}
                onClick={createJavaStructure}
                type="button"
              >
                Create Java program with 10 blank modules
              </button>
            )}
          </form>

          {selectedProgram && (
            <form className="learning-form learning-form-divider" onSubmit={saveProgram}>
              <h3>Program settings</h3>
              <label className="learning-field">
                Name
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
              <div className="learning-field-row">
                <label className="learning-field">
                  Language
                  <input
                    value={programForm.language}
                    onChange={(event) => setProgramForm({ ...programForm, language: event.target.value })}
                  />
                </label>
                <label className="learning-field">
                  Price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={programForm.price}
                    onChange={(event) => setProgramForm({ ...programForm, price: event.target.value })}
                  />
                </label>
              </div>
              <div className="learning-actions">
                <button className="learning-button" disabled={saving} type="submit">
                  <Save size={15} /> Save program
                </button>
                <button
                  className="learning-button learning-button-secondary"
                  disabled={saving}
                  onClick={changeProgramStatus}
                  type="button"
                >
                  {selectedProgram.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="learning-panel">
          <div className="learning-panel-title">
            <div>
              <h2>Modules and lesson content</h2>
              <p>{selectedProgram ? `${selectedProgram.modules.length} module(s)` : "Select or create a program first."}</p>
            </div>
            {selectedProgram && (
              <button className="learning-button learning-button-secondary" onClick={startNewModule} type="button">
                Add module
              </button>
            )}
          </div>
          {selectedProgram?.modules?.length > 0 && (
            <div className="learning-module-list">
              {selectedProgram.modules.map((module) => (
                <button
                  className={`learning-module-row${String(module._id) === moduleId ? " is-selected" : ""}`}
                  key={module._id}
                  onClick={() => loadModule(module._id)}
                  type="button"
                >
                  <span>{module.sequence}. {module.title}</span>
                  <small>{displayPrice(module.price)} · {module.difficulty}</small>
                </button>
              ))}
            </div>
          )}
          {(newModule || moduleId) && (
            <form className="learning-form learning-form-divider" onSubmit={saveModule}>
              <h3>{newModule ? "New module" : "Edit module"}</h3>
              <div className="learning-field-row">
                <label className="learning-field">
                  Module name
                  <input
                    required
                    maxLength={160}
                    value={moduleForm.title || ""}
                    onChange={(event) => setModuleForm({ ...moduleForm, title: event.target.value })}
                  />
                </label>
                <label className="learning-field">
                  Sequence
                  <input
                    required
                    type="number"
                    min="1"
                    value={moduleForm.sequence || 1}
                    onChange={(event) => setModuleForm({ ...moduleForm, sequence: event.target.value })}
                  />
                </label>
              </div>
              <label className="learning-field">
                Description
                <textarea
                  required
                  rows={3}
                  value={moduleForm.description || ""}
                  onChange={(event) => setModuleForm({ ...moduleForm, description: event.target.value })}
                />
              </label>
              <div className="learning-field-row">
                <label className="learning-field">
                  Price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={moduleForm.price ?? 0}
                    onChange={(event) => setModuleForm({ ...moduleForm, price: event.target.value })}
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
              </div>
              <label className="learning-field">
                Estimated duration (minutes)
                <input
                  type="number"
                  min="1"
                  value={moduleForm.estimatedDurationMinutes || 60}
                  onChange={(event) => setModuleForm({ ...moduleForm, estimatedDurationMinutes: event.target.value })}
                />
              </label>
              {[
                ["objectives", "Module learning objectives"],
                ["prerequisites", "Prerequisite module IDs"],
                ["topics", "Topics and subtopics (JSON)"],
                ["assessment", "Assessment questions and expected answers (JSON)"],
                ["completionRequirements", "Completion requirements (JSON)"],
              ].map(([field, label]) => (
                <label className="learning-field" key={field}>
                  {label}
                  <textarea
                    className="learning-json-field"
                    rows={field === "topics" ? 11 : 5}
                    spellCheck="false"
                    value={jsonFields[field]}
                    onChange={(event) => setJsonFields({ ...jsonFields, [field]: event.target.value })}
                  />
                </label>
              ))}
              <details className="learning-content-template">
                <summary>View the editable topic structure</summary>
                <pre>{`[
  {
    "title": "",
    "description": "",
    "explanation": "",
    "objectives": [],
    "examples": [{ "title": "", "explanation": "", "code": "", "language": "java" }],
    "questions": [{ "prompt": "", "expectedAnswer": "", "acceptedAnswers": [] }],
    "exercises": [{
      "title": "",
      "instructions": "",
      "starterCode": "",
      "language": "java",
      "tests": [{ "input": "", "expectedOutput": "", "visible": true }]
    }],
    "subtopics": [{ "title": "", "explanation": "", "objectives": [], "examples": [], "questions": [], "exercises": [] }]
  }
]`}</pre>
              </details>
              <p className="learning-help">
                Topic objects support title, description, explanation, objectives, examples, questions, exercises, and subtopics. Exercise tests and assessment answers stay server-side.
              </p>
              <button className="learning-button" disabled={saving} type="submit">
                <Save size={15} /> {saving ? "Saving…" : "Save module content"}
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="learning-panel learning-purchase-panel">
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
                {purchase.status === "PENDING" && (
                  <div className="learning-actions">
                    <button className="learning-button" onClick={() => reviewPurchase(purchase._id, "ACTIVE")} type="button">
                      Approve access
                    </button>
                    <button className="learning-button learning-button-secondary" onClick={() => reviewPurchase(purchase._id, "REJECTED")} type="button">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StudentLearning() {
  const [programs, setPrograms] = useState([]);
  const [dashboard, setDashboard] = useState({
    progress: [],
    purchases: [],
    certificates: [],
    page: 1,
    limit: 20,
    totals: { completedModules: 0, certificates: 0 },
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moduleData, setModuleData] = useState(null);
  const [topicId, setTopicId] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState("en");
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState("");
  const [voiceOutput, setVoiceOutput] = useState(true);
  const [voiceError, setVoiceError] = useState("");
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

  const loadStudentData = async (page = 1, append = false) => {
    try {
      const [programResponse, dashboardResponse] = await Promise.all([
        page === 1
          ? api.get("/learning/programs")
          : Promise.resolve({ data: { programs: [] } }),
        api.get(`/learning/me?page=${page}&limit=20`),
      ]);
      if (page === 1) setPrograms(programResponse.data.programs || []);
      setDashboard((current) => append
        ? {
            ...dashboardResponse.data,
            progress: [...current.progress, ...dashboardResponse.data.progress],
            purchases: [...current.purchases, ...dashboardResponse.data.purchases],
            certificates: [...current.certificates, ...dashboardResponse.data.certificates],
          }
        : dashboardResponse.data,
      );
    } catch (loadError) {
      setError(loadError.message || "Could not load learning programs.");
    } finally {
      setLoadingMore(false);
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

  const selectedTopic = useMemo(
    () => moduleData?.module?.topics?.find((topic) => String(topic._id) === topicId) || null,
    [moduleData, topicId],
  );
  const selectedExercise = useMemo(
    () => getTopicExercises(selectedTopic).find((exercise) => String(exercise._id) === exerciseId) || null,
    [exerciseId, selectedTopic],
  );

  const beginSession = async (module, topic, selectedLanguage = language) => {
    if (!topic) return;
    const { data } = await api.post("/learning/sessions", {
      moduleId: module._id,
      topicId: topic._id,
      language: selectedLanguage,
    });
    setSession(data.session);
    setMessages(data.session.messages || []);
    setTopicId(String(topic._id));
    const firstExercise = getTopicExercises(topic)[0];
    setExerciseId(String(firstExercise?._id || ""));
    setExerciseCode(firstExercise?.starterCode || "");
    setExerciseResult(null);
    setLanguage(selectedLanguage);
    window.localStorage.setItem(
      "ccp-learning-last-session",
      JSON.stringify({ moduleId: String(module._id), topicId: String(topic._id) }),
    );
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

  const speak = (text) => {
    if (!voiceOutput) return;
    if (!voiceProviders.output) {
      setVoiceError("Voice output is not available in this desktop runtime. Tutor text remains available.");
      return;
    }
    voiceProviders.output.speak(text, { language, voiceName });
  };

  const sendMessage = async (input = message) => {
    const text = String(input || "").trim();
    if (!text || !session) return;
    setBusy(true);
    setError("");
    setVoiceError("");
    setMessage("");
    try {
      const { data } = await api.post(`/learning/sessions/${session._id}/messages`, {
        message: text,
        language,
      });
      setSession(data.session);
      setMessages(data.session.messages || []);
      const reply = data.session.messages?.at(-1)?.content;
      if (reply) speak(reply);
    } catch (sendError) {
      setError(sendError.message || "The tutor could not respond. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const startVoiceInput = () => {
    if (!voiceProviders.input) {
      setVoiceError("Speech recognition is not available in this desktop runtime. You can still type to the tutor.");
      return;
    }
    try {
      voiceProviders.input.start({
        language,
        onTranscript: (transcript) => sendMessage(transcript),
        onError: setVoiceError,
      });
    } catch {
      setVoiceError("Could not start speech input. Check microphone permission or type your question.");
    }
  };

  const requestPurchase = async (target) => {
    setError("");
    setNotice("");
    try {
      await api.post("/learning/purchases", target);
      setNotice("Purchase request recorded. A Super Admin must approve access; no payment was taken.");
      await loadStudentData();
    } catch (purchaseError) {
      setError(purchaseError.message || "Could not create the purchase request.");
    }
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
      link.download = `CodeClash-Learning-${certificate.code}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError.message || "Could not download this certificate.");
    }
  };

  const markTopicComplete = async () => {
    if (!moduleData || !selectedTopic) return;
    try {
      const { data } = await api.post(
        `/learning/modules/${moduleData.module._id}/topics/${selectedTopic._id}/complete`,
      );
      setModuleData({ ...moduleData, progress: data.progress, certificate: data.certificate || moduleData.certificate });
      setNotice(data.certificate ? "Module completed. Your certificate is ready." : "Topic progress saved.");
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
      if (data.accepted) setNotice("All server-side exercise tests passed.");
      await loadStudentData();
    } catch (exerciseError) {
      setError(exerciseError.message || "Could not run the exercise.");
    } finally {
      setBusy(false);
    }
  };

  const closeModule = () => {
    voiceProviders.output?.cancel();
    setModuleData(null);
    setTopicId("");
    setSession(null);
    setMessages([]);
    setCodingOpen(false);
  };

  if (moduleData) {
    const { module, progress } = moduleData;
    const completedTopics = progress.completedTopicIds || [];
    const topicProgress = module.topics.length
      ? Math.round((completedTopics.length / module.topics.length) * 100)
      : 0;
    return (
      <div className="learning-center learning-workspace">
        <button className="learning-back-button" onClick={closeModule} type="button">
          <ArrowLeft size={16} /> All programs
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
                        <ul>
                          {selectedTopic.questions.map((question) => (
                            <li key={question._id}>{question.prompt}</li>
                          ))}
                        </ul>
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
                      <Code2 size={16} /> {codingOpen ? "Close coding workspace" : "Open coding workspace"}
                    </button>
                    <button className="learning-button" onClick={markTopicComplete} type="button">
                      <Check size={16} /> Mark topic complete
                    </button>
                  </div>
                </>
              ) : <p className="learning-muted">This module does not have any topics yet.</p>}
            </section>

            {codingOpen && selectedTopic && (
              <section className="learning-panel learning-code-panel">
                <div className="learning-panel-title">
                  <div><h2>Coding workspace</h2><p>Exercises are evaluated by CodeClash's existing secure Java execution service.</p></div>
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
                        <div className="learning-editor-wrap">
                          <CodeEditorSandbox
                            key={selectedExercise._id}
                            language={selectedExercise.language || "java"}
                            value={exerciseCode}
                            onChange={setExerciseCode}
                            height="270px"
                          />
                        </div>
                        <button className="learning-button" disabled={busy} onClick={() => runExercise(selectedExercise)} type="button">
                          <Play size={15} /> {busy ? "Running…" : "Run exercise"}
                        </button>
                        {exerciseResult && (
                          <div className={`learning-run-result${exerciseResult.accepted ? " is-success" : ""}`} role="status">
                            <strong>{exerciseResult.accepted ? "Passed" : `Not passed · ${exerciseResult.passed}/${exerciseResult.total} tests`}</strong>
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
                <div><h2>AI tutor</h2><p>Ask freely; the tutor uses the approved content for this topic.</p></div>
              </div>
              <div className="learning-tutor-controls">
                <label className="learning-field">
                  Language
                  <select
                    value={language}
                    onChange={(event) => {
                      const nextLanguage = event.target.value;
                      setLanguage(nextLanguage);
                      if (module && selectedTopic) beginSession(module, selectedTopic, nextLanguage).catch((sessionError) => setError(sessionError.message));
                    }}
                  >
                    <option value="en">English</option>
                    <option value="ta">தமிழ்</option>
                  </select>
                </label>
                <label className="learning-field">
                  Voice
                  <select value={voiceName} onChange={(event) => setVoiceName(event.target.value)}>
                    <option value="">System default</option>
                    {voices.map((voice) => <option key={`${voice.name}-${voice.lang}`} value={voice.name}>{voice.name} · {voice.lang}</option>)}
                  </select>
                </label>
                <label className="learning-voice-toggle">
                  <input type="checkbox" checked={voiceOutput} onChange={(event) => setVoiceOutput(event.target.checked)} />
                  <Volume2 size={16} /> Voice output
                </label>
              </div>
              <div className="learning-conversation" aria-live="polite">
                {messages.length === 0 && <p className="learning-muted">Say hello or ask a question about this topic.</p>}
                {messages.map((item, index) => (
                  <div className={`learning-message learning-message-${item.role}`} key={`${item.createdAt || index}-${index}`}>
                    <strong>{item.role === "assistant" ? "Tutor" : "You"}</strong>
                    <p>{item.content}</p>
                  </div>
                ))}
                {busy && <p className="learning-muted" role="status">The tutor is preparing a response…</p>}
              </div>
              <form className="learning-chat-form" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
                <textarea
                  aria-label="Message the AI tutor"
                  maxLength={2000}
                  placeholder="Ask a question about this topic…"
                  rows={2}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <button aria-label="Speak to tutor" className="learning-button learning-button-secondary" onClick={startVoiceInput} type="button">
                  <Mic size={17} />
                </button>
                <button aria-label="Send message" className="learning-button" disabled={busy || !message.trim()} type="submit">
                  <Send size={16} />
                </button>
              </form>
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

  return (
    <div className="learning-center">
      <header className="learning-heading">
        <div>
          <p className="learning-eyebrow">CodeClash learning</p>
          <h1>Learn with an AI tutor</h1>
          <p>Choose a module to learn at your pace. Your progress and certificates are saved to your account.</p>
        </div>
        <BookOpen size={24} aria-hidden="true" />
      </header>
      {error && <p className="learning-alert learning-alert-error" role="alert">{error}</p>}
      {notice && <p className="learning-alert learning-alert-success" role="status">{notice}</p>}
      <section className="learning-certificate-strip">
        <div><strong>{dashboard.totals.completedModules}</strong><span>modules completed</span></div>
        <div><strong>{dashboard.totals.certificates}</strong><span>certificates earned</span></div>
        {dashboard.certificates.slice(0, 3).map((certificate) => (
          <div className="learning-certificate-mini" key={certificate._id}>
            <Check size={15} /><span>{certificate.moduleId?.title || "Completed module"}</span>
          </div>
        ))}
      </section>
      {programs.length === 0 ? (
        <section className="learning-panel"><p className="learning-muted">No learning programs are published yet.</p></section>
      ) : (
        <div className="learning-program-grid">
          {programs.map((program) => (
            <section className="learning-panel learning-program-card" key={program._id}>
              <div className="learning-program-header">
                <div><span className="learning-program-language">{program.language}</span><h2>{program.title}</h2></div>
                <span className="learning-price">{displayPrice(program.price)}</span>
              </div>
              <p>{program.description}</p>
              {program.modules.map((module) => (
                <div className="learning-catalog-module" key={module._id}>
                  <div className="learning-catalog-module-copy">
                    <strong>{module.sequence}. {module.title}</strong>
                    <span>{module.difficulty} · {module.estimatedDurationMinutes} min · {displayPrice(module.price)}</span>
                    <span className="learning-module-progress">
                      {module.progress.completed ? "Completed" : `${module.progress.completedTopics} topic(s) completed`}
                    </span>
                  </div>
                  {module.hasAccess ? (
                    <button className="learning-button learning-button-small" onClick={() => openModule(program._id, module._id)} type="button">
                      Resume <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button
                      className="learning-button learning-button-secondary learning-button-small"
                      disabled={module.purchaseStatus === "PENDING" || module.purchaseStatus === "ACTIVE"}
                      onClick={() => requestPurchase({ moduleId: module._id })}
                      type="button"
                    >
                      {module.purchaseStatus === "PENDING" ? "Pending approval" : module.purchaseStatus === "ACTIVE" ? "Prerequisite required" : "Request module access"}
                    </button>
                  )}
                </div>
              ))}
              <div className="learning-program-purchase">
                <span>Program access · {displayPrice(program.price)}</span>
                <button
                  className="learning-link-button"
                  disabled={program.purchaseStatus === "PENDING" || program.purchaseStatus === "ACTIVE"}
                  onClick={() => requestPurchase({ programId: program._id })}
                  type="button"
                >
                  {program.purchaseStatus === "PENDING" ? "Request pending" : program.purchaseStatus === "ACTIVE" ? "Program access active" : "Request program purchase"}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
      {dashboard.certificates.length > 0 && (
        <section className="learning-panel learning-earned-certificates">
          <h2>Earned certificates</h2>
          <div className="learning-request-list">
            {dashboard.certificates.map((certificate) => (
              <div className="learning-request-row" key={certificate._id}>
                <div>
                  <strong>{certificate.moduleId?.title || "Completed module"}</strong>
                  <span>{certificate.programId?.title || "Learning program"}</span>
                  <small>Certificate code: {certificate.code}</small>
                </div>
                <div className="learning-certificate-actions">
                  <small>{new Date(certificate.earnedAt).toLocaleDateString()}</small>
                  <button className="learning-link-button" onClick={() => downloadCertificate(certificate)} type="button">
                    Download PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
          {dashboard.certificates.length < dashboard.totals.certificates && (
            <button
              className="learning-button learning-button-secondary"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                loadStudentData(dashboard.page + 1, true);
              }}
              type="button"
            >
              {loadingMore ? "Loading…" : "Load more certificates"}
            </button>
          )}
        </section>
      )}
      <p className="learning-interview-note">
        A completed module certificate may make you eligible to apply for an AMUX technical interview. It does not guarantee an internship or job.
      </p>
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
