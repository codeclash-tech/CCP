import { createHash, randomBytes } from "node:crypto";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeExecutionRequest } from "./executionRequest.js";

const STARTUP_TIMEOUT_MS = 90_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;
const HEALTH_POLL_MS = 250;
const EXECUTION_TIMEOUT_MS = 300_000;
export const LOCAL_ENGINE_VERSION = "1.0.0";
const ENGINE_VERSION = LOCAL_ENGINE_VERSION;
const SHA256_PATTERN = /^[a-f\d]{64}$/i;

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

function waitForCommand(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: "ignore",
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} did not finish within ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

async function findAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (!address || typeof address === "string") {
    throw new Error("Unable to allocate a local execution-engine port.");
  }
  return address.port;
}

function bundledExecutable(runtimeDirectory, name) {
  const executableName = process.platform === "win32" ? `${name}.exe` : name;
  return path.join(runtimeDirectory, "bin", executableName);
}

function getEngineEnvironment(javaPath) {
  const environment = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  if (path.isAbsolute(javaPath)) {
    const javaHome = path.dirname(path.dirname(javaPath));
    environment.JAVA_HOME = javaHome;
    environment.PATH = [
      path.dirname(javaPath),
      environment.PATH || environment.Path,
    ]
      .filter(Boolean)
      .join(path.delimiter);
    delete environment.Path;
  }
  return environment;
}

function resolveExecutable(command, label) {
  if (path.isAbsolute(command)) return command;
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(locator, [command], {
    encoding: "utf8",
    windowsHide: true,
  });
  const resolved = result.status === 0
    ? result.stdout.split(/\r?\n/).find((line) => line.trim())?.trim()
    : null;
  if (!resolved) {
    const reason = result.error?.message || result.stderr?.trim() || "not found on PATH";
    throw new Error(
      `Unable to locate the ${label} command "${command}" (${reason}). Set JAVA_HOME to a Java 21 JDK for development.`,
    );
  }
  return resolved;
}

export class LocalEngine {
  constructor({ app, resourcesPath, isPackaged }) {
    this.app = app;
    this.resourcesPath = resourcesPath;
    this.isPackaged = isPackaged;
    this.child = null;
    this.port = null;
    this.apiKey = null;
    this.diagnosticApiKey = null;
    this.startPromise = null;
    this.startError = null;
    this.stderr = "";
    this.stdout = "";
    this.workspacePath = path.join(app.getPath("userData"), "engine", "workspace");
    this.diagnosticsPath = path.join(
      app.getPath("userData"),
      "logs",
      "engine-startup.log",
    );
    this.stopping = false;
    this.lastExit = null;
    this.startupDetails = {};
    this.lastHealthIssue = null;
    this.lastLoggedHealthIssue = null;
  }

  get engineUrl() {
    if (!this.port) {
      throw new Error("The local execution engine has not started.");
    }
    return `http://127.0.0.1:${this.port}`;
  }

  getArtifactPaths() {
    if (this.isPackaged) {
      const runtimeDirectory = path.join(this.resourcesPath, "runtime");
      return {
        jarPath: path.join(
          this.resourcesPath,
          "engine",
          "secure-code-engine.jar",
        ),
        javaPath: bundledExecutable(runtimeDirectory, "java"),
        compilerPath: bundledExecutable(runtimeDirectory, "javac"),
      };
    }
    const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
    return {
      jarPath: path.join(
        repositoryRoot,
        "secure-code-engine",
        "target",
        `secure-code-engine-${ENGINE_VERSION}.jar`,
      ),
      javaPath: process.env.JAVA_HOME
        ? bundledExecutable(process.env.JAVA_HOME, "java")
        : process.platform === "win32"
          ? "java.exe"
          : "java",
      compilerPath: process.env.JAVA_HOME
        ? bundledExecutable(process.env.JAVA_HOME, "javac")
        : process.platform === "win32"
          ? "javac.exe"
          : "javac",
    };
  }

  async verifyIntegrity() {
    if (!this.isPackaged) {
      return { verified: false, mode: "DEVELOPMENT" };
    }
    const manifestPath = path.join(
      this.resourcesPath,
      "integrity-manifest.json",
    );
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      throw new Error("The packaged application integrity manifest is missing or invalid.", {
        cause: error,
      });
    }
    if (
      manifest?.protocolVersion !== 1 ||
      manifest.applicationVersion !== this.app.getVersion() ||
      manifest.engineVersion !== ENGINE_VERSION ||
      !SHA256_PATTERN.test(manifest.files?.engineJar || "") ||
      !SHA256_PATTERN.test(manifest.files?.java || "") ||
      !SHA256_PATTERN.test(manifest.files?.javac || "") ||
      !SHA256_PATTERN.test(manifest.files?.runtimeModules || "") ||
      !SHA256_PATTERN.test(manifest.files?.runtimeRelease || "")
    ) {
      throw new Error("The packaged application integrity manifest does not match this release.");
    }

    const { jarPath, javaPath, compilerPath } = this.getArtifactPaths();
    const runtimeDirectory = path.dirname(path.dirname(javaPath));
    for (const [name, filePath, expectedHash] of [
     ["engine JAR", jarPath, manifest.files.engineJar],
     ["Java runtime", javaPath, manifest.files.java],
     ["Java compiler", compilerPath, manifest.files.javac],
     ["Java runtime modules", path.join(runtimeDirectory, "lib", "modules"), manifest.files.runtimeModules],
     ["Java runtime release metadata", path.join(runtimeDirectory, "release"), manifest.files.runtimeRelease],
    ]) {
      const actualHash = await hashFile(filePath);
      if (actualHash !== expectedHash.toLowerCase()) {
        throw new Error(`The packaged ${name} failed its release integrity check.`);
      }
    }
    return {
      verified: true,
      mode: "PACKAGED_HASH_CHECK",
      applicationVersion: manifest.applicationVersion,
      engineVersion: manifest.engineVersion,
    };
  }

  async recordDiagnostic(event, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...details,
    };
    const serializedEntry = JSON.stringify(entry);
    const secret = this.apiKey || this.diagnosticApiKey;
    const safeEntry = secret
      ? serializedEntry.split(secret).join("[redacted]")
      : serializedEntry;
    try {
      await mkdir(path.dirname(this.diagnosticsPath), { recursive: true });
      await appendFile(this.diagnosticsPath, `${safeEntry}\n`, "utf8");
    } catch (error) {
      console.error("Unable to write local engine diagnostics:", error);
    }
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startOnce();
    try {
      return await this.startPromise;
    } catch (error) {
      this.startPromise = null;
      await this.recordDiagnostic("engine-start-failed", {
        message: error.message,
        stdout: this.stdout,
        stderr: this.stderr,
        processExit: this.lastExit,
        lastHealthCheck: this.lastHealthIssue,
        ...this.startupDetails,
      });
      try {
        await this.stop();
      } catch (stopError) {
        console.error("Failed to clean up the engine after startup failure:", stopError);
      }
      throw error;
    }
  }

  async startOnce() {
    this.startupDetails = {
      isPackaged: this.isPackaged,
      workspacePath: this.workspacePath,
    };
    this.lastHealthIssue = null;
    this.lastLoggedHealthIssue = null;
    await this.recordDiagnostic("engine-start-requested", {
      ...this.startupDetails,
      apiKeyGenerated: false,
    });

    const { jarPath, javaPath: configuredJavaPath, compilerPath: configuredCompilerPath } =
      this.getArtifactPaths();
    await this.verifyIntegrity();
    this.startupDetails = {
      ...this.startupDetails,
      jarPath,
      javaPath: configuredJavaPath,
      compilerPath: configuredCompilerPath,
    };
    const javaPath = resolveExecutable(configuredJavaPath, "Java runtime");
    const compilerPath = resolveExecutable(configuredCompilerPath, "Java compiler");
    this.startupDetails = { ...this.startupDetails, javaPath, compilerPath };
    for (const [label, filePath] of [
      ["engine JAR", jarPath],
      ["Java runtime", javaPath],
      ["Java compiler", compilerPath],
    ]) {
      await this.recordDiagnostic("artifact-validation", {
        ...this.startupDetails,
        artifact: label,
        artifactPath: filePath,
        status: "started",
      });
      try {
        await access(filePath);
      } catch (error) {
        await this.recordDiagnostic("artifact-validation", {
          ...this.startupDetails,
          artifact: label,
          artifactPath: filePath,
          status: "failed",
          message: error.message,
        });
        throw new Error(`The ${label} is missing or inaccessible at "${filePath}": ${error.message}`, {
          cause: error,
        });
      }
      await this.recordDiagnostic("artifact-validation", {
        ...this.startupDetails,
        artifact: label,
        artifactPath: filePath,
        status: "passed",
      });
    }

    await mkdir(this.workspacePath, { recursive: true });
    await this.cleanAbandonedWorkspaces();
    this.port = await findAvailablePort();
    this.apiKey = randomBytes(32).toString("hex");
    this.diagnosticApiKey = this.apiKey;
    this.startupDetails = {
      ...this.startupDetails,
      port: this.port,
    };
    this.startError = null;
    this.stderr = "";
    this.stdout = "";
    this.lastExit = null;

    await this.recordDiagnostic("engine-spawn-requested", {
      ...this.startupDetails,
      apiKeyGenerated: true,
    });
    try {
      this.child = spawn(javaPath, ["-jar", jarPath], {
        cwd: path.dirname(this.workspacePath),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...getEngineEnvironment(javaPath),
          SERVER_PORT: String(this.port),
          SERVER_ADDRESS: "127.0.0.1",
          WORKSPACE_PATH: this.workspacePath,
          ENGINE_MASTER_API_KEY: this.apiKey,
          JAVA_COMPILER: compilerPath,
          JAVA_RUNTIME: javaPath,
          DOCKER_ENABLED: "false",
        },
      });
    } catch (error) {
      this.startError = error;
      await this.recordDiagnostic("engine-process-error", {
        ...this.startupDetails,
        message: error.message,
        code: error.code,
        stdout: this.stdout,
        stderr: this.stderr,
      });
      throw error;
    }
    const engineProcess = this.child;
    engineProcess.once("close", (code, signal) => {
      this.lastExit = { code, signal };
      void this.recordDiagnostic("engine-process-exited", {
        ...this.startupDetails,
        code,
        signal,
        stdout: this.stdout,
        stderr: this.stderr,
      });
      if (this.child !== engineProcess) return;
      this.child = null;
      this.port = null;
      this.apiKey = null;
      this.startPromise = null;
    });

    engineProcess.stdout.setEncoding("utf8");
    engineProcess.stderr.setEncoding("utf8");
    engineProcess.stdout.on("data", (chunk) => {
      this.stdout = `${this.stdout}${chunk}`.slice(-8_000);
    });
    engineProcess.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-8_000);
    });
    engineProcess.once("error", (error) => {
      this.startError = error;
      void this.recordDiagnostic("engine-process-error", {
        ...this.startupDetails,
        message: error.message,
        code: error.code,
        stdout: this.stdout,
        stderr: this.stderr,
      });
    });

    await this.recordDiagnostic("engine-spawned", {
      ...this.startupDetails,
      pid: engineProcess.pid,
      apiKeyGenerated: true,
    });

    await this.waitForHealth();
    return { status: "ready", local: true };
  }

  async waitForHealth() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    let lastHealthIssue = "No health response received.";
    while (Date.now() < deadline) {
      if (this.startError) {
        throw new Error(
          `Failed to launch the local Java engine: ${this.startError.message}${this.formatStartupDetails(lastHealthIssue)}`,
          { cause: this.startError },
        );
      }
      if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) {
        await this.logHealthFailure(lastHealthIssue);
        throw new Error(
          `The local Java engine stopped during startup.${this.formatStartupDetails(lastHealthIssue)}`,
        );
      }

      try {
        const response = await fetch(`${this.engineUrl}/health`, {
          signal: AbortSignal.timeout(1_000),
        });
        if (response.status === 200) {
          const health = await response.json();
          if (health?.status === "UP") {
            if (!this.isChildAlive()) {
              lastHealthIssue = "The engine process stopped before readiness was confirmed.";
            } else {
              await this.recordDiagnostic("engine-ready", {
                ...this.startupDetails,
                healthStatus: health.status,
                uptimeMs: health.uptimeMs,
              });
              if (!this.isChildAlive()) {
                lastHealthIssue = "The engine process stopped before readiness was confirmed.";
              } else {
                return;
              }
            }
          } else {
            lastHealthIssue = `Health response was not ready: ${JSON.stringify(health).slice(0, 500)}`;
          }
        } else {
          const body = (await response.text()).slice(0, 500);
          lastHealthIssue = `Health endpoint returned HTTP ${response.status}${body ? `: ${body}` : ""}`;
        }
      } catch (error) {
        lastHealthIssue = `Health check failed: ${error.message}`;
      }

      await this.logHealthFailure(lastHealthIssue);
      await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
    }
    await this.logHealthFailure(lastHealthIssue);
    throw new Error(
      `The local Java engine did not become healthy within ${STARTUP_TIMEOUT_MS / 1_000} seconds.${this.formatStartupDetails(lastHealthIssue)}`,
    );
  }

  isChildAlive() {
    return Boolean(
      this.child &&
        this.child.exitCode === null &&
        this.child.signalCode === null,
    );
  }

  async logHealthFailure(issue) {
    this.lastHealthIssue = issue;
    if (issue === this.lastLoggedHealthIssue) return;
    this.lastLoggedHealthIssue = issue;
    await this.recordDiagnostic("engine-health-check-failed", {
      ...this.startupDetails,
      lastHealthCheck: issue,
      stdout: this.stdout,
      stderr: this.stderr,
      processExit: this.lastExit,
    });
  }

  formatStartupDetails(lastHealthIssue) {
    const details = [
      `Diagnostics: ${this.diagnosticsPath}`,
      `Last health check: ${lastHealthIssue}`,
    ];
    if (this.lastExit) {
      details.push(
        `Process exit: code=${this.lastExit.code ?? "none"}, signal=${this.lastExit.signal ?? "none"}`,
      );
    }
    if (this.stdout.trim()) details.push(`Engine stdout:\n${this.stdout.trim()}`);
    if (this.stderr.trim()) details.push(`Engine stderr:\n${this.stderr.trim()}`);
    return `\n\n${details.join("\n\n")}`;
  }

  async getStatus() {
    if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) {
      return { status: "stopped", local: true };
    }
    const response = await fetch(`${this.engineUrl}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      throw new Error(`Local engine health check returned HTTP ${response.status}.`);
    }
    const health = await response.json();
    if (!health || typeof health !== "object" || Array.isArray(health)) {
      throw new Error("The local engine returned an invalid health response.");
    }
    return { ...health, local: true };
  }

  async execute(request) {
    const normalized = normalizeExecutionRequest(request);
    if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) {
      await this.start();
    }
    if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) {
      throw new Error("The local execution engine is unavailable.");
    }

    const response = await fetch(`${this.engineUrl}/api/v1/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(normalized),
      signal: AbortSignal.timeout(EXECUTION_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = body?.message || body?.error || `HTTP ${response.status}`;
      throw new Error(`Local execution failed: ${reason}`);
    }
    if (!body || typeof body !== "object" || !Array.isArray(body.results)) {
      throw new Error("The local engine returned an invalid execution response.");
    }
    if (body.results.length !== normalized.testCases.length) {
      throw new Error("The local engine returned an unexpected number of test results.");
    }
    return body;
  }

  async stop() {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    this.child = null;
    try {
      if (child.exitCode === null && child.signalCode === null && this.port && this.apiKey) {
        try {
          const response = await fetch(`${this.engineUrl}/api/v1/lifecycle/shutdown`, {
            method: "POST",
            headers: { "x-api-key": this.apiKey },
            signal: AbortSignal.timeout(2_000),
          });
          if (!response.ok) {
            console.error(`Engine graceful shutdown returned HTTP ${response.status}.`);
          }
        } catch (error) {
          console.error("Engine graceful shutdown request failed; terminating the local process.", error);
        }
        const exited = await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
        if (!exited && child.exitCode === null && child.signalCode === null) {
          console.error("Engine did not stop gracefully; terminating the local process.");
          if (process.platform === "win32" && child.pid) {
            const exitCode = await waitForCommand(
              "taskkill.exe",
              ["/PID", String(child.pid), "/T", "/F"],
              5_000,
            );
            if (exitCode !== 0 && child.exitCode === null) {
              child.kill();
            }
          } else {
            child.kill();
          }
          if (!(await waitForExit(child, 5_000))) {
            throw new Error("The local execution engine process tree did not stop after forced termination.");
          }
        }
      }
    } finally {
      this.port = null;
      this.apiKey = null;
      this.startPromise = null;
      this.stopping = false;
      await this.cleanAbandonedWorkspaces();
    }
  }

  async cleanAbandonedWorkspaces() {
    await mkdir(this.workspacePath, { recursive: true });
    const entries = await readdir(this.workspacePath, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("execution-"))
        .map((entry) =>
          rm(path.join(this.workspacePath, entry.name), {
            recursive: true,
            force: true,
          }),
        ),
    );
  }
}
