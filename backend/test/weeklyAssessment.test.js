import assert from "node:assert/strict";
import test from "node:test";
import weeklyAssessmentRoutes from "../src/routes/weeklyAssessmentRoutes.js";
import {
  calculateWeeklyRankings,
  getWeeklyCycleBounds,
  getRecurringCycleBounds,
  getWeeklyDayIndex,
  getWeeklyRecoveryDeadline,
  shouldWaitForWeeklyRecovery,
  takeNextQueuedQuestion,
} from "../src/utils/weeklyAssessment.js";
import { getWeeklyCertificateCategory } from "../src/services/weeklyAssessmentService.js";

test("Asia/Kolkata daily boundaries transition at local midnight", () => {
  const midnight = new Date("2024-01-07T18:30:00.000Z");
  const beforeMidnight = new Date(midnight.getTime() - 1000);
  const today = getWeeklyCycleBounds(midnight);
  const yesterday = getWeeklyCycleBounds(beforeMidnight);

  assert.equal(today.cycleKey, "2024-01-08");
  assert.equal(today.startAt.toISOString(), "2024-01-07T18:30:00.000Z");
  assert.equal(today.endAt.toISOString(), "2024-01-08T18:30:00.000Z");
  assert.equal(yesterday.cycleKey, "2024-01-07");
  assert.equal(getWeeklyDayIndex(beforeMidnight, today.startAt), -1);
  assert.equal(getWeeklyDayIndex(midnight, today.startAt), 0);
  assert.equal(
    getWeeklyDayIndex(new Date(today.endAt.getTime() - 1000), today.startAt),
    0,
  );
  assert.equal(getWeeklyDayIndex(today.endAt, today.startAt), -1);
});

test("global challenge cycles repeat every 24 hours from the configured Asia/Kolkata start time", () => {
  const startAt = new Date("2025-04-01T04:30:00.000Z");
  const beforeStart = new Date(startAt.getTime() - 1);
  const firstCycle = getRecurringCycleBounds(startAt, startAt);
  const secondCycle = getRecurringCycleBounds(
    startAt,
    new Date(startAt.getTime() + 24 * 60 * 60 * 1000),
  );

  assert.equal(getRecurringCycleBounds(startAt, beforeStart), null);
  assert.equal(firstCycle.cycleIndex, 0);
  assert.equal(firstCycle.cycleKey, "2025-04-01");
  assert.equal(firstCycle.startAt.toISOString(), "2025-04-01T04:30:00.000Z");
  assert.equal(firstCycle.endAt.toISOString(), "2025-04-02T04:30:00.000Z");
  assert.equal(secondCycle.cycleIndex, 1);
  assert.equal(secondCycle.cycleKey, "2025-04-02");
});

test("daily global challenge queue consumes questions once in FIFO order and never cycles", () => {
  const queue = ["first", "second", "third"];
  const firstDay = takeNextQueuedQuestion(queue);
  const secondDay = takeNextQueuedQuestion(firstDay.remainingQuestionIds);
  const thirdDay = takeNextQueuedQuestion(secondDay.remainingQuestionIds);
  const exhausted = takeNextQueuedQuestion(thirdDay.remainingQuestionIds);

  assert.deepEqual(firstDay, {
    questionId: "first",
    remainingQuestionIds: ["second", "third"],
  });
  assert.deepEqual(secondDay, {
    questionId: "second",
    remainingQuestionIds: ["third"],
  });
  assert.deepEqual(thirdDay, {
    questionId: "third",
    remainingQuestionIds: [],
  });
  assert.deepEqual(exhausted, { questionId: null, remainingQuestionIds: [] });
  assert.deepEqual(takeNextQueuedQuestion([]), {
    questionId: null,
    remainingQuestionIds: [],
  });
});

test("weekly recovery deadline is 24 hours after close and delays finalization only for recoverable submissions", () => {
  const endAt = new Date("2024-01-14T18:30:00.000Z");
  const recoveryUntilAt = getWeeklyRecoveryDeadline(endAt);
  assert.equal(recoveryUntilAt.toISOString(), "2024-01-15T18:30:00.000Z");
  assert.equal(shouldWaitForWeeklyRecovery({
    endAt,
    recoveryUntilAt,
    hasRecoverableSubmissions: true,
    now: new Date("2024-01-14T18:31:00.000Z"),
  }), true);
  assert.equal(shouldWaitForWeeklyRecovery({
    endAt,
    recoveryUntilAt,
    hasRecoverableSubmissions: false,
    now: new Date("2024-01-14T18:31:00.000Z"),
  }), false);
  assert.equal(shouldWaitForWeeklyRecovery({
    endAt,
    recoveryUntilAt,
    hasRecoverableSubmissions: true,
    now: recoveryUntilAt,
  }), false);
});

test("organization score uses the entire frozen eligible roster and k=5", () => {
  const roster = [];
  for (const [organizationId, organizationName, count] of [
    ["org-a", "A", 1],
    ["org-b", "B", 2],
    ["org-c", "C", 40],
  ]) {
    for (let index = 0; index < count; index += 1) {
      roster.push({
        candidateId: `${organizationId}-${index}`,
        candidateNameSnapshot: `Candidate ${index}`,
        organizationId,
        organizationNameSnapshot: organizationName,
        participationStatus: "PARTICIPATED",
        completedDays: [0],
        score: 20,
        lastSubmittedAt: new Date("2024-01-08T10:00:00.000Z"),
      });
    }
  }

  const results = calculateWeeklyRankings(roster);
  assert.equal(results.organizationRankings.length, 3);
  assert.deepEqual(
    results.organizationRankings.map(({ organizationMean }) => organizationMean),
    [20, 20, 20],
  );
  assert.deepEqual(
    results.organizationRankings.map(({ finalScore }) => finalScore),
    [20, 20, 20],
  );
  assert.ok(results.organizationRankings.every((ranking) => ranking.shrinkageK === 5));
});

test("missed and disqualified roster candidates remain zero-score denominator members", () => {
  const roster = [
    {
      candidateId: "participating",
      candidateNameSnapshot: "Candidate A",
      organizationId: "small",
      organizationNameSnapshot: "Small Org",
      participationStatus: "PARTICIPATED",
      completedDays: [0],
      score: 20,
      lastSubmittedAt: new Date("2024-01-08T10:00:00.000Z"),
    },
    {
      candidateId: "missed",
      candidateNameSnapshot: "Candidate B",
      organizationId: "small",
      organizationNameSnapshot: "Small Org",
      participationStatus: "NOT_STARTED",
      completedDays: [],
      score: 0,
      lastSubmittedAt: null,
    },
    {
      candidateId: "disqualified",
      candidateNameSnapshot: "Candidate C",
      organizationId: "large",
      organizationNameSnapshot: "Large Org",
      participationStatus: "DISQUALIFIED",
      completedDays: [0, 1],
      score: 180,
      lastSubmittedAt: new Date("2024-01-09T10:00:00.000Z"),
    },
  ];

  const results = calculateWeeklyRankings(roster);
  const smallOrganization = results.organizationRankings.find(
    (organization) => organization.organizationId === "small",
  );
  const largeOrganization = results.organizationRankings.find(
    (organization) => organization.organizationId === "large",
  );
  const disqualifiedCandidate = results.individualRankings.find(
    (candidate) => candidate.candidateId === "disqualified",
  );

  assert.equal(smallOrganization.eligibleCandidates, 2);
  assert.equal(smallOrganization.organizationMean, 10);
  assert.equal(smallOrganization.completedEligibleCandidates, 1);
  assert.equal(smallOrganization.participatingEligibleCandidates, 1);
  assert.equal(smallOrganization.completionRate, 50);
  assert.equal(largeOrganization.eligibleCandidates, 1);
  assert.equal(largeOrganization.organizationMean, 0);
  assert.equal(largeOrganization.completedEligibleCandidates, 0);
  assert.equal(largeOrganization.participatingEligibleCandidates, 0);
  assert.equal(disqualifiedCandidate.score, 0);
  assert.equal(disqualifiedCandidate.status, "DISQUALIFIED");
});

test("individual ranking tie-breaking is deterministic", () => {
  const candidates = [
    {
      candidateId: "z-candidate",
      candidateNameSnapshot: "Z",
      organizationId: "org",
      organizationNameSnapshot: "Org",
      participationStatus: "PARTICIPATED",
      completedDays: [0],
      score: 10,
      lastSubmittedAt: new Date("2024-01-08T10:00:00.000Z"),
    },
    {
      candidateId: "a-candidate",
      candidateNameSnapshot: "A",
      organizationId: "org",
      organizationNameSnapshot: "Org",
      participationStatus: "PARTICIPATED",
      completedDays: [0],
      score: 10,
      lastSubmittedAt: new Date("2024-01-08T10:00:00.000Z"),
    },
    {
      candidateId: "earlier",
      candidateNameSnapshot: "Earlier",
      organizationId: "org",
      organizationNameSnapshot: "Org",
      participationStatus: "PARTICIPATED",
      completedDays: [0],
      score: 10,
      lastSubmittedAt: new Date("2024-01-08T09:00:00.000Z"),
    },
  ];

  assert.deepEqual(
    calculateWeeklyRankings(candidates).individualRankings.map((candidate) => candidate.candidateId),
    ["earlier", "a-candidate", "z-candidate"],
  );
});

test("weekly certificate categories follow rank and participation policy", () => {
  assert.equal(getWeeklyCertificateCategory(1), "WINNER");
  assert.equal(getWeeklyCertificateCategory(2), "RUNNER_UP");
  assert.equal(getWeeklyCertificateCategory(3), "SECOND_RUNNER_UP");
  assert.equal(getWeeklyCertificateCategory(4), "PARTICIPATION");
  assert.equal(getWeeklyCertificateCategory(1, "ORGANIZATION"), "ORGANIZATION_WINNER");
  assert.equal(getWeeklyCertificateCategory(2, "ORGANIZATION"), "ORGANIZATION_RUNNER_UP");
  assert.equal(getWeeklyCertificateCategory(3, "ORGANIZATION"), "ORGANIZATION_SECOND_RUNNER_UP");
  assert.equal(getWeeklyCertificateCategory(4, "ORGANIZATION"), null);
});

test("weekly admin APIs require Super Admin authorization", () => {
  const route = weeklyAssessmentRoutes.stack.find(
    (layer) => layer.route?.path === "/admin/cycles",
  );
  assert.ok(route);
  assert.equal(route.route.methods.post, true);
  assert.equal(route.route.stack[0].name, "authenticate");
  let responseStatus;
  let passedThrough = false;
  route.route.stack[1].handle(
    { user: { role: "USER", creatorType: null } },
    {
      status(status) {
        responseStatus = status;
        return this;
      },
      json() {
        return this;
      },
    },
    () => { passedThrough = true; },
  );
  assert.equal(responseStatus, 403);
  assert.equal(passedThrough, false);
});

test("global challenge setup APIs require Super Admin authorization", () => {
  for (const [path, method] of [
    ["/admin/global-challenge", "get"],
    ["/admin/global-challenge", "put"],
  ]) {
    const route = weeklyAssessmentRoutes.stack.find(
      (layer) => layer.route?.path === path && layer.route.methods[method],
    );
    assert.ok(route, `missing ${method.toUpperCase()} ${path} route`);
    assert.equal(route.route.stack[0].name, "authenticate");
    let responseStatus;
    let passedThrough = false;
    route.route.stack[1].handle(
      { user: { role: "USER", creatorType: null } },
      {
        status(status) {
          responseStatus = status;
          return this;
        },
        json() {
          return this;
        },
      },
      () => { passedThrough = true; },
    );
    assert.equal(responseStatus, 403);
    assert.equal(passedThrough, false);
  }
});

test("daily submission and roster APIs allow any authenticated account", () => {
  for (const path of ["/current", "/submit", "/retry/:submissionId", "/recoverable", "/history"]) {
    const route = weeklyAssessmentRoutes.stack.find(
      (layer) => layer.route?.path === path,
    );
    assert.ok(route, `missing route ${path}`);
    assert.equal(route.route.stack[0].name, "authenticate");
    assert.equal(route.route.stack.length, 2);
    assert.notEqual(route.route.stack[1].name, "requireAssessmentRole");
  }
});

test("Desktop local Daily Challenge endpoints require authentication and execution rate limiting", () => {
  for (const path of ["/desktop-grant", "/desktop-finalize"]) {
    const route = weeklyAssessmentRoutes.stack.find(
      (layer) => layer.route?.path === path,
    );
    assert.ok(route, `missing route ${path}`);
    assert.equal(route.route.stack[0].name, "authenticate");
    assert.equal(route.route.stack.length, 3);
    assert.notEqual(route.route.stack[1].name, "requireAssessmentRole");
  }
});
