import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(desktopDirectory, "..");
const desktopPackage = JSON.parse(
  await readFile(path.join(desktopDirectory, "package.json"), "utf8"),
);
const enginePath = path.join(
  repositoryRoot,
  "secure-code-engine",
  "target",
  "secure-code-engine-1.0.0.jar",
);
const runtimeDirectory = path.join(desktopDirectory, "runtime-dist");
const runtimeBin = path.join(runtimeDirectory, "bin");

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

const manifest = {
  protocolVersion: 1,
  applicationVersion: desktopPackage.version,
  engineVersion: "1.0.0",
  files: {
    engineJar: await sha256(enginePath),
    java: await sha256(path.join(runtimeBin, "java.exe")),
    javac: await sha256(path.join(runtimeBin, "javac.exe")),
    runtimeModules: await sha256(path.join(runtimeDirectory, "lib", "modules")),
    runtimeRelease: await sha256(path.join(runtimeDirectory, "release")),
  },
};

await writeFile(
  path.join(desktopDirectory, "build-integrity-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
