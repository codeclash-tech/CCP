import assert from "node:assert/strict";
import test from "node:test";
import { createCorsMiddleware } from "../src/middleware/security.js";

function createResponse() {
  const headers = new Map();
  return {
    headers,
    statusCode: null,
    ended: false,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    end() {
      this.ended = true;
    },
  };
}

test("allows the packaged desktop origin for credentialed API requests", () => {
  const middleware = createCorsMiddleware(["https://example.com", "codeclash://app"]);
  const response = createResponse();

  middleware(
    { method: "OPTIONS", headers: { origin: "codeclash://app" } },
    response,
    () => assert.fail("preflight should end without calling next"),
  );

  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "codeclash://app",
  );
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
});

test("does not allow opaque or arbitrary origins", () => {
  const middleware = createCorsMiddleware(["https://example.com", "codeclash://app"]);
  const response = createResponse();
  let continued = false;

  middleware(
    { method: "POST", headers: { origin: "null" } },
    response,
    () => {
      continued = true;
    },
  );

  assert.equal(response.headers.has("access-control-allow-origin"), false);
  assert.equal(continued, true);
});
