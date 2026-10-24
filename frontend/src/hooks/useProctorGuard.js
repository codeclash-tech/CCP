import { useState, useEffect, useCallback, useRef } from "react";

// Any single violation immediately disqualifies the user (score 0)
export default function useProctorGuard({ onDisqualified, enabled = true }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warning, setWarning] = useState(null);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const enabledRef = useRef(enabled);
  const wasEnabledRef = useRef(enabled);
  const disqualifiedRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
    if (wasEnabledRef.current && !enabled) {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch((error) => {
          console.error("Failed to exit fullscreen after the battle ended:", error);
        });
      }
      setIsFullscreen(false);
    }
    wasEnabledRef.current = enabled;
  }, [enabled]);

  const disqualify = useCallback(
    (reason) => {
      if (disqualifiedRef.current) return;
      disqualifiedRef.current = true;
      setIsDisqualified(true);
      setWarning({
        reason,
        message: `Proctoring violation: ${reason}. Your official challenge score has been set to 0.`,
      });
      if (onDisqualified) {
        onDisqualified(reason);
      }
    },
    [onDisqualified]
  );

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
      disqualify("Failed to enter fullscreen mode");
    }
  }, [disqualify]);

  const exitAssessment = useCallback(() => {
    try {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch {
      // ignore
    }
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs && !disqualifiedRef.current) {
        disqualify("Exited fullscreen mode");
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && !disqualifiedRef.current) {
        disqualify("Tab switch detected");
      }
    };

    const handleWindowBlur = () => {
      if (!disqualifiedRef.current) {
        disqualify("Window focus lost");
      }
    };

    // Block copy/paste OUTSIDE the code editor.
    // The code editor itself handles its own copy/paste via Monaco.
    const handleCopy = (e) => {
      // Allow copy if the target is inside the Monaco editor
      const target = e.target;
      if (target && target.closest && target.closest(".monaco-editor")) {
        return;
      }
      e.preventDefault();
      disqualify("Copy action outside editor detected");
    };

    const handlePaste = (e) => {
      const target = e.target;
      if (target && target.closest && target.closest(".monaco-editor")) {
        return;
      }
      e.preventDefault();
      disqualify("Paste action outside editor detected");
    };

    const handleCut = (e) => {
      const target = e.target;
      if (target && target.closest && target.closest(".monaco-editor")) {
        return;
      }
      e.preventDefault();
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    const handleSelectStart = (e) => {
      const target = e.target;
      if (target && target.closest && target.closest(".monaco-editor")) {
        return;
      }
      e.preventDefault();
    };

    const handleKeyDown = (e) => {
      if (disqualifiedRef.current) return;

      // Block dev tools
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J")) ||
        (e.metaKey && e.shiftKey && (e.key === "I" || e.key === "J"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        disqualify("Developer tools access blocked");
        return;
      }

      // Block copy/paste shortcuts OUTSIDE the editor
      const isInEditor = e.target && e.target.closest && e.target.closest(".monaco-editor");
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "v" || e.key === "x")) {
        if (!isInEditor) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "c" || e.key === "v") {
            disqualify("Copy/paste shortcut outside editor");
          }
        }
      }

      // Block view source
      if ((e.ctrlKey || e.metaKey) && e.key === "u") {
        e.preventDefault();
        e.stopPropagation();
        disqualify("View source blocked");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("copy", handleCopy, true);
    document.addEventListener("paste", handlePaste, true);
    document.addEventListener("cut", handleCut, true);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("selectstart", handleSelectStart, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("paste", handlePaste, true);
      document.removeEventListener("cut", handleCut, true);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("selectstart", handleSelectStart, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled, disqualify]);

  return {
    isFullscreen:
      isFullscreen ||
      (typeof document !== "undefined" && !!document.fullscreenElement),
    warning,
    isDisqualified,
    requestFullscreen,
    exitAssessment,
  };
}
