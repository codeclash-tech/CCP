import { createConnection } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../src/config/env.js";
import { ExecutionService } from "../src/services/executionService.js";

function isLoopback(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname.toLowerCase());
}

function isTcpReachable(hostname, port, timeoutMs = 1000) {
  return new Promise((resolveReachable) => {
    const socket = createConnection({ host: hostname, port });
    const finish = (reachable) => {
      socket.destroy();
      resolveReachable(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function javaEchoProgram() {
  return `public class Main {
  public static void main(String[] args) throws Exception {
    java.util.Scanner input = new java.util.Scanner(System.in);
    System.out.println(input.hasNextLine() ? input.nextLine() : "ok");
  }
}`;
}

function summarize(result, expectedStatus, startedAt) {
  return {
    status: result.status,
    accepted: result.accepted,
    passed: result.passed,
    total: result.total,
    latencyMs: Date.now() - startedAt,
    expectedStatus,
    matched: expectedStatus.includes(result.status),
  };
}

async function main() {
  let endpoint;
  try {
    endpoint = new URL(config.SECURE_CODE_ENGINE_URL);
  } catch {
    console.log(JSON.stringify({ status: "BLOCKED", reason: "Secure runner URL is invalid." }));
    process.exitCode = 2;
    return;
  }
  if (process.env.LEARNING_RUNNER_SMOKE !== "true") {
    console.log(JSON.stringify({
      status: "BLOCKED",
      reason: "Set LEARNING_RUNNER_SMOKE=true after authorizing a local isolated runner.",
      host: endpoint.hostname,
      port: endpoint.port || (endpoint.protocol === "https:" ? 443 : 80),
    }));
    process.exitCode = 2;
    return;
  }
  if (!isLoopback(endpoint.hostname)) {
    console.log(JSON.stringify({
      status: "BLOCKED",
      reason: "Live runner smoke tests are restricted to loopback hosts.",
      host: endpoint.hostname,
    }));
    process.exitCode = 2;
    return;
  }
  const port = Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80));
  if (!await isTcpReachable(endpoint.hostname, port)) {
    console.log(JSON.stringify({
      status: "BLOCKED",
      reason: "The configured local secure runner is not reachable.",
      host: endpoint.hostname,
      port,
    }));
    process.exitCode = 2;
    return;
  }

  const service = new ExecutionService(
    config.SECURE_CODE_ENGINE_URL,
    15000,
    config.SECURE_CODE_ENGINE_API_KEY,
  );
  const results = [];
  const checks = [
    {
      id: "valid-output",
      code: `public class Main { public static void main(String[] args) { System.out.println("ok"); } }`,
      tests: [{ input: "", expectedOutput: "ok" }],
      expectedStatus: ["ACCEPTED"],
      options: { timeLimit: 2000, memoryLimit: 65536 },
    },
    {
      id: "multiple-cases",
      code: javaEchoProgram(),
      tests: [
        { input: "alpha", expectedOutput: "alpha" },
        { input: "beta", expectedOutput: "beta" },
      ],
      expectedStatus: ["ACCEPTED"],
      options: { timeLimit: 2000, memoryLimit: 65536 },
    },
    {
      id: "incorrect-output",
      code: `public class Main { public static void main(String[] args) { System.out.println("wrong"); } }`,
      tests: [{ input: "", expectedOutput: "expected" }],
      expectedStatus: ["WRONG_ANSWER"],
      options: { timeLimit: 2000, memoryLimit: 65536 },
    },
    {
      id: "compilation-error",
      code: "public class Main {",
      tests: [{ input: "", expectedOutput: "ok" }],
      expectedStatus: ["COMPILATION_ERROR"],
      options: { timeLimit: 2000, memoryLimit: 65536 },
    },
    {
      id: "runtime-error",
      code: `public class Main { public static void main(String[] args) { throw new RuntimeException("test"); } }`,
      tests: [{ input: "", expectedOutput: "ok" }],
      expectedStatus: ["RUNTIME_ERROR"],
      options: { timeLimit: 2000, memoryLimit: 65536 },
    },
    {
      id: "timeout",
      code: `public class Main { public static void main(String[] args) { while (true) { } } }`,
      tests: [{ input: "", expectedOutput: "ok" }],
      expectedStatus: ["TIME_LIMIT_EXCEEDED"],
      options: { timeLimit: 250, memoryLimit: 65536 },
    },
    {
      id: "memory-limit",
      code: `public class Main { public static void main(String[] args) { byte[] values = new byte[200000000]; System.out.println(values.length); } }`,
      tests: [{ input: "", expectedOutput: "200000000" }],
      expectedStatus: ["MEMORY_LIMIT_EXCEEDED", "SYSTEM_ERROR"],
      options: { timeLimit: 2000, memoryLimit: 65536 },
    },
    {
      id: "malformed-empty-submission",
      code: "",
      tests: [{ input: "", expectedOutput: "ok" }],
      expectedStatus: ["COMPILATION_ERROR", "SYSTEM_ERROR"],
      options: { timeLimit: 2000, memoryLimit: 65536 },
    },
  ];

  for (const check of checks) {
    const startedAt = Date.now();
    try {
      const result = await service.execute(
        check.code,
        check.tests,
        "java",
        check.options,
      );
      results.push({ id: check.id, ...summarize(result, check.expectedStatus, startedAt) });
    } catch (error) {
      results.push({
        id: check.id,
        status: "ERROR",
        matched: false,
        latencyMs: Date.now() - startedAt,
        error: String(error?.message || "Runner request failed."),
      });
    }
  }

  const report = {
    status: results.every((result) => result.matched) ? "COMPLETED" : "FAILED",
    runnerHost: endpoint.hostname,
    resultCount: results.length,
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "COMPLETED") process.exitCode = 1;
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  await main();
}
