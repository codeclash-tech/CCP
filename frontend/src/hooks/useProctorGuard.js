import { useState, useEffect, useCallback, useRef } from "react";

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export default function useProctorGuard({
  assessmentId,
  assessmentType,
  onIntegrityEvent,
  enabled = true,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warning, setWarning] = useState(null);
  const enabledRef = useRef(enabled);
  const wasEnabledRef = useRef(enabled);
  const sessionIdRef = useRef("");
  const sequenceRef = useRef(0);
  const onIntegrityEventRef = useRef(onIntegrityEvent);
  const eventQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    onIntegrityEventRef.current = onIntegrityEvent;
  }, [onIntegrityEvent]);

  useEffect(() => {
    sessionIdRef.current = createSessionId();
    sequenceRef.current = 0;
    eventQueueRef.current = Promise.resolve();
  }, [assessmentId, assessmentType]);

  const recordIntegrityEvent = useCallback((eventType, reason = "") => {
    if (!sessionIdRef.current) sessionIdRef.current = createSessionId();
    const event = {
      assessmentId,
      assessmentType,
      sessionId: sessionIdRef.current,
      sequence: ++sequenceRef.current,
      eventType,
      timestamp: new Date().toISOString(),
      reason,
    };
    setWarning({
      reason,
      message: "Integrity activity is recorded as evidence for review; it does not automatically disqualify you.",
    });
    const record = onIntegrityEventRef.current;
    if (record) {
      const queued = eventQueueRef.current
        .catch(() => undefined)
        .then(() => record(event));
      eventQueueRef.current = queued;
      queued.catch((error) => {
        console.error("Failed to record assessment integrity evidence:", error);
      });
    }
  }, [assessmentId, assessmentType]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (wasEnabledRef.current && !enabled) {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch((error) => {
          console.error("Failed to exit fullscreen after the assessment ended:", error);
        });
      }
      setIsFullscreen(false);
    }
    wasEnabledRef.current = enabled;
  }, [enabled]);

  const requestFullscreen = useCallback(async () => {
    if (!enabledRef.current) return;
    if (document.fullscreenElement) {
      setIsFullscreen(true);
      return;
    }
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      recordIntegrityEvent(
        "FULLSCREEN_EXIT",
        "Failed to enter fullscreen mode",
      );
    }
  }, [recordIntegrityEvent]);

  const exitAssessment = useCallback(() => {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch((error) => {
        console.error("Failed to exit assessment fullscreen:", error);
      });
    }
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    recordIntegrityEvent("ASSESSMENT_START", "Assessment monitoring started");
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs) {
        recordIntegrityEvent("FULLSCREEN_EXIT", "Exited fullscreen mode");
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordIntegrityEvent("TAB_SWITCH", "Tab switch detected");
      }
    };

    const handleWindowBlur = () => {
      recordIntegrityEvent("WINDOW_BLUR", "Window focus lost");
    };

    const handleCopy = (event) => {
      if (event.target?.closest?.(".monaco-editor")) return;
      event.preventDefault();
      recordIntegrityEvent("COPY_ATTEMPT", "Copy action outside editor detected");
    };

    const handlePaste = (event) => {
      if (event.target?.closest?.(".monaco-editor")) return;
      event.preventDefault();
      recordIntegrityEvent("PASTE_ATTEMPT", "Paste action outside editor detected");
    };

    const handleCut = (event) => {
      if (event.target?.closest?.(".monaco-editor")) return;
      event.preventDefault();
    };

    const handleContextMenu = (event) => event.preventDefault();

    const handleSelectStart = (event) => {
      if (event.target?.closest?.(".monaco-editor")) return;
      event.preventDefault();
    };

    const handleKeyDown = (event) => {
      if (
        event.key === "F12" ||
        ((event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          ["I", "J"].includes(event.key.toUpperCase()))
      ) {
        event.preventDefault();
        event.stopPropagation();
        recordIntegrityEvent("DEVTOOLS_OPEN", "Developer tools shortcut detected");
        return;
      }

      const isInEditor = event.target?.closest?.(".monaco-editor");
      if (
        (event.ctrlKey || event.metaKey) &&
        ["c", "v", "x"].includes(event.key.toLowerCase()) &&
        !isInEditor
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.key.toLowerCase() === "c") {
          recordIntegrityEvent("COPY_ATTEMPT", "Copy shortcut outside editor detected");
        } else if (event.key.toLowerCase() === "v") {
          recordIntegrityEvent("PASTE_ATTEMPT", "Paste shortcut outside editor detected");
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
        event.preventDefault();
        event.stopPropagation();
        recordIntegrityEvent("KEYBOARD_SHORTCUT", "View source shortcut detected");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const onDesktopFocusChanged =
      window.codeClashDesktop?.window?.onAssessmentFocusChanged;
    const removeDesktopFocusListener =
      typeof onDesktopFocusChanged === "function"
        ? onDesktopFocusChanged((isFocused) => {
            if (!isFocused) {
              recordIntegrityEvent(
                "WINDOW_BLUR",
                "CodeClash desktop app moved to the background",
              );
            }
          })
        : null;
    if (!removeDesktopFocusListener) {
      window.addEventListener("blur", handleWindowBlur);
    }
    document.addEventListener("copy", handleCopy, true);
    document.addEventListener("paste", handlePaste, true);
    document.addEventListener("cut", handleCut, true);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("selectstart", handleSelectStart, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (removeDesktopFocusListener) {
        removeDesktopFocusListener();
      } else {
        window.removeEventListener("blur", handleWindowBlur);
      }
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("paste", handlePaste, true);
      document.removeEventListener("cut", handleCut, true);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("selectstart", handleSelectStart, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled, recordIntegrityEvent]);

  return {
    isFullscreen:
      isFullscreen ||
      (typeof document !== "undefined" && !!document.fullscreenElement),
    warning,
    isDisqualified: false,
    requestFullscreen,
    exitAssessment,
  };
}
