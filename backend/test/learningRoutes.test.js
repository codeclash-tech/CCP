import assert from "node:assert/strict";
import test from "node:test";
import learningRoutes from "../src/routes/learningRoutes.js";
import {
  learningPurchaseLimiter,
  learningTutorLimiter,
} from "../src/middleware/security.js";

function findRoute(path, method) {
  return learningRoutes.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods[method],
  );
}

function authorize(middleware, user) {
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {},
  };
  let continued = false;
  middleware({ user }, response, () => { continued = true; });
  return { continued, statusCode: response.statusCode };
}

test("student learning routes require authentication and a student account role", () => {
  const route = findRoute("/programs", "get");
  assert.ok(route);
  assert.equal(route.route.stack[0].name, "authenticate");
  assert.equal(authorize(route.route.stack[1].handle, { role: "USER" }).continued, true);
  assert.equal(authorize(route.route.stack[1].handle, { role: "ADMIN" }).statusCode, 403);
});

test("topic content route is authenticated and student-only", () => {
  const route = findRoute("/programs/:programId/modules/:moduleId/topics/:topicId", "get");
  assert.ok(route);
  assert.equal(route.route.stack[0].name, "authenticate");
  assert.equal(authorize(route.route.stack[1].handle, { role: "USER" }).continued, true);
  assert.equal(authorize(route.route.stack[1].handle, { role: "ADMIN" }).statusCode, 403);
});

test("Super Admin learning authoring routes require authenticated admin role", () => {
  const route = findRoute("/admin/programs", "post");
  assert.ok(route);
  assert.equal(route.route.stack[0].name, "authenticate");
  assert.equal(authorize(route.route.stack[1].handle, { role: "ADMIN" }).continued, true);
  assert.equal(authorize(route.route.stack[1].handle, { role: "USER" }).statusCode, 403);
});

test("tutor messaging has a dedicated rate limiter after authorization", () => {
  const route = findRoute("/sessions/:sessionId/messages", "post");
  assert.ok(route);
  assert.equal(route.route.stack[2].handle, learningTutorLimiter);
});

test("course creation does not expose a fixed-module template route", () => {
  assert.ok(findRoute("/admin/programs", "post"));
  assert.equal(findRoute("/admin/programs/java-template", "post"), undefined);
  assert.ok(findRoute("/admin/programs/:programId/modules", "post"));
});

test("module publication and topic authoring are Super Admin-only", () => {
  for (const [path, method] of [
    ["/admin/modules/:moduleId/status", "patch"],
    ["/admin/modules/:moduleId/topics", "post"],
    ["/admin/modules/:moduleId/topics/:topicId", "patch"],
    ["/admin/modules/:moduleId/topics/order", "put"],
  ]) {
    const route = findRoute(path, method);
    assert.ok(route);
    assert.equal(route.route.stack[0].name, "authenticate");
    assert.equal(authorize(route.route.stack[1].handle, { role: "ADMIN" }).continued, true);
  }
});

test("payment order and verification routes require a student and rate limiting", () => {
  const purchase = findRoute("/purchases", "post");
  assert.ok(purchase);
  assert.equal(purchase.route.stack[0].name, "authenticate");
  assert.equal(authorize(purchase.route.stack[1].handle, { role: "USER" }).continued, true);
  assert.equal(purchase.route.stack[2].handle, learningPurchaseLimiter);
  const verify = findRoute("/purchases/:purchaseId/verify", "post");
  assert.ok(verify);
  assert.equal(verify.route.stack[2].handle, learningPurchaseLimiter);
  assert.ok(findRoute("/payments/webhook", "post"));
});
