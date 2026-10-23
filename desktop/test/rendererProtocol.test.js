import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveRendererPath } from "../src/main/rendererProtocol.js";

const rendererDirectory = path.resolve("resources", "renderer");

test("resolves packaged renderer URLs within the app origin", () => {
  assert.equal(
    resolveRendererPath("codeclash://app/index.html", rendererDirectory),
    path.join(rendererDirectory, "index.html"),
  );
  assert.equal(
    resolveRendererPath("codeclash://app/assets/app.js", rendererDirectory),
    path.join(rendererDirectory, "assets", "app.js"),
  );
});

test("rejects untrusted origins and renderer paths", () => {
  assert.equal(
    resolveRendererPath("https://example.com/index.html", rendererDirectory),
    null,
  );
  assert.equal(
    resolveRendererPath("codeclash://other/index.html", rendererDirectory),
    null,
  );
  assert.equal(
    resolveRendererPath(
      "codeclash://app/%2e%2e%2f..%2foutside.txt",
      rendererDirectory,
    ),
    null,
  );
});
