import { spawnSync } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(scriptsDirectory, "..");
const outputDirectory = path.join(desktopDirectory, "runtime-dist");
const javaHome = process.env.JAVA_HOME;

if (!javaHome) {
  throw new Error("JAVA_HOME must point to a Java 21 JDK to build the bundled compiler runtime.");
}

const jlinkName = process.platform === "win32" ? "jlink.exe" : "jlink";
const jlink = path.join(javaHome, "bin", jlinkName);
await access(jlink);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.dirname(outputDirectory), { recursive: true });

const result = spawnSync(
  jlink,
  [
    "--add-modules",
    "java.base,java.compiler,java.desktop,java.logging,java.management,java.naming,java.security.jgss,java.security.sasl,java.instrument,java.sql,java.xml,jdk.compiler,jdk.crypto.ec,jdk.unsupported",
    "--strip-debug",
    "--no-man-pages",
    "--no-header-files",
    "--compress=2",
    "--output",
    outputDirectory,
  ],
  { stdio: "inherit", windowsHide: true },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`jlink exited with status ${result.status}.`);
}
