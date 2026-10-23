import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(scriptsDirectory, "..");
const repositoryRoot = path.resolve(desktopDirectory, "..");
const frontendDirectory = path.join(repositoryRoot, "frontend");
const engineDirectory = path.join(repositoryRoot, "secure-code-engine");
const apiUrl =
  process.env.CODECLASH_API_URL ||
  "https://ccp-backend-qylz.onrender.com/api";

console.info(`[Desktop] Building renderer for API: ${new URL(apiUrl).origin}`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`);
  }
}

try {
  run(
    process.execPath,
    [path.join(frontendDirectory, "node_modules", "vite", "bin", "vite.js"), "build"],
    {
      cwd: frontendDirectory,
      env: {
        ...process.env,
        CODECLASH_DESKTOP_BUILD: "true",
        VITE_API_URL: apiUrl,
      },
    },
  );
  run(
    process.platform === "win32" ? process.env.ComSpec : "mvn",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "mvn package -DskipTests"]
      : ["package", "-DskipTests"],
    { cwd: engineDirectory },
  );
} catch (error) {
  console.error(`Desktop build failed: ${error.message}`);
  process.exitCode = 1;
}
