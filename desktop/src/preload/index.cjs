const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "codeClashDesktop",
  Object.freeze({
    engine: Object.freeze({
      status: () => ipcRenderer.invoke("codeclash:engine-status"),
      execute: (request) => ipcRenderer.invoke("codeclash:engine-execute", request),
    }),
    assessment: Object.freeze({
      submit: (request) =>
        ipcRenderer.invoke("codeclash:assessment-submit", request),
      submitDaily: (request) =>
        ipcRenderer.invoke("codeclash:daily-submit", request),
    }),
    window: Object.freeze({
      setChallengeMode: (enabled) =>
        ipcRenderer.invoke("codeclash:challenge-mode", enabled),
      control: (action) => ipcRenderer.invoke("codeclash:window-control", action),
      isMaximized: () => ipcRenderer.invoke("codeclash:window-is-maximized"),
      onMaximizeChanged: (listener) => {
        const handler = (_event, isMaximized) => listener(isMaximized);
        ipcRenderer.on("codeclash:window-maximized", handler);
        return () =>
          ipcRenderer.removeListener("codeclash:window-maximized", handler);
      },
      onAssessmentFocusChanged: (listener) => {
        const handler = (_event, isFocused) => listener(isFocused);
        ipcRenderer.on("codeclash:assessment-window-focus", handler);
        return () =>
          ipcRenderer.removeListener("codeclash:assessment-window-focus", handler);
      },
    }),
    auth: Object.freeze({
      getTokens: () => ipcRenderer.invoke("codeclash:auth-get-tokens"),
      setTokens: (tokens) =>
        ipcRenderer.invoke("codeclash:auth-set-tokens", tokens),
      clearTokens: () => ipcRenderer.invoke("codeclash:auth-clear-tokens"),
    }),
  }),
);
