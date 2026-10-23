import { spawn, spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(scriptsDirectory, "..");
const repositoryRoot = path.resolve(desktopDirectory, "..");
const frontendDirectory = path.join(repositoryRoot, "frontend");
const engineDirectory = path.join(repositoryRoot, "secure-code-engine");
const jarPath = path.join(
  engineDirectory,
  "target",
  "secure-code-engine-1.0.0.jar",
);
const vitePath = path.join(frontendDirectory, "node_modules", "vite", "bin", "vite.js");
const electronExecutable = path.join(
  desktopDirectory,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);
let vite = null;
let electron = null;

function stopChild(child) {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
}

function buildEngine() {
  const result = spawnSync(
    process.platform === "win32" ? process.env.ComSpec : "mvn",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "mvn package -DskipTests"]
      : ["package", "-DskipTests"],
    { cwd: engineDirectory, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Maven build prerequisite failed with status ${result.status}.`);
  }
}

async function waitForVite() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:5173", {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("Vite did not become ready on port 5173.");
}

async function main() {
  try {
    await access(jarPath);
  } catch {
    buildEngine();
    await access(jarPath);
  }

  vite = spawn(
    process.execPath,
    [vitePath, "--host", "127.0.0.1"],
    {
      cwd: frontendDirectory,
      stdio: "inherit",
      windowsHide: true,
      shell: process.platform === "win32",
    },
  );
  vite.once("exit", (code) => {
    if (electron && electron.exitCode === null) electron.kill();
    process.exitCode = code || 0;
  });
  await waitForVite();
  electron = spawn(electronExecutable, ["."], {
    cwd: desktopDirectory,
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      CODECLASH_RENDERER_URL: "http://127.0.0.1:5173",
    },
  });
  electron.once("exit", () => stopChild(vite));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopChild(electron);
    stopChild(vite);
  });
}

main().catch((error) => {
  console.error(`Desktop development startup failed: ${error.message}`);
  stopChild(electron);
  stopChild(vite);
  process.exitCode = 1;
});
