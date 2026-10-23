import assert from "node:assert/strict";
import test from "node:test";
import {
  RANKED_SUBMISSION_STATUSES,
  getRoomSubmissionTime,
  sortRoomSubmissions,
} from "../src/services/battleRoomRanking.js";

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
