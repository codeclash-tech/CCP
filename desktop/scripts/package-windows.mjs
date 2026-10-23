import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(scriptsDirectory, "..");
const repositoryRoot = path.resolve(desktopDirectory, "..");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`);
  }
}

try {
  run(process.execPath, [path.join(scriptsDirectory, "build.mjs")], repositoryRoot);
  run(process.execPath, [path.join(scriptsDirectory, "prepare-runtime.mjs")], repositoryRoot);
  run(
    process.execPath,
    [path.join(desktopDirectory, "node_modules", "electron-builder", "cli.js"), "--win", "nsis", "--x64"],
    desktopDirectory,
  );
} catch (error) {
  console.error(`Windows packaging failed: ${error.message}`);
  process.exitCode = 1;
}
