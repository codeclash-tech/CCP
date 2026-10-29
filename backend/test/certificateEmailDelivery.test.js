import assert from "node:assert/strict";
import test from "node:test";
import BattleRoomSubmission from "../src/models/BattleRoomSubmission.js";
import User from "../src/models/User.js";
import WeeklyCertificate from "../src/models/WeeklyCertificate.js";
import WeeklyCycle from "../src/models/WeeklyCycle.js";
import WeeklySubmission from "../src/models/WeeklySubmission.js";
import {
  dispatchBattleRoomCompletionEmails,
  dispatchWeeklyCompletionEmail,
  dispatchWeeklyRankingCertificates,
} from "../src/services/completionNotificationService.js";

function queryResult(value) {
  return {
    select() {
      return this;
    },
    lean: async () => value,
  };
}

async function withEmailConfig(run) {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  const requests = [];
  globalThis.fetch = async (_url, request) => {
    requests.push(JSON.parse(request.body));
    return new Response(JSON.stringify({ id: `certificate-${requests.length}` }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  process.env.RESEND_API_KEY = "unit-test-key";
  process.env.EMAIL_FROM = "CodeClash <no-reply@example.com>";
  try {
    return await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  }
}

test("daily completion email attaches its participation certificate PDF", async () => {
  const originals = {
    submissionUpdateOne: WeeklySubmission.updateOne,
    submissionFindOneAndUpdate: WeeklySubmission.findOneAndUpdate,
    userFindById: User.findById,
    cycleFindById: WeeklyCycle.findById,
    certificateFindOne: WeeklyCertificate.findOne,
  };
  const certificate = {
    certificateId: "DLY-20261029-I-1",
    snapshot: {
      subjectName: "Daily Participant",
      assessmentName: "Daily Challenge",
      score: 82.5,
      issuedAt: new Date("2026-10-29T10:00:00.000Z"),
    },
  };
  WeeklySubmission.updateOne = async () => ({ matchedCount: 1 });
  WeeklySubmission.findOneAndUpdate = () => queryResult({
    _id: "submission-id",
    candidateId: "candidate-id",
    cycleId: "cycle-id",
  });
  User.findById = () => queryResult({
    name: "Daily Participant",
    email: "participant@example.com",
  });
  WeeklyCycle.findById = () => queryResult({ name: "Daily Challenge" });
  WeeklyCertificate.findOne = () => queryResult(certificate);

  try {
    await withEmailConfig(async (requests) => {
      assert.equal(await dispatchWeeklyCompletionEmail("submission-id"), true);
      assert.equal(requests.length, 1);
      assert.match(requests[0].subject, /Daily Challenge completed/);
      assert.equal(requests[0].attachments[0].filename, "DLY-20261029-I-1.pdf");
      assert.equal(
        Buffer.from(requests[0].attachments[0].content, "base64")
          .subarray(0, 5)
          .toString(),
        "%PDF-",
      );
    });
  } finally {
    WeeklySubmission.updateOne = originals.submissionUpdateOne;
    WeeklySubmission.findOneAndUpdate = originals.submissionFindOneAndUpdate;
    User.findById = originals.userFindById;
    WeeklyCycle.findById = originals.cycleFindById;
    WeeklyCertificate.findOne = originals.certificateFindOne;
  }
});

test("battle-room certificates are emailed only from finalized room snapshots", async () => {
  const originalFind = BattleRoomSubmission.find;
  const originalUpdateOne = BattleRoomSubmission.updateOne;
  const originalFindOneAndUpdate = BattleRoomSubmission.findOneAndUpdate;
  const originalUserFindById = User.findById;
  const submissions = [
    {
      _id: "first-submission",
      userId: "first-user",
      participantName: "First Participant",
      certificateSnapshot: {
        roomCode: "ROOM1",
        roomTitle: "Algorithms Room",
        rank: 1,
        totalParticipants: 2,
        completedAt: new Date("2026-10-29T10:00:00.000Z"),
      },
    },
    {
      _id: "second-submission",
      userId: "second-user",
      participantName: "Second Participant",
      certificateSnapshot: {
        roomCode: "ROOM1",
        roomTitle: "Algorithms Room",
        rank: 2,
        totalParticipants: 2,
        completedAt: new Date("2026-10-29T10:01:00.000Z"),
      },
    },
  ];
  BattleRoomSubmission.find = (filter) => {
    assert.deepEqual(filter, {
      roomId: "room-id",
      status: "COMPLETED",
      "certificateSnapshot.completedAt": { $ne: null },
    });
    return queryResult(submissions.map(({ _id }) => ({ _id })));
  };
  BattleRoomSubmission.updateOne = async () => ({ matchedCount: 1 });
  BattleRoomSubmission.findOneAndUpdate = (filter) => queryResult(
    submissions.find(({ _id }) => _id === filter._id),
  );
  User.findById = (userId) => queryResult({
    name: userId,
    email: `${userId}@example.com`,
  });

  try {
    await withEmailConfig(async (requests) => {
      const delivery = await dispatchBattleRoomCompletionEmails("room-id");
      assert.deepEqual(delivery, {
        emailsSent: 2,
        emailFailures: 0,
        totalParticipants: 2,
      });
      assert.equal(requests.length, 2);
      for (const request of requests) {
        assert.match(request.subject, /Battle Room completed/);
        assert.match(request.attachments[0].filename, /room1-certificate\.pdf$/);
        assert.equal(
          Buffer.from(request.attachments[0].content, "base64")
            .subarray(0, 5)
            .toString(),
          "%PDF-",
        );
      }
    });
  } finally {
    BattleRoomSubmission.find = originalFind;
    BattleRoomSubmission.updateOne = originalUpdateOne;
    BattleRoomSubmission.findOneAndUpdate = originalFindOneAndUpdate;
    User.findById = originalUserFindById;
  }
});

test("daily top-three certificates are emailed after cycle finalization", async () => {
  const originals = {
    certificateFind: WeeklyCertificate.find,
    certificateUpdateOne: WeeklyCertificate.updateOne,
    certificateFindOneAndUpdate: WeeklyCertificate.findOneAndUpdate,
    userFindById: User.findById,
    cycleFindById: WeeklyCycle.findById,
  };
  const certificate = {
    _id: "certificate-id",
    certificateId: "DLY-20261029-I-RANK1",
    userId: "candidate-id",
    cycleId: "cycle-id",
    category: "WINNER",
    snapshot: {
      subjectName: "Ranked Participant",
      assessmentName: "Daily Challenge",
      score: 100,
      rank: 1,
      issuedAt: new Date("2026-10-30T00:00:00.000Z"),
    },
  };
  WeeklyCertificate.find = () => queryResult([{ _id: certificate._id }]);
  WeeklyCertificate.updateOne = async () => ({ matchedCount: 1 });
  WeeklyCertificate.findOneAndUpdate = () => queryResult(certificate);
  User.findById = () => queryResult({
    name: "Ranked Participant",
    email: "ranked@example.com",
  });
  WeeklyCycle.findById = () => queryResult({
    name: "Daily Challenge",
    status: "FINALIZED",
    individualRankings: [
      { status: "PARTICIPATED" },
      { status: "PARTICIPATED" },
      { status: "MISSED" },
    ],
  });

  try {
    await withEmailConfig(async (requests) => {
      const results = await dispatchWeeklyRankingCertificates("cycle-id");
      assert.deepEqual(results, [true]);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].subject, "Your Daily Challenge Rank #1 Certificate");
      assert.equal(requests[0].attachments[0].filename, "DLY-20261029-I-RANK1.pdf");
      assert.equal(
        Buffer.from(requests[0].attachments[0].content, "base64")
          .subarray(0, 5)
          .toString(),
        "%PDF-",
      );
    });
  } finally {
    WeeklyCertificate.find = originals.certificateFind;
    WeeklyCertificate.updateOne = originals.certificateUpdateOne;
    WeeklyCertificate.findOneAndUpdate = originals.certificateFindOneAndUpdate;
    User.findById = originals.userFindById;
    WeeklyCycle.findById = originals.cycleFindById;
  }
});
