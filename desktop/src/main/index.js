import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  safeStorage,
} from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LocalEngine } from "./localEngine.js";
import { normalizeExecutionRequest } from "./executionRequest.js";
import { submitDesktopQuestion } from "./desktopSubmission.js";
import { SecureAuthStore } from "./secureAuthStore.js";
import {
  CODECLASH_RENDERER_ORIGIN,
  resolveRendererPath,
} from "./rendererProtocol.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererScheme = "codeclash";
protocol.registerSchemesAsPrivileged([
  {
    scheme: rendererScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const engine = new LocalEngine({
  app,
  resourcesPath: process.resourcesPath,
  isPackaged: app.isPackaged,
});
const authStore = new SecureAuthStore({
  safeStorage,
  userDataPath: app.getPath("userData"),
});

let mainWindow = null;
let shutdownInProgress = false;
let shutdownComplete = false;
const activeAssessmentSubmissions = new Set();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function allowedRendererOrigin() {
  if (!process.env.CODECLASH_RENDERER_URL) return null;
  return new URL(process.env.CODECLASH_RENDERER_URL).origin;
}

function isTrustedRendererUrl(rawUrl) {
  try {
    if (app.isPackaged) {
      const rendererPath = path.resolve(process.resourcesPath, "renderer");
      return resolveRendererPath(rawUrl, rendererPath) !== null;
    }
    const url = new URL(rawUrl);
    return url.origin === allowedRendererOrigin();
  } catch {
    return false;
  }
}

function requireTrustedSender(event) {
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error("This desktop operation is available only to the main application window.");
  }
  const senderUrl = event.senderFrame?.url || "";
  if (!isTrustedRendererUrl(senderUrl)) {
    console.error("Rejected desktop IPC sender URL:", senderUrl);
    throw new Error("This desktop operation is available only to the CodeClash application.");
  }
}

async function createMainWindow() {
  const preloadPath = path.resolve(__dirname, "..", "preload", "index.cjs");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: "#101114",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Failed to load the CodeClash preload (${preloadPath}):`, error);
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on("devtools-opened", () => {
    if (app.isPackaged) mainWindow?.webContents.closeDevTools();
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = input.key.toLowerCase();
    const devToolsShortcut =
      key === "f12" ||
      ((input.control || input.meta) && input.shift && ["i", "j", "c"].includes(key));
    if (app.isPackaged && devToolsShortcut) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const rendererUrl = process.env.CODECLASH_RENDERER_URL;
  if (!app.isPackaged && rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadURL(`${CODECLASH_RENDERER_ORIGIN}/index.html`);
  }
}

async function serveRendererRequest(request) {
  const rendererDirectory = path.resolve(process.resourcesPath, "renderer");
  let rendererPath = resolveRendererPath(request.url, rendererDirectory);
  if (!rendererPath) return new Response("Not found", { status: 404 });

  try {
    const file = await stat(rendererPath);
    if (!file.isFile()) rendererPath = path.join(rendererDirectory, "index.html");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (path.extname(rendererPath)) {
      return new Response("Not found", { status: 404 });
    }
    rendererPath = path.join(rendererDirectory, "index.html");
  }

  return net.fetch(pathToFileURL(rendererPath).href);
}

ipcMain.handle("codeclash:engine-status", async (event) => {
  requireTrustedSender(event);
  return engine.getStatus();
});

ipcMain.handle("codeclash:engine-execute", async (event, request) => {
  requireTrustedSender(event);
  const normalizedRequest = normalizeExecutionRequest(request);
  try {
    return await engine.execute(normalizedRequest);
  } catch (error) {
    console.error("Local execution request failed:", error);
    throw new Error("Code execution is currently unavailable.");
  }
});

ipcMain.handle("codeclash:assessment-submit", async (event, request) => {
  requireTrustedSender(event);
  const submissionKey = `${String(request?.roomCode || "").toUpperCase()}:${String(request?.questionId || "")}`;
  if (activeAssessmentSubmissions.has(submissionKey)) {
    throw new Error("A submission for this question is already in progress.");
  }
  activeAssessmentSubmissions.add(submissionKey);
  try {
    return await submitDesktopQuestion({
      engine,
      isPackaged: app.isPackaged,
      request,
    });
  } finally {
    activeAssessmentSubmissions.delete(submissionKey);
  }
});

ipcMain.handle("codeclash:auth-get-tokens", (event) => {
  requireTrustedSender(event);
  return authStore.readTokens();
});

ipcMain.handle("codeclash:auth-set-tokens", (event, tokens) => {
  requireTrustedSender(event);
  return authStore.writeTokens(tokens);
});

ipcMain.handle("codeclash:auth-clear-tokens", (event) => {
  requireTrustedSender(event);
  return authStore.clearTokens();
});

async function stopApplication() {
  if (shutdownComplete || shutdownInProgress) return;
  shutdownInProgress = true;
  try {
    await engine.stop();
    shutdownComplete = true;
  } finally {
    shutdownInProgress = false;
  }
}

app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownInProgress) return;
  stopApplication()
    .then(() => app.quit())
    .catch(async (error) => {
      await dialog.showMessageBox({
        type: "error",
        title: "CodeClash could not stop cleanly",
        message: error.message,
      });
      shutdownComplete = true;
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow().catch((error) => {
      dialog.showErrorBox("Unable to open CodeClash", error.message);
      app.quit();
    });
  }
});

app.whenReady()
  .then(async () => {
    if (!hasSingleInstanceLock) return;
    try {
      await protocol.handle(rendererScheme, serveRendererRequest);
      await engine.start();
    } catch (error) {
      console.error("Local execution engine startup failed:", error);
      await dialog.showMessageBox({
        type: "warning",
        title: "Code execution unavailable",
        message:
          "Code execution is temporarily unavailable. Restart CodeClash to try again, or contact support if the issue continues.",
        buttons: ["Continue"],
      });
    }
    await createMainWindow();
  })
  .catch((error) => {
    console.error("CodeClash startup failed:", error);
    dialog.showErrorBox("CodeClash could not start", "Please restart CodeClash. If the problem continues, contact support.");
    stopApplication()
      .catch((stopError) => console.error("Failed to stop the local engine:", stopError))
      .finally(() => app.quit());
  });
