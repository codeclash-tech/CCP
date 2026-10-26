import assert from "node:assert/strict";
import test from "node:test";
import BattleRoomSubmission from "../src/models/BattleRoomSubmission.js";
import { refreshBattleRoomCertificateSnapshots } from "../src/services/battleRoomCertificateSnapshotService.js";

test("completed eligible submissions receive current certificate snapshots and ranks", async () => {
  const originalFind = BattleRoomSubmission.find;
  const originalUpdateOne = BattleRoomSubmission.updateOne;
  const submissions = [
    {
      _id: "fully-solved",
      status: "COMPLETED",
      totalScore: 100,
      totalPassed: 2,
      totalFailed: 0,
      questionResults: [{ timeToSolve: 10 }],
      submittedAt: new Date("2026-10-26T06:00:00.000Z"),
    },
    {
      _id: "partially-solved",
      status: "COMPLETED",
      totalScore: 50,
      totalPassed: 1,
      totalFailed: 1,
      questionResults: [{ timeToSolve: 20 }],
      submittedAt: new Date("2026-10-26T06:01:00.000Z"),
    },
    {
      _id: "no-passing-cases",
      status: "COMPLETED",
      totalScore: 0,
      totalPassed: 0,
      totalFailed: 2,
      questionResults: [{ timeToSolve: 30 }],
      submittedAt: new Date("2026-10-26T06:02:00.000Z"),
    },
  ];
  const updates = new Map();
  BattleRoomSubmission.find = () => ({
    lean: async () => submissions,
  });
  BattleRoomSubmission.updateOne = async (filter, update) => {
    updates.set(String(filter._id), update.$set.certificateSnapshot);
    return { matchedCount: 1 };
  };

  try {
    const count = await refreshBattleRoomCertificateSnapshots({
      _id: "room-id",
      roomCode: "ABC123",
      title: "Sample Battle",
      questions: [{ testCases: [{}, {}] }],
    });

    assert.equal(count, submissions.length);
    assert.deepEqual(updates.get("fully-solved"), {
      roomCode: "ABC123",
      roomTitle: "Sample Battle",
      rank: 1,
      totalParticipants: 1,
      totalTestCases: 2,
      completedAt: submissions[0].submittedAt,
    });
    assert.deepEqual(updates.get("partially-solved"), {
      roomCode: "ABC123",
      roomTitle: "Sample Battle",
      rank: null,
      totalParticipants: 1,
      totalTestCases: 2,
      completedAt: submissions[1].submittedAt,
    });
    assert.equal(updates.get("no-passing-cases"), null);
  } finally {
    BattleRoomSubmission.find = originalFind;
    BattleRoomSubmission.updateOne = originalUpdateOne;
  }
});
