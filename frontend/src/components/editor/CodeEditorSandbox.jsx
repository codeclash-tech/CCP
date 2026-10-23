import { useRef, useEffect, useState } from "react";
import { getEditorPreferences } from "../../utils/editorPreferences";

export default function CodeEditorSandbox({
  value = "",
  onChange,
  readOnly = false,
  language = "java",
  height = "100%",
}) {
  const [isMonacoLoaded, setIsMonacoLoaded] = useState(false);
  const [editorLoadFailed, setEditorLoadFailed] = useState(false);
  const [editorInstance, setEditorInstance] = useState(null);
  const containerRef = useRef(null);
  const monacoRef = useRef(null);
  const editorInstanceRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const editorOptionsRef = useRef({ value, language, readOnly });
  const preferencesRef = useRef(getEditorPreferences());
  onChangeRef.current = onChange;
  editorOptionsRef.current = { value, language, readOnly };

  useEffect(() => {
    if (typeof window !== "undefined" && !window.monaco) {
      const script = document.createElement("script");
      script.src = `${import.meta.env.BASE_URL}monaco/vs/loader.js`;
      script.async = true;
      script.onload = () => {
        if (typeof window.require !== "function") {
          setEditorLoadFailed(true);
          return;
        }
        window.require.config({
          paths: {
            vs: `${import.meta.env.BASE_URL}monaco/vs`,
          },
        });
        window.require(
          ["vs/editor/editor.main"],
          (monaco) => {
            monacoRef.current = monaco;
            monaco.editor.defineTheme("oneDarkProTheme", {
              base: "vs-dark",
              inherit: true,
              rules: [
              { token: "comment", foreground: "7f848e", fontStyle: "italic" },
              { token: "comment.js", foreground: "7f848e" },
              { token: "keyword", foreground: "61afef" },
              { token: "keyword.js", foreground: "61afef" },
              { token: "string", foreground: "e5c07b" },
              { token: "string.js", foreground: "e5c07b" },
              { token: "number", foreground: "d19a66" },
              { token: "number.js", foreground: "d19a66" },
              { token: "function", foreground: "d19a66" },
              { token: "function.js", foreground: "d19a66" },
              { token: "identifier", foreground: "e06c75" },
              { token: "type", foreground: "56b6c2" },
              { token: "variable", foreground: "e06c75" },
              { token: "constant", foreground: "d19a66" },
              { token: "operator", foreground: "56b6c2" },
              { token: "delimiter", foreground: "abb2bf" },
              { token: "tag", foreground: "e06c75" },
              { token: "attribute.name", foreground: "d19a66" },
              { token: "attribute.value", foreground: "e5c07b" },
              { token: "regexp", foreground: "e5c07b" },
              { token: "meta.paragraph", foreground: "abb2bf" },
              { token: "support.function", foreground: "56b6c2" },
              { token: "support.type", foreground: "56b6c2" },
              { token: "storage", foreground: "61afef" },
              { token: "type.identifier", foreground: "56b6c2" },
              ],
              colors: {
              "editor.background": "#1a1a1a",
              "editor.foreground": "#abb2bf",
              "editor.lineHighlightBackground": "#242424",
              "editor.selectionBackground": "#3d5a80",
              "editor.inactiveSelectionBackground": "#2c3e50",
              "editorCursor.foreground": "#0d7aeb",
              "editorCursor.background": "#ffffff",
              "editorLineNumber.foreground": "#565d66",
              "editorLineNumber.activeForeground": "#abb2bf",
              "editor.selectionHighlightBackground": "#2c3e5080",
              "editorIndentGuide.background": "#2a2a2a",
              "editorIndentGuide.activeBackground": "#3a3a3a",
              "editorWidget.background": "#1e1e1e",
              "editorWidget.border": "#2a2a2a",
              "editorSuggestWidget.background": "#1e1e1e",
              "editorSuggestWidget.border": "#2a2a2a",
              "editorSuggestWidget.selectedBackground": "#0a66c2",
              "editorBracketMatch.background": "#0a66c240",
              "editorBracketMatch.border": "#0d7aeb",
              "scrollbarSlider.background": "#3a3a3a80",
              "scrollbarSlider.hoverBackground": "#4a4a4a80",
              "scrollbarSlider.activeBackground": "#0a66c280",
              },
            });
            monaco.editor.setTheme("oneDarkProTheme");
            setIsMonacoLoaded(true);
          },
          () => setEditorLoadFailed(true),
        );
      };
      script.onerror = () => setEditorLoadFailed(true);
      document.body.appendChild(script);

      return () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };
    } else if (window.monaco) {
      monacoRef.current = window.monaco;
      setIsMonacoLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (
      !isMonacoLoaded ||
      !containerRef.current ||
      editorInstanceRef.current
    ) {
      return;
    }

    const monaco = monacoRef.current;

    const editor = monaco.editor.create(containerRef.current, {
      value: editorOptionsRef.current.value || "",
      language: editorOptionsRef.current.language,
      theme: "oneDarkProTheme",
      readOnly: editorOptionsRef.current.readOnly,
      minimap: { enabled: false },
      fontSize: preferencesRef.current.fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      lineNumbers: "on",
      renderLineHighlight: "line",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: preferencesRef.current.tabSize,
      wordWrap: preferencesRef.current.wordWrap ? "on" : "off",
      padding: { top: 12, bottom: 12 },
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true,
      contextmenu: true, // Allow context menu inside editor
      quickSuggestions: false,
      suggestOnTriggerCharacters: true,
      folding: true,
      foldingHighlight: true,
      guides: { indentation: true, bracketPairs: true },
      bracketPairColorization: { enabled: true },
      renderWhitespace: "selection",
      hideCursorInOverviewRuler: true,
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      scrollbar: {
        vertical: "visible",
        horizontal: "visible",
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
    });

    editor.onDidChangeModelContent(() => {
      const currentValue = editor.getValue();
      onChangeRef.current?.(currentValue);
    });

    // Allow copy/paste INSIDE the editor (Monaco handles this natively).
    // The global proctor guard blocks copy/paste outside the editor.
    editorInstanceRef.current = editor;
    setEditorInstance(editor);
  }, [isMonacoLoaded]);

  useEffect(
    () => () => {
      editorInstanceRef.current?.dispose();
      editorInstanceRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const updatePreferences = (event) => {
      const preferences = event.detail || getEditorPreferences();
      preferencesRef.current = preferences;
      editorInstanceRef.current?.updateOptions({
        fontSize: preferences.fontSize,
        tabSize: preferences.tabSize,
        wordWrap: preferences.wordWrap ? "on" : "off",
      });
    };
    window.addEventListener("codeclash-editor-preferences", updatePreferences);
    return () =>
      window.removeEventListener(
        "codeclash-editor-preferences",
        updatePreferences,
      );
  }, []);

  useEffect(() => {
    if (editorInstance && value !== undefined) {
      const currentValue = editorInstance.getValue();
      if (currentValue !== value) {
        editorInstance.setValue(value);
      }
    }
  }, [value, editorInstance]);

  useEffect(() => {
    if (editorInstance) {
      editorInstance.updateOptions({ readOnly });
    }
  }, [readOnly, editorInstance]);

  useEffect(() => {
    if (editorInstance && monacoRef.current) {
      const model = editorInstance.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, language);
      }
    }
  }, [language, editorInstance]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height,
        border: "1px solid var(--border-color)",
        borderRadius: "4px",
        overflow: "hidden",
      }}
      >
        {!isMonacoLoaded && editorLoadFailed && (
          <textarea
            aria-label="Java code editor"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="code-editor-fallback"
            spellCheck={false}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
          />
        )}
      </div>
  );
}
