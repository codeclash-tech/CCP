import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import AssessmentIntegritySession from "../src/models/AssessmentIntegritySession.js";
import WeeklyCycle from "../src/models/WeeklyCycle.js";
import WeeklyRosterEntry from "../src/models/WeeklyRosterEntry.js";
import { recordAssessmentIntegrityEvent } from "../src/controllers/assessmentIntegrityController.js";
import { calculateIntegrityRisk } from "../src/services/assessmentIntegrityService.js";
import assessmentIntegrityRoutes from "../src/routes/assessmentIntegrityRoutes.js";

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("records authenticated integrity activity as review evidence", async (t) => {
  const assessmentId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(WeeklyCycle, "findOne", () => ({
    select: async () => ({ _id: assessmentId }),
  }));
  t.mock.method(WeeklyRosterEntry, "findOne", () => ({
    select: async () => ({ _id: new mongoose.Types.ObjectId() }),
  }));
  t.mock.method(AssessmentIntegritySession, "create", async (session) => ({
    ...session,
    events: session.events,
  }));

  const res = responseRecorder();
  await recordAssessmentIntegrityEvent(
    {
      userId,
      body: {
        assessmentType: "DAILY_CHALLENGE",
        assessmentId: String(assessmentId),
        sessionId: "0a10b0c0-d0e0-40f0-80a0-0a10b0c0d0e0",
        sequence: 1,
        eventType: "FULLSCREEN_EXIT",
        timestamp: new Date().toISOString(),
        reason: "Exited fullscreen mode",
      },
    },
    res,
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.accepted, true);
  assert.equal(res.body.riskScore, 10);
  assert.equal(res.body.riskLevel, "LOW");
  assert.equal(res.body.evidenceOnly, true);
});

test("rejects duplicate or out-of-order integrity event sequence numbers", async (t) => {
  const assessmentId = new mongoose.Types.ObjectId();
  t.mock.method(WeeklyCycle, "findOne", () => ({
    select: async () => ({ _id: assessmentId }),
  }));
  t.mock.method(WeeklyRosterEntry, "findOne", () => ({
    select: async () => ({ _id: new mongoose.Types.ObjectId() }),
  }));
  t.mock.method(AssessmentIntegritySession, "findOne", () => ({
    select: async () => ({ lastSequence: 2 }),
  }));

  const res = responseRecorder();
  await recordAssessmentIntegrityEvent(
    {
      userId: new mongoose.Types.ObjectId(),
      body: {
        assessmentType: "DAILY_CHALLENGE",
        assessmentId: String(assessmentId),
        sessionId: "0a10b0c0-d0e0-40f0-80a0-0a10b0c0d0e0",
        sequence: 2,
        eventType: "TAB_SWITCH",
        timestamp: new Date().toISOString(),
      },
    },
    res,
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.expectedSequence, 3);
});

test("combines repeated monitoring events into risk levels without a misconduct verdict", () => {
  const events = Array.from({ length: 6 }, (_, index) => ({
    eventType: "TAB_SWITCH",
    sequenceGapBefore: index === 5 ? 1 : 0,
  }));
  assert.deepEqual(calculateIntegrityRisk([]), {
    riskScore: 0,
    riskLevel: "LOW",
  });
  assert.deepEqual(calculateIntegrityRisk(events), {
    riskScore: 80,
    riskLevel: "HIGH",
  });
});

test("integrity event writes are authenticated and rate limited", () => {
  const route = assessmentIntegrityRoutes.stack.find(
    (layer) => layer.route?.path === "/events",
  );
  assert.ok(route);
  assert.equal(route.route.stack[0].name, "authenticate");
  assert.equal(route.route.stack.length, 3);
});
