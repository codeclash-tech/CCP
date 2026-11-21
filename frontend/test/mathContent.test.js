import assert from "node:assert/strict";
import test from "node:test";
import { parseMathContent } from "../src/utils/mathContent.js";

test("math content preserves text and renders inline and display formulas", () => {
  const segments = parseMathContent("Use $x^2$ here.\n$$y=mx+b$$");

  assert.deepEqual(segments.map(({ type }) => type), [
    "text",
    "inline-math",
    "text",
    "display-math",
  ]);
  assert.match(segments[1].html, /katex/);
  assert.match(segments[3].html, /katex-display/);
});

test("untrusted formula commands are rendered as KaTeX errors, not trusted HTML", () => {
  const [segment] = parseMathContent("$\\href{javascript:alert(1)}{open}$");

  assert.equal(segment.type, "inline-math");
  assert.doesNotMatch(segment.html, /href="javascript:/i);
});
