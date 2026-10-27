import assert from "node:assert/strict";
import test from "node:test";
import {
  RANKED_SUBMISSION_STATUSES,
  getRoomRank,
  getRoomSubmissionTime,
  sortRoomSubmissions,
} from "../src/services/battleRoomRanking.js";
import {
  calculateQuestionScore,
  isBattleRoomCertificateEligible,
  isBattleRoomRankedEligible,
} from "../src/services/battleRoomScoring.js";

test("calculates total room submission time", () => {
  assert.equal(
    getRoomSubmissionTime({
      questionResults: [{ timeToSolve: 12 }, { timeToSolve: 18 }],
    }),
    30,
  );
});

test("uses leaderboard tie-breakers when ranking room submissions", () => {
  const submissions = [
    {
      participantName: "Slow",
      totalScore: 80,
      totalPassed: 8,
      totalFailed: 2,
      questionResults: [{ timeToSolve: 100 }],
    },
    {
      participantName: "Fast",
      totalScore: 80,
      totalPassed: 8,
      totalFailed: 2,
      questionResults: [{ timeToSolve: 50 }],
    },
    {
      participantName: "Higher pass count",
      totalScore: 80,
      totalPassed: 9,
      totalFailed: 2,
      questionResults: [{ timeToSolve: 200 }],
    },
    {
      participantName: "Higher score",
      totalScore: 90,
      totalPassed: 1,
      totalFailed: 9,
      questionResults: [{ timeToSolve: 300 }],
    },
  ];

  assert.deepEqual(
    sortRoomSubmissions(submissions).map(({ participantName }) => participantName),
    ["Higher score", "Higher pass count", "Fast", "Slow"],
  );
  assert.deepEqual(RANKED_SUBMISSION_STATUSES, [
    "COMPLETED",
    "DISQUALIFIED",
  ]);
});

test("battle scores award points by passed-test percentage and tie equal results", () => {
  assert.equal(calculateQuestionScore(100, 2, 5), 40);
  const submissions = sortRoomSubmissions([
    {
      participantName: "Same result B",
      totalScore: 40,
      totalPassed: 2,
      totalFailed: 3,
      questionResults: [{ executionTime: 50, memoryUsed: 20 }],
    },
    {
      participantName: "Same result A",
      totalScore: 40,
      totalPassed: 2,
      totalFailed: 3,
      questionResults: [{ executionTime: 50, memoryUsed: 20 }],
    },
  ]);
  assert.deepEqual(
    submissions.map((submission, index) => getRoomRank(submissions, index)),
    [1, 1],
  );
});

test("battle certificates require complete execution and at least one passing case", () => {
  const result = { status: "COMPLETED", totalPassed: 1, totalFailed: 4 };
  assert.equal(isBattleRoomCertificateEligible(result, 5), true);
  assert.equal(isBattleRoomRankedEligible(result, 5), true);
  assert.equal(
    isBattleRoomCertificateEligible({ ...result, totalPassed: 0 }, 5),
    false,
  );
  assert.equal(isBattleRoomCertificateEligible(result, 6), false);
  assert.equal(
    isBattleRoomCertificateEligible({ ...result, status: "DISQUALIFIED" }, 5),
    false,
  );
  assert.equal(
    isBattleRoomRankedEligible({ ...result, totalPassed: 5, totalFailed: 0 }, 5),
    true,
  );
  assert.equal(
    isBattleRoomRankedEligible({ ...result, totalPassed: 5, totalFailed: 1 }, 5),
    false,
  );
  assert.equal(
    isBattleRoomCertificateEligible({ ...result, totalPassed: 2, totalFailed: 4 }, 5),
    false,
  );
  assert.equal(
    isBattleRoomCertificateEligible({ ...result, totalPassed: -1, totalFailed: 6 }, 5),
    false,
  );
});
