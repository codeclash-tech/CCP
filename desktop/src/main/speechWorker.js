import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SPEECH_SAMPLE_RATE = 16000;
export const MAX_SPEECH_DURATION_SECONDS = 30;
export const SPEECH_MODEL_RAM_THRESHOLD_BYTES = 8 * 1024 ** 3;
export const SPEECH_STARTUP_TIMEOUT_MS = 15 * 60 * 1000;
export const SPEECH_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export function selectSpeechModel(totalMemoryBytes) {
  // Keep the larger English model on machines with at least 8 GiB of system RAM.
  return totalMemoryBytes < SPEECH_MODEL_RAM_THRESHOLD_BYTES
    ? "small.en"
    : "distil-large-v3";
}

function validateAudioRequest(request) {
  const { samples, sampleRate, language } = request || {};
  if (!(samples instanceof Float32Array)) {
    throw new Error("Microphone audio was not in a supported format.");
  }
  if (sampleRate !== SPEECH_SAMPLE_RATE) {
    throw new Error("Microphone audio must be mono 16 kHz audio.");
  }
  if (language !== "en") {
    throw new Error("Speech recognition currently supports English.");
  }
  if (
    samples.length === 0 ||
    samples.length > SPEECH_SAMPLE_RATE * MAX_SPEECH_DURATION_SECONDS
  ) {
    throw new Error("Record a speech clip that is 30 seconds or shorter.");
  }
  return samples;
}

export class PersistentSpeechWorker {
  constructor({
    isPackaged,
    resourcesPath,
    userDataPath,
    totalMemoryBytes = os.totalmem(),
    pythonExecutable = process.env.CODECLASH_PYTHON || process.env.PYTHON || "python",
    spawnImpl = spawn,
  }) {
    this.isPackaged = isPackaged;
    this.resourcesPath = resourcesPath;
    this.userDataPath = userDataPath;
    this.model = selectSpeechModel(totalMemoryBytes);
    this.pythonExecutable = pythonExecutable;
    this.spawnImpl = spawnImpl;
    this.child = null;
    this.startPromise = null;
    this.pendingRequests = new Map();
    this.nextRequestId = 0;
  }

  start() {
    if (this.startPromise) return this.startPromise;

    this.startPromise = new Promise((resolve, reject) => {
      const workerDirectory = path.join(this.resourcesPath, "speech-worker");
      const workerExecutable = path.join(workerDirectory, "codeclash-speech-worker.exe");
      const scriptPath = path.resolve(moduleDirectory, "..", "..", "python", "speech_worker.py");
      const executable = this.isPackaged ? workerExecutable : this.pythonExecutable;
      const args = this.isPackaged ? [] : [scriptPath];
      let isReady = false;
      let settled = false;
      const startupTimer = setTimeout(() => {
        this.child?.kill();
        reject(new Error("Speech recognition is taking too long to start."));
      }, SPEECH_STARTUP_TIMEOUT_MS);
      startupTimer.unref?.();

      const settleStartup = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimer);
        if (error) reject(error);
        else resolve();
      };

      try {
        this.child = this.spawnImpl(executable, args, {
          cwd: this.isPackaged ? workerDirectory : path.dirname(scriptPath),
          env: {
            ...process.env,
            CODECLASH_SPEECH_MODEL: this.model,
            CODECLASH_SPEECH_MODEL_CACHE: path.join(this.userDataPath, "speech-models"),
            HF_HOME: path.join(this.userDataPath, "speech-models", "huggingface"),
            PYTHONUNBUFFERED: "1",
          },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
      } catch {
        settleStartup(new Error("The local speech recognition worker could not start."));
        return;
      }

      createInterface({ input: this.child.stdout }).on("line", (line) => {
        let response;
        try {
          response = JSON.parse(line);
        } catch {
          console.error("The speech worker returned an invalid response.");
          return;
        }

        if (response.type === "ready") {
          isReady = true;
          settleStartup();
          return;
        }
        if (response.type === "startup_error") {
          settleStartup(new Error(response.error));
          return;
        }

        const pending = this.pendingRequests.get(response.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(response.id);
        if (typeof response.error === "string") pending.reject(new Error(response.error));
        else pending.resolve(String(response.text || "").trim());
      });

      this.child.stderr.on("data", (chunk) => {
        console.error("[Speech worker]", chunk.toString().trim());
      });
      this.child.once("error", () => {
        settleStartup(new Error("The local speech recognition worker could not start."));
        this.rejectPendingRequests("The local speech recognition worker stopped.");
      });
      this.child.once("exit", (code) => {
        if (!isReady) {
          settleStartup(new Error("The speech model could not be loaded. Check internet access and available memory."));
        }
        this.rejectPendingRequests(
          code === 0
            ? "The local speech recognition worker stopped."
            : "The local speech recognition worker failed. Restart CodeClash to try again.",
        );
        this.child = null;
      });
    });

    return this.startPromise;
  }

  rejectPendingRequests(message) {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pendingRequests.clear();
  }

  async transcribe(request) {
    const samples = validateAudioRequest(request);
    await this.start();
    if (!this.child || this.child.stdin.destroyed) {
      throw new Error("The local speech recognition worker is unavailable.");
    }

    const id = String(++this.nextRequestId);
    // Send PCM directly over the worker pipe; microphone audio is never written to disk.
    const audio = Buffer.from(
      samples.buffer,
      samples.byteOffset,
      samples.byteLength,
    ).toString("base64");
    const payload = JSON.stringify({
      id,
      sampleRate: SPEECH_SAMPLE_RATE,
      audioBase64: audio,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Speech recognition took too long. Try a shorter recording."));
      }, SPEECH_REQUEST_TIMEOUT_MS);
      timer.unref?.();
      this.pendingRequests.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${payload}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new Error("Audio could not be sent to the local speech recognizer."));
      });
    });
  }

  async stop() {
    if (!this.child) return;
    const child = this.child;
    this.rejectPendingRequests("CodeClash is shutting down.");
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 5000);
      timeout.unref?.();
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.stdin.end();
    });
    this.child = null;
  }
}
