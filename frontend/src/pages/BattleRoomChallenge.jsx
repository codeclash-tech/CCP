import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRoomByCode,
  submitSolution as submitQuestionSolution,
  runSolution as runQuestionSolution,
  startRoom,
  shareKey,
  endTest as endRoomTest,
} from "../services/battleRoomService";
import api from "../services/api";

import CodeEditorSandbox from "../components/editor/CodeEditorSandbox";
import Console from "../components/editor/Console";
import ProctorGuard from "../components/editor/ProctorGuard";
import RoomKeyModal from "../components/battleRoom/RoomKeyModal";
import {
  DIFFICULTY_COLORS,
  LANGUAGE_BY_ID,
} from "../utils/constants";
import {
  beginExecutionTrace,
  finishExecutionTrace,
} from "../utils/executionPerformance";
import {
  Swords,
  Clock,
  Trophy,
  Play,
  CheckCircle2,
  Loader2,
  Timer,
  ListOrdered,
  RefreshCw,
  Monitor,
  KeyRound,
  AlertTriangle,
  Code2,
  X,
} from "lucide-react";
import { isMobileDevice } from "../utils/device";

function RoomTimer({ endTime, onTimeUp }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const timeUpCalledRef = useRef(false);

  useEffect(() => {
    if (!endTime) return;
    timeUpCalledRef.current = false;

    const updateTimer = () => {
      const now = new Date();
      const end = new Date(endTime);
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(diff);

      if (diff <= 0 && !timeUpCalledRef.current) {
        timeUpCalledRef.current = true;
        onTimeUp();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endTime, onTimeUp]);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;
  const isLow = timeLeft < 300;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: isLow ? "var(--color-danger)" : "var(--text-primary)",
        fontSize: 14,
        fontFamily: "var(--font-code)",
        fontWeight: 600,
      }}
    >
      <Timer
        size={16}
        color={isLow ? "var(--color-danger)" : "var(--accent-blue-bright)"}
      />
      <span>
        {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
        {String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}

function getQuestionStarter(question) {
  const starterByLang = question?.starterCodeByLanguage || {};
  const languageDefault = LANGUAGE_BY_ID.java;
  return (
    starterByLang.java ||
    languageDefault.defaultStarter ||
    question?.starterCode ||
    ""
  );
}

function readRoomEditorCache(roomCode) {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(`battle-room-editor:${roomCode}`) || "{}",
    );
    return {
      codeByQuestion:
        saved.codeByQuestion && typeof saved.codeByQuestion === "object"
          ? saved.codeByQuestion
          : {},
      resultByQuestion:
        saved.resultByQuestion && typeof saved.resultByQuestion === "object"
          ? saved.resultByQuestion
          : {},
    };
  } catch (error) {
    console.warn("Unable to restore battle editor draft:", error.message);
    return { codeByQuestion: {}, resultByQuestion: {} };
  }
}

function saveRoomEditorCache(roomCode, codeByQuestion, resultByQuestion) {
  try {
    sessionStorage.setItem(
      `battle-room-editor:${roomCode}`,
      JSON.stringify({ codeByQuestion, resultByQuestion }),
    );
  } catch (error) {
    console.warn("Unable to save battle editor draft:", error.message);
  }
}

function toOfficialConsoleResult(result) {
  return {
    status: result.status,
    accepted: result.status === "ACCEPTED",
    passed: result.passed || 0,
    failed: result.failed || 0,
    total: result.total || 0,
    score: result.score || 0,
    results: result.results || [],
    error: result.error || "",
  };
}

export default function BattleRoomChallenge() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(isMobileDevice);
  const isDesktop =
    typeof window !== "undefined" &&
    typeof window.codeClashDesktop?.engine?.execute === "function";

  const [room, setRoom] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [code, setCode] = useState("");
  const selectedLanguage = "java";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [userSubmissionState, setUserSubmissionState] = useState(null);
  const [disqualified, setDisqualified] = useState(false);
  const [questionResults, setQuestionResults] = useState([]);
  const [currentResult, setCurrentResult] = useState(null);
  const [currentResultAuthority, setCurrentResultAuthority] = useState("LOCAL");
  const [isCreator, setIsCreator] = useState(false);
  const [showStartPrompt, setShowStartPrompt] = useState(false);
  const [proctorEnabled, setProctorEnabled] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [roomKey, setRoomKey] = useState("");
  const [questionsVisible, setQuestionsVisible] = useState(false);
  const [windowState, setWindowState] = useState(null);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [expandedQuestion, setExpandedQuestion] = useState(-1);

  // Resizable panels
  const [leftWidth, setLeftWidth] = useState(380);
  const [consoleHeight, setConsoleHeight] = useState(280);
  const mainRef = useRef(null);
  const draggingLeftRef = useRef(false);
  const draggingConsoleRef = useRef(false);
  const submitInFlightRef = useRef(false);

  const draftRoomCodeRef = useRef(null);
  const fetchInFlightRef = useRef(false);
  const codeByQuestionRef = useRef({});
  const resultByQuestionRef = useRef({});
  const activeQuestionIdRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    const updateViewport = () => setIsMobile(isMobileDevice());
    updateViewport();
    window.addEventListener("resize", updateViewport);
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    coarsePointerQuery.addEventListener("change", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      coarsePointerQuery.removeEventListener("change", updateViewport);
    };
  }, []);

  const fetchRoom = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    const showInitialLoading = !draftRoomCodeRef.current;
    if (showInitialLoading) {
      setLoading(true);
      setError("");
    }
    try {
      const data = await getRoomByCode(roomCode);
      setRoom(data.room);
      setUserSubmissionState(data.userSubmission || null);
      setIsCreator(data.isCreator);
      setQuestionsVisible(!!data.questionsVisible);
      setWindowState(data.room?.windowState || null);
      setRoomKey(data.roomKey || "");

      const submittedResults = data.userSubmission?.questionResults || [];
      const roomQuestions = data.room.questions || [];
      const serverResults = roomQuestions.length
        ? roomQuestions.map((question) => {
        const saved = submittedResults.find(
          (item) => String(item.questionId) === String(question._id),
        );
        return saved || { questionId: question._id, status: "PENDING" };
          })
        : submittedResults;
      setQuestionResults(serverResults);

      const isNewRoom = draftRoomCodeRef.current !== roomCode;
      if (isNewRoom) {
        draftRoomCodeRef.current = roomCode;
        const savedCache = readRoomEditorCache(roomCode);
        codeByQuestionRef.current = savedCache.codeByQuestion;
        resultByQuestionRef.current = savedCache.resultByQuestion;
        activeQuestionIdRef.current = null;
        setCurrentResult(null);
        const firstQuestion = data.room.questions?.[0];
        if (firstQuestion) {
          const starter = getQuestionStarter(firstQuestion);
          const persistedResult = submittedResults.find(
            (item) => String(item.questionId) === String(firstQuestion._id),
          );
          const restoredCode =
            persistedResult?.code ||
            (codeByQuestionRef.current[firstQuestion._id] ?? starter);
          codeByQuestionRef.current[firstQuestion._id] = restoredCode;
          activeQuestionIdRef.current = firstQuestion._id;
          setCode(restoredCode);
          setCurrentQuestionIndex(0);
          const cachedResult =
            resultByQuestionRef.current[firstQuestion._id];
          if (persistedResult?.verificationStatus === "VERIFIED") {
            setCurrentResult(toOfficialConsoleResult(persistedResult));
            setCurrentResultAuthority("OFFICIAL");
          } else {
            setCurrentResult(
              cachedResult?.code === restoredCode ? cachedResult.result : null,
            );
            setCurrentResultAuthority("LOCAL");
          }
        }
      }

      const activeQuestionId = activeQuestionIdRef.current;
      const activePersistedResult = submittedResults.find(
        (item) => String(item.questionId) === String(activeQuestionId),
      );
      if (activePersistedResult?.verificationStatus === "VERIFIED") {
        setCurrentResult(toOfficialConsoleResult(activePersistedResult));
        setCurrentResultAuthority("OFFICIAL");
      }

      const hasScheduledWindow = Boolean(
        data.room.scheduledDate && data.room.scheduledStartTime,
      );
      setShowStartPrompt(
        data.room.status === "UPCOMING" &&
          data.isCreator &&
          !hasScheduledWindow,
      );

      if (data.userSubmission && data.userSubmission.status === "COMPLETED") {
        setSubmitted(true);
      }
      if (
        data.userSubmission &&
        data.userSubmission.status === "DISQUALIFIED"
      ) {
        setDisqualified(true);
        setSubmitted(true);
      }

      const userFinished =
        data.userSubmission &&
        (data.userSubmission.status === "COMPLETED" ||
          data.userSubmission.status === "DISQUALIFIED");
      if (data.room.status === "ACTIVE" && !userFinished && !isMobileDevice()) {
        setProctorEnabled(true);
      }

      startTimeRef.current = Date.now();
    } catch (err) {
      const msg = err.message || "Failed to load battle room.";
      if (err.response?.data?.roomClosed || err.roomClosed) {
        setError("This battle has ended and is only viewable by its creator.");
        setSubmitted(true);
      } else {
        setError(msg);
      }
    } finally {
      fetchInFlightRef.current = false;
      if (showInitialLoading) {
        setLoading(false);
      }
    }
  }, [roomCode]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (!isMobile && room?.status === "ACTIVE" && !submitted) {
      setProctorEnabled(true);
    }
  }, [isMobile, room?.status, submitted]);

  // Auto-refresh while the participant is waiting for the scheduled window to
  // open (or is on the not-started screen) so they unlock without a manual
  // reload. The backend remains authoritative; this is purely a UX convenience.
  useEffect(() => {
    if (windowState && windowState !== "NOT_STARTED") return;
    if (!room || isCreator) return;
    const id = setInterval(() => {
      fetchRoom();
    }, 30000);
    return () => clearInterval(id);
  }, [windowState, room, isCreator, fetchRoom]);

  useEffect(() => {
    const verificationPending = questionResults.some((result) =>
      ["PENDING_VERIFICATION", "VERIFYING"].includes(
        result.verificationStatus,
      ),
    );
    if (!verificationPending || !room || submitted) return undefined;
    const intervalId = window.setInterval(fetchRoom, 2000);
    return () => window.clearInterval(intervalId);
  }, [questionResults, room, submitted, fetchRoom]);

  const handleStartRoom = async () => {
    if (isMobileDevice()) {
      setIsMobile(true);
      setError("Tests can only be attended using a desktop or PC.");
      return;
    }
    try {
      await startRoom(roomCode);
      const data = await getRoomByCode(roomCode);
      setRoom(data.room);
      setQuestionsVisible(!!data.questionsVisible);
      setShowStartPrompt(false);
      setProctorEnabled(true);
    } catch (err) {
      setError(err.message || "Failed to start room.");
    }
  };

  const handleTimeUp = async () => {
    setSubmitting(true);
    try {
      const result = await endRoomTest(roomCode);
      if (["COMPLETED", "DISQUALIFIED"].includes(result.status)) {
        setSubmitted(true);
      } else {
        setError("Time is up. Your accepted submissions are still being verified.");
      }
      await fetchRoom();
    } catch (endError) {
      setError(endError.message || "The test could not be finalized.");
    } finally {
      setSubmitting(false);
    }
  };

  const exitChallenge = () => {
    setProctorEnabled(false);
    navigate("/battle-room", { replace: true });
  };

  const activeRoomId = room?._id;
  const handleIntegrityEvent = useCallback(
    async (event) => {
      if (!activeRoomId) return;
      try {
        await api.post("/assessment-integrity/events", {
          ...event,
          assessmentType: "BATTLE_ROOM",
          assessmentId: activeRoomId,
        });
      } catch (error) {
        setError(error.message || "Integrity evidence could not be recorded.");
        throw error;
      }
    },
    [activeRoomId],
  );

  const handleQuestionSelect = (index) => {
    if (submitted) return;
    // LeetCode-style: touching the question toggles expansion.
    setExpandedQuestion((prev) => (prev === index ? -1 : index));
    if (expandedQuestion === index) {
      return;
    }
    setCurrentQuestionIndex(index);
    const q = room.questions[index];
    if (!q) return;
    activeQuestionIdRef.current = q._id;
    const saved = questionResults.find(
      (result) => String(result.questionId) === String(q._id),
    );
    const restoredCode =
      saved?.code ||
      codeByQuestionRef.current[q._id] ||
      getQuestionStarter(q);
    codeByQuestionRef.current[q._id] = restoredCode;
    setCode(restoredCode);
    const cachedResult = resultByQuestionRef.current[q._id];
    if (saved?.verificationStatus === "VERIFIED") {
      setCurrentResult(toOfficialConsoleResult(saved));
      setCurrentResultAuthority("OFFICIAL");
    } else {
      setCurrentResult(
        cachedResult?.code === restoredCode ? cachedResult.result : null,
      );
      setCurrentResultAuthority("LOCAL");
    }
    saveRoomEditorCache(
      roomCode,
      codeByQuestionRef.current,
      resultByQuestionRef.current,
    );
  };

  const handleCodeChange = (nextCode) => {
    setCode(nextCode);
    const question = room?.questions?.[currentQuestionIndex];
    if (!question) return;

    codeByQuestionRef.current[question._id] = nextCode;
    const cachedResult = resultByQuestionRef.current[question._id];
    setCurrentResult(
      cachedResult?.code === nextCode ? cachedResult.result : null,
    );
    setCurrentResultAuthority("LOCAL");
    saveRoomEditorCache(
      roomCode,
      codeByQuestionRef.current,
      resultByQuestionRef.current,
    );
  };

  const handleSubmit = async () => {
    if (submitInFlightRef.current || submitting || running || submitted) return;

    const question = room.questions[currentQuestionIndex];
    if (!question) return;

    submitInFlightRef.current = true;
    const performanceTraceId = beginExecutionTrace("submit");
    setSubmitting(true);
    setError("");

    try {
      const result = await submitQuestionSolution({
        roomCode,
        questionId: question._id,
        code,
        language: selectedLanguage,
        question,
      });

      if (!result?.questionResult) {
        throw new Error("The server did not acknowledge this submission. Please retry.");
      }
      const qr = result.questionResult;
      codeByQuestionRef.current[question._id] = code;
      saveRoomEditorCache(
        roomCode,
        codeByQuestionRef.current,
        resultByQuestionRef.current,
      );
      if (qr.verificationStatus === "VERIFIED") {
        const officialResult = toOfficialConsoleResult(qr);
        resultByQuestionRef.current[question._id] = {
          code,
          result: officialResult,
        };
        if (activeQuestionIdRef.current === question._id) {
          setCurrentResult(officialResult);
          setCurrentResultAuthority("OFFICIAL");
        }
      }

      const updated = [...questionResults];
      updated[currentQuestionIndex] = {
        questionId: question._id,
        status: qr.status || "PROCESSING",
        verificationStatus:
          qr.verificationStatus || "PENDING_VERIFICATION",
        verificationError: qr.verificationError || "",
        score: qr.verificationStatus === "VERIFIED" ? qr.score : null,
        passed: qr.verificationStatus === "VERIFIED" ? qr.passed : null,
        failed: qr.verificationStatus === "VERIFIED" ? qr.failed : null,
      };
      setQuestionResults(updated);

      if (result.allCompleted) {
        setSubmitted(true);
      }
    } catch (err) {
      codeByQuestionRef.current[question._id] = code;
      saveRoomEditorCache(
        roomCode,
        codeByQuestionRef.current,
        resultByQuestionRef.current,
      );
      setError(err.message || "Failed to submit solution.");
      await fetchRoom();
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
      finishExecutionTrace(performanceTraceId);
    }
  };

  const handleEndTest = async () => {
    if (submitted) return;
    if (
      !window.confirm(
        "End the test now? Submitted solutions will continue server verification, and only verified results can be finalized.",
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await endRoomTest(roomCode);
      if (["COMPLETED", "DISQUALIFIED"].includes(result.status)) {
        setSubmitted(true);
      } else {
        setError(
          "Test ended. Your submitted solutions are still being verified.",
        );
      }
      await fetchRoom();
    } catch (err) {
      setError(err.message || "Failed to end the test.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRun = async () => {
    if (running || submitting || submitInFlightRef.current || submitted) return;

    const questionIndex = currentQuestionIndex;
    const question = room.questions[questionIndex];
    if (!question) return;

    const codeSnapshot = code;
    const performanceTraceId = beginExecutionTrace("run");
    setRunning(true);
    setError("");

    try {
      const result = await runQuestionSolution({
        roomCode,
        questionId: question._id,
        code: codeSnapshot,
        language: selectedLanguage,
        question,
      });

      const runResult = {
        status: result.status || "RUN_COMPLETED",
        accepted: result.passed === result.total && result.total > 0,
        passed: result.passed || 0,
        failed: result.failed || 0,
        total: result.total || 0,
        output: result.output ?? "",
        error: result.error ?? "",
        executionTime: result.executionTime ?? 0,
        memoryUsed: result.memoryUsed ?? 0,
        visiblePassed:
          result.visiblePassed ??
          (result.results || []).filter(
            (r) => !r.isHidden && ["PASSED", "ACCEPTED"].includes(r.status),
          ).length,
        visibleFailed:
          result.visibleFailed ??
          (result.results || []).filter(
            (r) => !r.isHidden && !["PASSED", "ACCEPTED"].includes(r.status),
          ).length,
        hiddenCount: (result.results || []).filter((r) => r.isHidden).length,
        hiddenPassed: (result.results || []).filter(
          (r) => r.isHidden && ["PASSED", "ACCEPTED"].includes(r.status),
        ).length,
        hiddenFailed: (result.results || []).filter(
          (r) => r.isHidden && !["PASSED", "ACCEPTED"].includes(r.status),
        ).length,
        results: (result.results || []).map((r) => ({
          testCaseId: r.testCaseId,
          testCase: r.testCase,
          status: r.status,
          input: r.input ?? "",
          executionTime: r.executionTime ?? 0,
          memoryUsed: r.memoryUsed ?? 0,
          output: r.output ?? r.actualOutput ?? r.stdout ?? "",
          expectedOutput: r.expectedOutput ?? "",
          error: r.error ?? "",
          isHidden: !!r.isHidden,
        })),
      };

      resultByQuestionRef.current[question._id] = {
        code: codeSnapshot,
        result: runResult,
      };
      saveRoomEditorCache(
        roomCode,
        codeByQuestionRef.current,
        resultByQuestionRef.current,
      );
      if (
        activeQuestionIdRef.current === question._id &&
        codeByQuestionRef.current[question._id] === codeSnapshot
      ) {
        setCurrentResult(runResult);
        setCurrentResultAuthority(isDesktop ? "LOCAL" : "VISIBLE");
      }
      setConsoleHeight((prev) => prev);
    } catch (err) {
      const failedResult = {
        status: "SYSTEM_ERROR",
        accepted: false,
        passed: 0,
        failed: 0,
        total: 0,
        output: "",
        error: err.message || "Failed to run code.",
        executionTime: 0,
        memoryUsed: 0,
        results: [],
      };
      resultByQuestionRef.current[question._id] = {
        code: codeSnapshot,
        result: failedResult,
      };
      saveRoomEditorCache(
        roomCode,
        codeByQuestionRef.current,
        resultByQuestionRef.current,
      );
      if (
        activeQuestionIdRef.current === question._id &&
        codeByQuestionRef.current[question._id] === codeSnapshot
      ) {
        setCurrentResult(failedResult);
        setCurrentResultAuthority(isDesktop ? "LOCAL" : "VISIBLE");
      }
    } finally {
      setRunning(false);
      finishExecutionTrace(performanceTraceId);
    }
  };

  // Splitter drag handlers
  const handleLeftDrag = useCallback((e) => {
    if (!draggingLeftRef.current || !mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    const minW = 280;
    const maxW = Math.max(minW, rect.width * 0.6);
    setLeftWidth(Math.min(maxW, Math.max(minW, newWidth)));
  }, []);

  const handleConsoleDrag = useCallback((e) => {
    if (!draggingConsoleRef.current) return;
    const windowH = window.innerHeight;
    const newH = windowH - e.clientY;
    setConsoleHeight(Math.min(windowH * 0.7, Math.max(120, newH)));
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      handleLeftDrag(e);
      handleConsoleDrag(e);
    };
    const onUp = () => {
      draggingLeftRef.current = false;
      draggingConsoleRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [handleLeftDrag, handleConsoleDrag]);

  const startLeftDrag = () => {
    draggingLeftRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleShowRoomKey = async () => {
    try {
      const data = await shareKey(roomCode);
      setRoomKey(data.roomKey || roomCode);
      setShowKeyModal(true);
    } catch (err) {
      setError(err.message || "Failed to get room key.");
    }
  };

  const hasScheduledWindow = Boolean(
    room?.scheduledDate && room?.scheduledStartTime && room?.scheduledEndTime,
  );
  const formatScheduledWindowTime = (value) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: room?.timezone || "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading battle room"
        aria-busy="true"
        style={{
          height: "100vh",
          padding: 20,
          background: "var(--bg-main)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ maxWidth: 1600, height: "100%", margin: "0 auto" }}>
          <div
            style={{
              height: 48,
              marginBottom: 16,
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-color)",
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(260px, 38%) 1fr",
              gap: 16,
              height: "calc(100% - 64px)",
            }}
          >
            <div
              style={{
                borderRadius: 10,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-color)",
              }}
            />
            <div
              style={{
                display: "grid",
                gridTemplateRows: "1fr 220px",
                gap: 16,
              }}
            >
              <div
                style={{
                  borderRadius: 10,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-color)",
                }}
              />
              <div
                style={{
                  borderRadius: 10,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-color)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-main)",
          fontFamily: "var(--font-ui)",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <p role="alert" style={{ color: "var(--color-danger)", fontSize: 14 }}>{error}</p>
        <button onClick={fetchRoom} className="btn-secondary">
          Retry
        </button>
      </div>
    );
  }

  if (room && isMobile) {
    return (
      <main className="challenge-device-notice" role="status">
        <Monitor size={40} />
        <h1>Attend only using a desktop or PC</h1>
        <p>
          This test is designed for a desktop or PC. Opening this page on a
          mobile device will not disqualify you. Switch to a desktop or PC to
          attend or continue the test.
        </p>
        <button
          className="btn-primary"
          type="button"
          onClick={() => navigate("/battle-room", { replace: true })}
        >
          Back to Battle Room
        </button>
      </main>
    );
  }

  if (showStartPrompt && room) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-main)",
        }}
      >
        <div
          style={{
            position: "relative",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: 32,
            maxWidth: 500,
            textAlign: "center",
          }}
        >
          <button
            type="button"
            aria-label="Leave challenge setup"
            onClick={exitChallenge}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              display: "grid",
              placeItems: "center",
              width: 34,
              height: 34,
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              color: "var(--text-muted)",
              background: "var(--bg-card)",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
          <Swords
            size={40}
            color="var(--accent-blue-bright)"
            style={{ marginBottom: 16 }}
          />
          <h2
            style={{
              color: "var(--text-primary)",
              fontSize: 18,
              margin: "0 0 8px",
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
            }}
          >
            {room.title}
          </h2>
          {room.description && (
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                marginBottom: 16,
                fontFamily: "var(--font-ui)",
              }}
            >
              {room.description}
            </p>
          )}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "var(--font-ui)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ListOrdered size={12} /> {room.questions?.length || 0} Questions
            </span>
            <span
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "var(--font-ui)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Timer size={12} />
              {hasScheduledWindow
                ? `${formatScheduledWindowTime(room.startTime)} – ${formatScheduledWindowTime(room.endTime)}`
                : `${room.timeLimit} ${room.timeLimitUnit || "minutes"}`}
            </span>
            <span
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "var(--font-ui)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Code2 size={12} /> Java
            </span>
          </div>
          <p
            style={{
              color: "var(--color-warning)",
              fontSize: 13,
              marginBottom: 24,
              fontFamily: "var(--font-ui)",
            }}
          >
            Room Key:{" "}
            <strong
              style={{ letterSpacing: 3, fontFamily: "var(--font-code)" }}
            >
              {room.roomCode}
            </strong>
          </p>
          {isCreator ? (
            <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                As the creator, start the room when you’re ready.
              </div>
              <button
                onClick={handleStartRoom}
                className="btn-primary"
                style={{ padding: "12px 32px" }}
              >
                <Play size={16} /> Start Battle Now
              </button>
            </div>
          ) : (
            <div>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: 13,
                  fontFamily: "var(--font-ui)",
                  marginBottom: 8,
                }}
              >
                Waiting for the room creator to start the battle...
              </p>
              <button onClick={fetchRoom} className="btn-secondary">
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          )}
          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {isCreator && (
              <button onClick={handleShowRoomKey} className="btn-secondary">
                <KeyRound size={14} /> Share Key
              </button>
            )}
            <button
              onClick={() => navigate(`/battle-room/${roomCode}/leaderboard`)}
              className="btn-secondary"
            >
              <Trophy size={14} /> Leaderboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!room) return null;

  // Participant blocked by the schedule (before start or after end).
  const isBlockedBySchedule =
    !isCreator &&
    (windowState === "NOT_STARTED" ||
      windowState === "ENDED" ||
      windowState === "CLOSED" ||
      (!questionsVisible && room.status === "UPCOMING"));

  if (isBlockedBySchedule) {
    const scheduledStart = room.startTime ? new Date(room.startTime) : null;
    const scheduledEnd = room.endTime ? new Date(room.endTime) : null;
    const hasEnded =
      windowState === "ENDED" ||
      windowState === "CLOSED" ||
      room.status === "CLOSED";
    const formatScheduledTime = (d) =>
      d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    const blockTitle = hasEnded ? "Challenge ended" : "Challenge not started";
    const blockMessage = hasEnded
      ? "This challenge has ended. Coding, execution and submissions are closed."
      : "Challenge has not started yet.";

    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-main)",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 440, padding: "0 20px" }}>
          <Clock
            size={40}
            color={hasEnded ? "var(--color-danger)" : "var(--color-warning)"}
            style={{ marginBottom: 16 }}
          />
          <h2
            style={{
              color: "var(--text-primary)",
              fontSize: 18,
              fontFamily: "var(--font-ui)",
              marginBottom: 8,
            }}
          >
            {blockTitle}
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              fontFamily: "var(--font-ui)",
              marginBottom: 12,
            }}
          >
            {room.title} — {blockMessage}
          </p>
          {userSubmissionState?.status === "PROCESSING" && (
            <p role="status" aria-live="polite">
              Submission received. CodeClash is still verifying your submitted
              solution. Refresh to check the official result.
            </p>
          )}
          {userSubmissionState?.status === "COMPLETED" && (
            <p role="status">
              Official result: {userSubmissionState.totalScore} points.
            </p>
          )}
          {scheduledStart ? (
            <div style={{ marginBottom: 16 }}>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: 13,
                  fontFamily: "var(--font-ui)",
                  marginBottom: 6,
                }}
              >
                Scheduled start:
              </p>
              <p
                style={{
                  color: "var(--color-warning)",
                  fontSize: 15,
                  fontFamily: "var(--font-code)",
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                {formatScheduledTime(scheduledStart)}
              </p>
              {scheduledEnd && (
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 12,
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  Ends at {formatScheduledTime(scheduledEnd)}
                </p>
              )}
            </div>
          ) : (
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                fontFamily: "var(--font-ui)",
                marginBottom: 16,
              }}
            >
              {hasEnded
                ? "This challenge has ended. Your final submission, if any, has been preserved."
                : "This battle hasn't started yet. Once the window opens, the questions and editor will unlock here automatically."}
            </p>
          )}
          {!hasEnded && (
            <p
              style={{
                color: "var(--accent-blue-bright)",
                fontSize: 12,
                fontFamily: "var(--font-ui)",
                marginBottom: 16,
              }}
            >
              This page refreshes automatically. You do not need to reload.
            </p>
          )}
          <button onClick={fetchRoom} className="btn-secondary">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>
    );
  }

  const question = room.questions?.[currentQuestionIndex];
  const currentQResult = questionResults[currentQuestionIndex];
  const isQuestionSubmitted = Boolean(
    currentQResult?.verificationStatus === "PENDING_VERIFICATION" ||
      currentQResult?.verificationStatus === "VERIFYING" ||
      currentQResult?.verificationStatus === "VERIFIED" ||
      (!currentQResult?.verificationStatus &&
        currentQResult?.status &&
        !["PENDING", "PROCESSING", "ERROR"].includes(currentQResult.status)),
  );
  const isQuestionVerified =
    currentQResult?.verificationStatus === "VERIFIED" ||
    (!currentQResult?.verificationStatus &&
      currentQResult?.status &&
      !["PENDING", "PROCESSING", "ERROR"].includes(currentQResult.status));
  const isVerificationPending = [
    "PENDING_VERIFICATION",
    "VERIFYING",
  ].includes(currentQResult?.verificationStatus);
  const verificationFailed = currentQResult?.verificationStatus === "ERROR";
  const currentLangDef = LANGUAGE_BY_ID.java;
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-main)",
        fontFamily: "var(--font-ui)",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          background: "var(--bg-elevated)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              color: "var(--color-warning)",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: 2,
              fontFamily: "var(--font-code)",
            }}
          >
            {room.roomCode}
          </span>
          <span style={{ color: "var(--text-faint)" }}>|</span>
          <span style={{ color: "var(--text-primary)", fontSize: 13 }}>
            {room.title}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {room.endTime && !submitted && (
            <RoomTimer endTime={room.endTime} onTimeUp={handleTimeUp} />
          )}
          {submitted && (
            <span
              style={{
                color: disqualified
                  ? "var(--color-danger)"
                  : "var(--color-success)",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <CheckCircle2 size={14} />
              {disqualified ? "Disqualified" : "Completed"}
            </span>
          )}
          {/* During an active challenge: hide Share Key & Leaderboard, show End Test. */}
          {!submitted && (
            <button
              onClick={handleEndTest}
              disabled={submitting}
              className="btn-secondary"
              style={{
                padding: "6px 16px",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "var(--color-danger)",
                borderColor: "var(--color-danger)",
                opacity: submitting ? 0.5 : 1,
              }}
            >
              {submitting ? (
                <Loader2
                  size={12}
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <Play size={12} />
              )}
              {submitting ? "Ending..." : "End Test"}
            </button>
          )}
        </div>
      </div>

      {submitted ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 500 }}>
            {disqualified ? (
              <>
                <AlertTriangle
                  size={48}
                  color="var(--color-danger)"
                  style={{ marginBottom: 16 }}
                />
                <h2
                  style={{
                    color: "var(--color-danger)",
                    fontSize: 20,
                    fontFamily: "var(--font-ui)",
                    marginBottom: 8,
                    fontWeight: 600,
                  }}
                >
                  Disqualified
                </h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 13,
                    fontFamily: "var(--font-ui)",
                    marginBottom: 24,
                  }}
                >
                  A proctoring violation was detected. Your submission was
                  auto-submitted with a score of 0. You cannot attempt this
                  battle again.
                </p>
              </>
            ) : (
              <>
                <Swords
                  size={48}
                  color="var(--accent-blue-bright)"
                  style={{ marginBottom: 16 }}
                />
                <h2
                  style={{
                    color: "var(--text-primary)",
                    fontSize: 20,
                    fontFamily: "var(--font-ui)",
                    marginBottom: 8,
                    fontWeight: 600,
                  }}
                >
                  Battle Complete!
                </h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 13,
                    fontFamily: "var(--font-ui)",
                    marginBottom: 24,
                  }}
                >
                  You've completed all the questions. Check the leaderboard for
                  your ranking.
                </p>
              </>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={() => navigate(`/battle-room/${roomCode}/leaderboard`)}
                className="btn-primary"
                style={{ padding: "10px 24px" }}
              >
                <Trophy size={14} /> View Leaderboard
              </button>
              <button
                onClick={() => navigate("/battle-room")}
                className="btn-secondary"
                style={{ padding: "10px 24px" }}
              >
                Back to Rooms
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={mainRef}
          style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* LEFT PANEL */}
          <div
            style={{
              width: leftWidth,
              minWidth: 280,
              borderRight: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-card)",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  fontFamily: "var(--font-ui)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <ListOrdered size={12} /> Questions (
                {room.questions?.length || 0})
              </span>
            </div>
            <div
              style={{
                borderBottom: "1px solid var(--border-color)",
                maxHeight: 140,
                overflow: "auto",
              }}
            >
              {room.questions?.map((q, index) => {
                const qr = questionResults[index];
                const isActive = index === currentQuestionIndex;
                const isDone =
                  qr?.verificationStatus === "VERIFIED" ||
                  qr?.status === "REJECTED" ||
                  (!qr?.verificationStatus &&
                    qr?.status &&
                    !["PENDING", "PROCESSING", "ERROR"].includes(qr.status));
                return (
                  <div
                    key={q._id}
                    onClick={() => handleQuestionSelect(index)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--border-color)",
                      background: isActive
                        ? "var(--accent-blue-soft)"
                        : "transparent",
                      cursor: submitted ? "not-allowed" : "pointer",
                      transition: "background 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: "var(--font-ui)",
                        background: isDone
                          ? "var(--color-success-bg)"
                          : isActive
                            ? "var(--accent-blue)"
                            : "var(--bg-elevated)",
                        border: `1px solid ${isDone ? "var(--color-success)" : isActive ? "var(--accent-blue)" : "var(--border-strong)"}`,
                        color: isDone
                          ? "var(--color-success)"
                          : isActive
                            ? "#fff"
                            : "var(--text-muted)",
                      }}
                    >
                      {isDone ? <CheckCircle2 size={11} /> : index + 1}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div
                        style={{
                          color: "var(--text-primary)",
                          fontSize: 12,
                          fontFamily: "var(--font-ui)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {q.title || `Question ${index + 1}`}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                        <span
                          style={{
                            color:
                              DIFFICULTY_COLORS[q.difficulty] ||
                              "var(--text-muted)",
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          {q.difficulty}
                        </span>
                        {qr?.score > 0 && (
                          <span
                            style={{
                              color: "var(--accent-blue-bright)",
                              fontSize: 10,
                            }}
                          >
                            {Math.round(qr.score)}pts
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected question details - only shown when the question is expanded */}
            {expandedQuestion === currentQuestionIndex && (
              <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h3
                    style={{
                      color: "var(--text-primary)",
                      fontSize: 14,
                      margin: 0,
                      fontFamily: "var(--font-ui)",
                      fontWeight: 600,
                    }}
                  >
                    {question?.title || `Question ${currentQuestionIndex + 1}`}
                  </h3>
                  {question?.difficulty && (
                    <span
                      className={`difficulty-badge ${(question.difficulty || "").toLowerCase()}`}
                    >
                      {question.difficulty}
                    </span>
                  )}
                  {question?.points && (
                    <span
                      style={{
                        color: "var(--color-warning)",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {question.points} pts
                    </span>
                  )}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 10,
                      fontFamily: "var(--font-ui)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: 4,
                    }}
                  >
                    Description
                  </div>
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: 13,
                      lineHeight: 1.6,
                      fontFamily: "var(--font-ui)",
                      whiteSpace: "pre-wrap",
                      margin: 0,
                    }}
                  >
                    {question?.description}
                  </p>
                </div>

                {question?.examples && question.examples.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 10,
                        fontFamily: "var(--font-ui)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: 6,
                      }}
                    >
                      Examples ({question.examples.length})
                    </div>
                    {question.examples.map((ex, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-color)",
                          borderRadius: 6,
                          padding: "8px 12px",
                          marginBottom: 6,
                          fontFamily: "var(--font-code)",
                          fontSize: 12,
                        }}
                      >
                        <div
                          style={{
                            color: "var(--text-primary)",
                            fontWeight: 600,
                            marginBottom: 4,
                            fontFamily: "var(--font-ui)",
                          }}
                        >
                          Example {idx + 1}
                        </div>
                        <div style={{ color: "var(--text-muted)" }}>
                          Input:{" "}
                          <span style={{ color: "var(--syntax-string)" }}>
                            {ex.input}
                          </span>
                        </div>
                        <div style={{ color: "var(--text-muted)" }}>
                          Output:{" "}
                          <span style={{ color: "var(--syntax-keyword)" }}>
                            {ex.output}
                          </span>
                        </div>
                        {ex.explanation && (
                          <div
                            style={{
                              color: "var(--text-muted)",
                              marginTop: 4,
                              fontFamily: "var(--font-ui)",
                            }}
                          >
                            Explanation: {ex.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {question?.explanation && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: "8px 12px",
                      background: "var(--bg-elevated)",
                      borderLeft: "2px solid var(--accent-blue)",
                      borderRadius: 4,
                    }}
                  >
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 11,
                        fontFamily: "var(--font-ui)",
                        fontWeight: 600,
                      }}
                    >
                      Explanation:{" "}
                    </span>
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 12,
                        fontFamily: "var(--font-ui)",
                      }}
                    >
                      {question.explanation}
                    </span>
                  </div>
                )}

                {question?.constraints && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 10,
                        fontFamily: "var(--font-ui)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: 4,
                      }}
                    >
                      Constraints
                    </div>
                    <pre
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-color)",
                        borderRadius: 6,
                        padding: "8px 12px",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                        fontFamily: "var(--font-code)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        margin: 0,
                      }}
                    >
                      {question.constraints}
                    </pre>
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Divider for left panel */}
          <div
            onMouseDown={startLeftDrag}
            style={{
              width: 5,
              cursor: "col-resize",
              background: "var(--border-color)",
              flexShrink: 0,
              zIndex: 5,
            }}
          />

          {/* RIGHT SIDE */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              position: "relative",
            }}
          >
            {/* Editor header */}
            <div
              style={{
                padding: "6px 16px",
                background: "var(--bg-elevated)",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  fontFamily: "var(--font-code)",
                }}
              >
                {currentLangDef.label} {currentLangDef.extension} • Question{" "}
                {currentQuestionIndex + 1}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isQuestionVerified && (
                  <span
                    style={{
                      color: "var(--color-success)",
                      fontSize: 11,
                      fontFamily: "var(--font-ui)",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <CheckCircle2 size={12} /> Submitted (
                    {Math.round(currentQResult?.score || 0)}pts)
                  </span>
                )}
                <button
                  onClick={handleRun}
                  disabled={running || isQuestionSubmitted || submitted}
                  className="btn-secondary"
                  style={{
                    padding: "6px 16px",
                    fontSize: 12,
                    opacity:
                      running || isQuestionSubmitted || submitted ? 0.5 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {running ? (
                    <Loader2
                      size={12}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  ) : (
                    <Play size={12} />
                  )}
                  {running
                    ? "Running..."
                    : "Run"}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || isQuestionSubmitted || submitted}
                  className="btn-primary"
                  style={{
                    padding: "6px 20px",
                    fontSize: 12,
                    opacity:
                      submitting || isQuestionSubmitted || submitted ? 0.5 : 1,
                  }}
                >
                  {submitted
                    ? "Completed"
                    : isVerificationPending
                      ? "Verifying..."
                      : isQuestionVerified
                        ? "Done"
                        : verificationFailed
                          ? "Retry verification"
                          : submitting
                            ? "Submitting..."
                            : "Submit"}
                </button>
              </div>
            </div>

            <div
              role="status"
              aria-live="polite"
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid var(--border-color)",
                color: verificationFailed
                  ? "var(--color-danger)"
                  : "var(--text-muted)",
                fontSize: 12,
              }}
            >
              {isVerificationPending ? (
                <>
                  <strong>Submission received.</strong>{" "}
                  Your solution is being verified by CodeClash.
                </>
              ) : currentQResult?.verificationStatus === "VERIFIED" ? (
                <>
                  <strong>Official result:</strong> {currentQResult.score} points
                  {" · "}{currentQResult.passed}/{currentQResult.total} tests passed
                  {" · "}server verified
                </>
              ) : verificationFailed ? (
                <>
                  <strong>Verification failed.</strong>{" "}
                  CodeClash could not complete server verification. Retry this
                  submission to try again.
                </>
              ) : (
                <>
                  Official result: Not submitted. Run feedback is{" "}
                  {isDesktop ? "local" : "visible-case"} and is not authoritative.
                </>
              )}
            </div>

            {/* Editor */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: "8px 16px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <CodeEditorSandbox
                value={code}
                onChange={handleCodeChange}
                readOnly={isQuestionSubmitted || submitted}
                language={selectedLanguage}
                height="100%"
              />
            </div>

            {/* Console - fixed at bottom, expandable via toggle + drag resize */}
            <div
              style={{
                height: consoleOpen ? Math.max(160, consoleHeight) : 40,
                flexShrink: 0,
                borderTop: "1px solid var(--border-color)",
                background: "var(--bg-card)",
              }}
            >
              <Console
                result={currentResult}
                resultAuthority={currentResultAuthority}
                isOpen={consoleOpen}
                onToggle={() => setConsoleOpen(!consoleOpen)}
                height={consoleOpen ? Math.max(160, consoleHeight) : 40}
                onHeightChange={setConsoleHeight}
              />
            </div>
          </div>
        </div>
      )}

      <ProctorGuard
        challengeId={room._id}
        assessmentId={room._id}
        assessmentType="BATTLE_ROOM"
        onIntegrityEvent={handleIntegrityEvent}
        enabled={proctorEnabled && !submitted}
        onExit={exitChallenge}
      />
      <RoomKeyModal
        isOpen={showKeyModal}
        onClose={() => navigate(`/battle-room/${roomKey}`)}
        roomCode={roomKey || room.roomCode}
        room={room}
      />
    </div>
  );
}
