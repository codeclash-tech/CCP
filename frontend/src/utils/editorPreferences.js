export const EDITOR_PREFERENCES_KEY = "codeclash-editor-preferences";
export const DEFAULT_EDITOR_PREFERENCES = Object.freeze({
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
});

export function getEditorPreferences() {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(EDITOR_PREFERENCES_KEY) || "{}",
    );
    return {
      fontSize:
        Number.isInteger(saved.fontSize) && saved.fontSize >= 12 && saved.fontSize <= 20
          ? saved.fontSize
          : DEFAULT_EDITOR_PREFERENCES.fontSize,
      tabSize: [2, 4].includes(saved.tabSize)
        ? saved.tabSize
        : DEFAULT_EDITOR_PREFERENCES.tabSize,
      wordWrap:
        typeof saved.wordWrap === "boolean"
          ? saved.wordWrap
          : DEFAULT_EDITOR_PREFERENCES.wordWrap,
    };
  } catch {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }
}

export function saveEditorPreferences(preferences) {
  const next = {
    fontSize:
      Number.isInteger(preferences.fontSize) &&
      preferences.fontSize >= 12 &&
      preferences.fontSize <= 20
        ? preferences.fontSize
        : DEFAULT_EDITOR_PREFERENCES.fontSize,
    tabSize: [2, 4].includes(preferences.tabSize)
      ? preferences.tabSize
      : DEFAULT_EDITOR_PREFERENCES.tabSize,
    wordWrap:
      typeof preferences.wordWrap === "boolean"
        ? preferences.wordWrap
        : DEFAULT_EDITOR_PREFERENCES.wordWrap,
  };
  window.localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent("codeclash-editor-preferences", { detail: next }),
  );
  return next;
}
