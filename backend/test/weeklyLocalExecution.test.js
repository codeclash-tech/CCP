import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import GlobalChallenge from "../src/models/GlobalChallenge.js";
import Nonce from "../src/models/Nonce.js";
import WeeklyCycle from "../src/models/WeeklyCycle.js";
import WeeklyRosterEntry from "../src/models/WeeklyRosterEntry.js";
import WeeklySubmission from "../src/models/WeeklySubmission.js";
import { createWeeklyLocalExecutionGrant } from "../src/services/weeklyAssessmentService.js";

test("Daily Challenge local reservations do not require persisted source code", async () => {
  const submission = new WeeklySubmission({
    cycleId: new mongoose.Types.ObjectId(),
    candidateId: new mongoose.Types.ObjectId(),
    rosterEntryId: new mongoose.Types.ObjectId(),
    dayIndex: 0,
    challengeId: new mongoose.Types.ObjectId(),
    sourceHash: "a".repeat(64),
    sourceCode: "",
    executionMode: "DESKTOP_LOCAL",
    status: "AUTHORIZED",
  });

  await assert.doesNotReject(submission.validate());
});

test("server-verified submissions still require persisted source code", async () => {
  const submission = new WeeklySubmission({
    cycleId: new mongoose.Types.ObjectId(),
    candidateId: new mongoose.Types.ObjectId(),
    rosterEntryId: new mongoose.Types.ObjectId(),
    dayIndex: 0,
    challengeId: new mongoose.Types.ObjectId(),
    sourceHash: "a".repeat(64),
    sourceCode: "",
    executionMode: "SERVER_VERIFIED",
    status: "PENDING_VERIFICATION",
  });

  await assert.rejects(
    submission.validate(),
    (error) => Boolean(error.errors.sourceCode),
  );
});

function setupActiveDailyCycle(t, candidateId) {
  const cycleId = new mongoose.Types.ObjectId();
  const challengeId = new mongoose.Types.ObjectId();
  const roster = {
    _id: new mongoose.Types.ObjectId(),
    participationStatus: "NOT_STARTED",
  };
  const cycle = {
    _id: cycleId,
    startAt: new Date(Date.now() - 60 * 60 * 1000),
    endAt: new Date(Date.now() + 60 * 60 * 1000),
    status: "ACTIVE",
    rosterFrozenAt: new Date(Date.now() - 30 * 60 * 1000),
    questionAssignments: [{
      dayIndex: 0,
      challengeId,
      questionSnapshot: {
        title: "Example",
        description: "Example challenge",
        points: 100,
        signature: null,
        visibleTestCases: [{ input: "visible", expectedOutput: "ok" }],
        hiddenTestCases: [{ input: "secret", expectedOutput: "secret-output" }],
      },
    }],
  };
  t.mock.method(WeeklyCycle, "findOne", () => ({
    sort: async () => cycle,
  }));
  t.mock.method(GlobalChallenge, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));
  t.mock.method(WeeklyRosterEntry, "findOne", () => roster);
  return { cycle, challengeId, candidateId };
}

function grantRequest(context, sourceHash = "a".repeat(64), executionId = "0a10b0c0-d0e0-40f0-80a0-0a10b0c0d0e0") {
  return {
    candidateId: context.candidateId,
    cycleId: String(context.cycle._id),
    questionId: String(context.challengeId),
    sourceHash,
    executionId,
    clientVersion: "1.0.0",
    engineVersion: "1.0.0",
    executionProtocolVersion: 1,
  };
}

test("Daily Challenge grants bind the active question and expose only visible-case count", async (t) => {
  const candidateId = new mongoose.Types.ObjectId();
  const context = setupActiveDailyCycle(t, candidateId);
  let reservation;
  t.mock.method(WeeklySubmission, "findOne", () => ({
    select: async () => reservation || null,
  }));
  t.mock.method(WeeklySubmission, "create", async (values) => {
    reservation = { ...values, _id: values._id };
    return reservation;
  });
  t.mock.method(Nonce, "findOne", (query) => ({
    lean: async () => query.resourceId
      ? null
      : { authorizationExpiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  }));
  t.mock.method(Nonce, "generate", async () => "b".repeat(64));

  const grant = await createWeeklyLocalExecutionGrant(grantRequest(context));
  assert.equal(grant.testCount, 1);
  assert.equal(grant.challengeId, String(context.challengeId));
  assert.equal(grant.submissionId, String(reservation._id));
  assert.equal(grant.nonce, "b".repeat(64));
  assert.equal("visibleTestCases" in grant, false);
  assert.equal("hiddenTestCases" in grant, false);
});

test("Daily Challenge grant reservation prevents a second source from racing for the daily result", async (t) => {
  const candidateId = new mongoose.Types.ObjectId();
  const context = setupActiveDailyCycle(t, candidateId);
  const reservation = {
    _id: new mongoose.Types.ObjectId(),
    sourceHash: "a".repeat(64),
    executionMode: "DESKTOP_LOCAL",
    status: "AUTHORIZED",
  };
  t.mock.method(WeeklySubmission, "findOne", () => ({
    select: async () => reservation,
  }));

  await assert.rejects(
    createWeeklyLocalExecutionGrant(
      grantRequest(context, "c".repeat(64)),
    ),
    (error) => error.statusCode === 409,
  );
});
