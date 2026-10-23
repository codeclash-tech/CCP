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
    }),
    auth: Object.freeze({
      getTokens: () => ipcRenderer.invoke("codeclash:auth-get-tokens"),
      setTokens: (tokens) =>
        ipcRenderer.invoke("codeclash:auth-set-tokens", tokens),
      clearTokens: () => ipcRenderer.invoke("codeclash:auth-clear-tokens"),
    }),
  }),
);
