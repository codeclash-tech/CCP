import { spawnSync } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(scriptsDirectory, "..");
const pythonDirectory = path.join(desktopDirectory, "python");
const workerSource = path.join(pythonDirectory, "speech_worker.py");
const outputDirectory = path.join(desktopDirectory, "speech-dist");
const buildDirectory = path.join(desktopDirectory, ".speech-build");
// Keep packaging reproducible by building with the project-local Python environment.
const defaultPython = path.join(desktopDirectory, ".venv", "Scripts", "python.exe");
const python = process.env.CODECLASH_PYTHON || defaultPython;

try {
  await access(python);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  throw new Error(
    "Set up desktop/.venv with desktop/python/requirements.txt or set CODECLASH_PYTHON to a prepared Python executable.",
  );
}

await rm(outputDirectory, { recursive: true, force: true });
await rm(buildDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const result = spawnSync(
  python,
  [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onedir",
    "--console",
    "--name",
    "codeclash-speech-worker",
    "--distpath",
    outputDirectory,
    "--workpath",
    buildDirectory,
    "--specpath",
    buildDirectory,
    "--collect-all",
    "faster_whisper",
    "--collect-all",
    "ctranslate2",
    "--collect-all",
    "av",
    "--collect-all",
    "huggingface_hub",
    "--collect-all",
    "tokenizers",
    workerSource,
  ],
  {
    cwd: desktopDirectory,
    env: process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`PyInstaller exited with status ${result.status}.`);
}

await rm(buildDirectory, { recursive: true, force: true });
console.info(`[Desktop] Packaged persistent speech worker at ${outputDirectory}`);
