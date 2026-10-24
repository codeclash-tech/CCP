import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalEngine } from "../src/main/localEngine.js";

async function createPackagedEngineFixture() {
  const resourcesPath = await mkdtemp(path.join(os.tmpdir(), "codeclash-integrity-"));
  const files = {
    engineJar: path.join(resourcesPath, "engine", "secure-code-engine.jar"),
    java: path.join(resourcesPath, "runtime", "bin", "java.exe"),
    javac: path.join(resourcesPath, "runtime", "bin", "javac.exe"),
    runtimeModules: path.join(resourcesPath, "runtime", "lib", "modules"),
    runtimeRelease: path.join(resourcesPath, "runtime", "release"),
  };
  await Promise.all(
    [...new Set(Object.values(files).map((filePath) => path.dirname(filePath)))].map(
      (directory) => mkdir(directory, { recursive: true }),
    ),
  );
  await Promise.all(
    Object.entries(files).map(([name, filePath]) =>
      writeFile(filePath, `fixture:${name}`),
    ),
  );
  const hashes = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([name, filePath]) => [
        name,
        createHash("sha256")
          .update(await readFile(filePath))
          .digest("hex"),
      ]),
    ),
  );
  await writeFile(
    path.join(resourcesPath, "integrity-manifest.json"),
    JSON.stringify({
      protocolVersion: 1,
      applicationVersion: "1.0.0",
      engineVersion: "1.0.0",
      files: hashes,
    }),
  );
  const engine = new LocalEngine({
    app: { getPath: () => resourcesPath, getVersion: () => "1.0.0" },
    resourcesPath,
    isPackaged: true,
  });
  return { engine, files, resourcesPath };
}

test("verifies the packaged engine and Java runtime modules", async () => {
  const fixture = await createPackagedEngineFixture();
  try {
    const result = await fixture.engine.verifyIntegrity();
    assert.equal(result.verified, true);
    assert.equal(result.mode, "PACKAGED_HASH_CHECK");
  } finally {
    await rm(fixture.resourcesPath, { recursive: true, force: true });
  }
});

test("rejects modified bundled Java runtime modules", async () => {
  const fixture = await createPackagedEngineFixture();
  try {
    await writeFile(fixture.files.runtimeModules, "tampered runtime modules");
    await assert.rejects(
      fixture.engine.verifyIntegrity(),
      /Java runtime modules failed its release integrity check/,
    );
  } finally {
    await rm(fixture.resourcesPath, { recursive: true, force: true });
  }
});
