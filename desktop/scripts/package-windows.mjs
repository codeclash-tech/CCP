import { spawnSync } from "node:child_process";
import { build, createTargets, Platform } from "electron-builder";
import { access, copyFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(scriptsDirectory, "..");
const repositoryRoot = path.resolve(desktopDirectory, "..");
const integrityManifestPath = path.join(
  desktopDirectory,
  "build-integrity-manifest.json",
);

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`);
  }
}

async function findCachedElectronArchive() {
  const desktopPackage = JSON.parse(
    await readFile(path.join(desktopDirectory, "package.json"), "utf8"),
  );
  const electronPackage = JSON.parse(
    await readFile(path.join(desktopDirectory, "node_modules", "electron", "package.json"), "utf8"),
  );
  const electronVersion = desktopPackage.build.electronVersion || electronPackage.version;
  const cacheDirectory =
    process.env.electron_config_cache ||
    path.join(
      process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"),
      "electron",
      "Cache",
    );

  let entries;
  try {
    entries = await readdir(cacheDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const archiveName = `electron-v${electronVersion}-win32-x64.zip`;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const archivePath = path.join(cacheDirectory, entry.name, archiveName);
    try {
      await access(archivePath);
      return archivePath;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return null;
}

async function prepareRceditDirectory() {
  const rceditPath = path.join(
    desktopDirectory,
    "node_modules",
    "electron-winstaller",
    "vendor",
    "rcedit.exe",
  );

  try {
    await access(rceditPath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const rceditDirectory = await mkdtemp(path.join(tmpdir(), "codeclash-rcedit-"));
  try {
    await copyFile(rceditPath, path.join(rceditDirectory, "rcedit-x64.exe"));
    return rceditDirectory;
  } catch (error) {
    await rm(rceditDirectory, { recursive: true, force: true });
    throw error;
  }
}

try {
  await rm(integrityManifestPath, { force: true });
  run(process.execPath, [path.join(scriptsDirectory, "build.mjs")], repositoryRoot);
  run(process.execPath, [path.join(scriptsDirectory, "prepare-runtime.mjs")], repositoryRoot);
  run(
    process.execPath,
    [path.join(scriptsDirectory, "create-integrity-manifest.mjs")],
    repositoryRoot,
  );

  const electronArchive = await findCachedElectronArchive();
  const rceditDirectory = process.env.ELECTRON_BUILDER_RCEDIT_PATH
    ? null
    : await prepareRceditDirectory();
  const previousRceditPath = process.env.ELECTRON_BUILDER_RCEDIT_PATH;
  if (rceditDirectory) {
    process.env.ELECTRON_BUILDER_RCEDIT_PATH = rceditDirectory;
  }

  try {
    await build({
      projectDir: desktopDirectory,
      targets: createTargets([Platform.WINDOWS], "nsis", "x64"),
      config: electronArchive ? { electronDist: electronArchive } : undefined,
    });
  } finally {
    if (previousRceditPath === undefined) {
      delete process.env.ELECTRON_BUILDER_RCEDIT_PATH;
    } else {
      process.env.ELECTRON_BUILDER_RCEDIT_PATH = previousRceditPath;
    }
    if (rceditDirectory) {
      await rm(rceditDirectory, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.error(`Windows packaging failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await rm(integrityManifestPath, { force: true });
}
