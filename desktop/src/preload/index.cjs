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
    }),
    auth: Object.freeze({
      getTokens: () => ipcRenderer.invoke("codeclash:auth-get-tokens"),
      setTokens: (tokens) =>
        ipcRenderer.invoke("codeclash:auth-set-tokens", tokens),
      clearTokens: () => ipcRenderer.invoke("codeclash:auth-clear-tokens"),
    }),
  }),
);
