import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Challenge from "../src/models/Challenge.js";
import GlobalChallenge from "../src/models/GlobalChallenge.js";
import weeklyAssessmentRoutes from "../src/routes/weeklyAssessmentRoutes.js";
import {
  calculateWeeklyRankings,
  getWeeklyCycleBounds,
  getRecurringCycleBounds,
  getWeeklyDayIndex,
  getWeeklyRecoveryDeadline,
  isWeeklyParticipationEligible,
  isWeeklyRankedEligible,
  summarizeWeeklySubmissions,
  shouldWaitForWeeklyRecovery,
  takeNextQueuedQuestion,
} from "../src/utils/weeklyAssessment.js";
import {
  getWeeklyCertificateCategory,
  publishGlobalChallengeConfiguration,
  resolveDailyQuestion,
  reserveQuestionForCycle,
  saveGlobalChallengeConfiguration,
} from "../src/services/weeklyAssessmentService.js";

test("weekly eligibility separates participation from ranking and requires finalized results", () => {
  const base = {
    participationStatus: "PARTICIPATED",
    resultFinalizedAt: new Date("2026-10-25T10:00:00.000Z"),
    totalTestCases: 5,
  };

  assert.equal(isWeeklyParticipationEligible({ ...base, passedTestCases: 0 }), false);
  assert.equal(isWeeklyRankedEligible({ ...base, passedTestCases: 0 }), false);
  assert.equal(
    isWeeklyParticipationEligible({ ...base, passedTestCases: 6 }),
    false,
  );
  assert.equal(
    isWeeklyParticipationEligible({ ...base, totalTestCases: 0, passedTestCases: 1 }),
    false,
  );
  assert.equal(isWeeklyParticipationEligible({ ...base, passedTestCases: 1 }), true);
  assert.equal(isWeeklyRankedEligible({ ...base, passedTestCases: 1 }), false);
  assert.equal(isWeeklyRankedEligible({ ...base, passedTestCases: 5 }), true);
  assert.equal(
    isWeeklyParticipationEligible({
      ...base,
      passedTestCases: 5,
      participationStatus: "DISQUALIFIED",
    }),
    false,
  );
  assert.equal(
    isWeeklyParticipationEligible({ ...base, passedTestCases: 5, resultFinalizedAt: null }),
    false,
  );
});

test("live roster summary synchronizes test counts and finalization for ranking eligibility", () => {
  const finalizedAt = new Date("2026-10-25T10:00:00.000Z");
  const summary = summarizeWeeklySubmissions([
    {
      dayIndex: 0,
      score: 100,
      passed: 7,
      total: 7,
      finalizedAt,
    },
  ]);
  const rosterEntry = {
    ...summary,
    participationStatus: summary.participationStatus,
  };

  assert.deepEqual(summary, {
    score: 100,
    passedTestCases: 7,
    totalTestCases: 7,
    completedDays: [0],
    resultFinalizedAt: finalizedAt,
    participationStatus: "PARTICIPATED",
  });
  assert.equal(isWeeklyRankedEligible(rosterEntry), true);
});

function populatedQuery(value) {
  return {
    populate() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}

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

test("participant question resolution returns one test case list from legacy snapshots", () => {
  const question = resolveDailyQuestion({
    challengeId: "507f1f77bcf86cd799439011",
    questionSnapshot: {
      title: "Two Sum",
      description: "Return indices of two values that sum to the target.",
      difficulty: "EASY",
      category: "Arrays",
      constraints: "2 <= nums.length <= 10^4",
      examples: [{ input: "[2,7], 9", output: "[0,1]" }],
      starterCodes: { java: "class Solution {}" },
      visibleTestCases: [{ input: "2 7 9", expectedOutput: "0 1" }],
      hiddenTestCases: [{ input: "hidden", expectedOutput: "hidden" }],
    },
  });

  assert.equal(question.id, "507f1f77bcf86cd799439011");
  assert.equal(question.title, "Two Sum");
  assert.match(question.description, /two values/);
  assert.equal(question.constraints, "2 <= nums.length <= 10^4");
  assert.equal(question.examples.length, 1);
  assert.equal(question.starterCodes.java, "class Solution {}");
  assert.deepEqual(
    question.testCases.map((testCase) => testCase.input),
    ["2 7 9", "hidden"],
  );
  assert.equal("visibleTestCases" in question, false);
  assert.equal("hiddenTestCases" in question, false);
});

test("participant question resolution rejects missing or incomplete cycle snapshots", () => {
  assert.throws(
    () => resolveDailyQuestion({ challengeId: "question-id" }),
    /snapshot is unavailable/,
  );
  assert.throws(
    () => resolveDailyQuestion({
      challengeId: "question-id",
      questionSnapshot: { title: "Question without body" },
    }),
    /snapshot is incomplete/,
  );
});

test("saving a published queue updates upcoming questions without changing today's assignment", async (t) => {
  const activeQuestionId = new mongoose.Types.ObjectId();
  const upcomingQuestionId = new mongoose.Types.ObjectId();
  const startAt = new Date(Date.now() - 60 * 60 * 1000);
  const existing = {
    name: "Published Challenge",
    startAt,
    questionIds: [],
    activeQuestionId,
    lastScheduledCycleKey: "2026-10-25",
  };
  t.mock.method(GlobalChallenge, "findOne", async () => existing);
  t.mock.method(Challenge, "find", () => ({
    select: async () => [{ _id: upcomingQuestionId }],
  }));
  let filter;
  let update;
  t.mock.method(GlobalChallenge, "findOneAndUpdate", (query, changes) => {
    filter = query;
    update = changes;
    return populatedQuery(existing);
  });

  await saveGlobalChallengeConfiguration({
    name: "Edited Challenge",
    startAt: startAt.toISOString(),
    questionIds: [String(upcomingQuestionId)],
  });

  assert.equal(filter.lastScheduledCycleKey, existing.lastScheduledCycleKey);
  assert.equal(String(filter.activeQuestionId), String(activeQuestionId));
  assert.deepEqual(filter.questionIds, []);
  assert.deepEqual(update.$set.questionIds, [String(upcomingQuestionId)]);
  assert.equal(update.$set.status, "ACTIVE");
  assert.deepEqual(update.$unset, { draft: "" });
  assert.equal("activeQuestionId" in update.$set, false);
});

test("publishing a draft updates only future rotation while retaining the active cycle lock", async (t) => {
  const activeQuestionId = new mongoose.Types.ObjectId();
  const upcomingQuestionId = new mongoose.Types.ObjectId();
  const startAt = new Date(Date.now() - 60 * 60 * 1000);
  const existing = {
    name: "Published Challenge",
    startAt,
    questionIds: [],
    activeQuestionId,
    lastScheduledCycleKey: "2026-10-25",
    draft: {
      name: "Edited Challenge",
      startAt,
      questionIds: [upcomingQuestionId],
      updatedAt: new Date(),
    },
  };
  t.mock.method(GlobalChallenge, "findOne", async () => existing);
  t.mock.method(Challenge, "find", () => ({
    select: async () => [{ _id: upcomingQuestionId }],
  }));
  let filter;
  let update;
  t.mock.method(GlobalChallenge, "findOneAndUpdate", (query, changes) => {
    filter = query;
    update = changes;
    return populatedQuery({ ...existing, ...changes.$set });
  });

  await publishGlobalChallengeConfiguration();

  assert.equal(filter["draft.updatedAt"], existing.draft.updatedAt);
  assert.equal(filter.lastScheduledCycleKey, existing.lastScheduledCycleKey);
  assert.equal(String(filter.activeQuestionId), String(activeQuestionId));
  assert.deepEqual(update.$set.questionIds, [String(upcomingQuestionId)]);
  assert.equal(update.$set.status, "ACTIVE");
  assert.deepEqual(update.$unset, { draft: "" });
  assert.equal("activeQuestionId" in update.$set, false);
  assert.equal(existing.activeQuestionId, activeQuestionId);
});

test("a newly published question can fill today's previously empty queue reservation", async (t) => {
  const questionId = new mongoose.Types.ObjectId();
  const cycleKey = "2026-10-25";
  const bounds = { cycleKey };
  let reservationFilter;
  let reserved = false;

  t.mock.method(GlobalChallenge, "findOne", (query) => ({
    select() {
      return {
        lean: async () => query.lastScheduledCycleKey === cycleKey
          ? { activeQuestionId: null }
          : null,
      };
    },
  }));
  t.mock.method(GlobalChallenge, "findOneAndUpdate", (query) => {
    reservationFilter = query;
    return {
      select() {
        return {
          lean: async () => {
            reserved = true;
            return { activeQuestionId: questionId };
          },
        };
      },
    };
  });

  const selectedQuestion = await reserveQuestionForCycle(
    { questionIds: [questionId] },
    bounds,
  );

  assert.equal(String(selectedQuestion), String(questionId));
  assert.equal(reserved, true);
  assert.ok(
    reservationFilter.$or.some(
      (condition) =>
        condition.lastScheduledCycleKey === cycleKey &&
        condition.activeQuestionId === null,
    ),
  );
  assert.deepEqual(reservationFilter.questionIds, [questionId]);
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

test("organization score uses completed participants and k=5", () => {
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
        passedTestCases: 4,
        totalTestCases: 4,
        resultFinalizedAt: new Date("2024-01-08T10:00:00.000Z"),
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

test("incomplete and disqualified candidates do not appear in individual or organization rankings", () => {
  const roster = [
    {
      candidateId: "participating",
      candidateNameSnapshot: "Candidate A",
      organizationId: "small",
      organizationNameSnapshot: "Small Org",
      participationStatus: "PARTICIPATED",
      completedDays: [0],
      passedTestCases: 4,
      totalTestCases: 4,
      resultFinalizedAt: new Date("2024-01-08T10:00:00.000Z"),
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
      passedTestCases: 10,
      totalTestCases: 10,
      resultFinalizedAt: new Date("2024-01-09T10:00:00.000Z"),
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

  assert.equal(results.individualRankings.length, 1);
  assert.equal(results.individualRankings[0].candidateId, "participating");
  assert.equal(results.individualRankings[0].rank, 1);
  assert.equal(smallOrganization.eligibleCandidates, 1);
  assert.equal(smallOrganization.organizationMean, 20);
  assert.equal(smallOrganization.completedEligibleCandidates, 1);
  assert.equal(smallOrganization.participatingEligibleCandidates, 1);
  assert.equal(smallOrganization.completionRate, 100);
  assert.equal(largeOrganization, undefined);
});

test("daily leaderboards start empty until an eligible participant completes a question", () => {
  const results = calculateWeeklyRankings([
    {
      candidateId: "incomplete",
      candidateNameSnapshot: "Candidate A",
      organizationId: "org",
      organizationNameSnapshot: "Org",
      participationStatus: "NOT_STARTED",
      completedDays: [],
      score: 0,
    },
    {
      candidateId: "disqualified",
      candidateNameSnapshot: "Candidate B",
      organizationId: "another-org",
      organizationNameSnapshot: "Another Org",
      participationStatus: "DISQUALIFIED",
      completedDays: [0],
      score: 100,
    },
  ]);

  assert.deepEqual(results.individualRankings, []);
  assert.deepEqual(results.organizationRankings, []);
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
      passedTestCases: 4,
      totalTestCases: 4,
      resultFinalizedAt: new Date("2024-01-08T10:00:00.000Z"),
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
      passedTestCases: 4,
      totalTestCases: 4,
      resultFinalizedAt: new Date("2024-01-08T10:00:00.000Z"),
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
      passedTestCases: 4,
      totalTestCases: 4,
      resultFinalizedAt: new Date("2024-01-08T09:00:00.000Z"),
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
    ["/admin/global-challenge/publish", "post"],
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
