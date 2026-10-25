import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import BattleRoomSubmission from "../src/models/BattleRoomSubmission.js";
import { streamBattleRoomCertificateData } from "../src/services/battleRoomCertificateService.js";
import {
  listParticipantBattleRoomCertificates,
  toParticipantCertificate,
} from "../src/controllers/battleRoomCertificateController.js";
import battleRoomRoutes from "../src/routes/battleRoomRoutes.js";

test("certificate library returns only the authenticated user's completed certificate metadata", async () => {
  const originalFind = BattleRoomSubmission.find;
  const completedAt = new Date("2026-10-19T12:00:00.000Z");
  const submission = {
    _id: "507f1f77bcf86cd799439011",
    totalScore: 85,
    totalPassed: 12,
    totalFailed: 0,
    status: "COMPLETED",
    participantName: "Candidate Name",
    questionResults: [{ code: "private source" }],
    certificateSnapshot: {
      roomCode: "room-123",
      roomTitle: "Secure Assessment",
      rank: 2,
      totalParticipants: 8,
      totalTestCases: 12,
      completedAt,
    },
  };
  const ineligibleSubmissions = [
    {
      ...submission,
      _id: "partial-result",
      totalPassed: 1,
      totalFailed: 3,
      certificateSnapshot: {
        ...submission.certificateSnapshot,
        totalTestCases: 5,
      },
    },
    {
      ...submission,
      _id: "zero-pass-result",
      totalPassed: 0,
      totalFailed: 12,
    },
  ];
  let filter;
  let selectedFields;
  let sort;

  BattleRoomSubmission.find = (query) => {
    filter = query;
    const chain = {
      select(fields) {
        selectedFields = fields;
        return chain;
      },
      sort(order) {
        sort = order;
        return chain;
      },
      async lean() {
        return [submission, ...ineligibleSubmissions];
      },
    };
    return chain;
  };

  try {
    let responseBody;
    const req = { userId: "authenticated-candidate-id" };
    const res = {
      json(body) {
        responseBody = body;
        return res;
      },
    };

    await listParticipantBattleRoomCertificates(req, res);

    assert.deepEqual(filter, {
      userId: "authenticated-candidate-id",
      status: "COMPLETED",
      "certificateSnapshot.roomCode": { $exists: true, $nin: ["", null] },
      "certificateSnapshot.completedAt": { $ne: null },
    });
    assert.equal(
      selectedFields,
      "_id certificateSnapshot totalScore totalPassed totalFailed status",
    );
    assert.deepEqual(sort, { "certificateSnapshot.completedAt": -1 });
    assert.deepEqual(responseBody, {
      certificates: [
        {
          certificateId: "BR-507F1F77BCF86CD799439011",
          roomCode: "ROOM-123",
          roomTitle: "Secure Assessment",
          rank: 2,
          totalParticipants: 8,
          totalScore: 85,
          completedAt,
          downloadPath: "/battle-rooms/ROOM-123/certificate",
        },
      ],
    });
    assert.equal(
      Object.hasOwn(responseBody.certificates[0], "questionResults"),
      false,
    );
  } finally {
    BattleRoomSubmission.find = originalFind;
  }
});

test("certificate metadata builds the download route from the persisted room code", () => {
  assert.equal(
    toParticipantCertificate({
      _id: "record",
      totalScore: 0,
      certificateSnapshot: {
        roomCode: "Room Code",
        roomTitle: "Assessment",
        rank: 1,
        totalParticipants: 1,
        completedAt: null,
      },
    }).downloadPath,
    "/battle-rooms/ROOM%20CODE/certificate",
  );
});

test("certificate library route requires authentication before listing records", () => {
  const layer = battleRoomRoutes.stack.find(
    (routeLayer) => routeLayer.route?.path === "/certificates/mine",
  );

  assert.ok(layer, "certificate library route should be registered");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].name, "authenticate");
});

test("certificate download generates a PDF with server-issued certificate metadata", async () => {
  const response = new PassThrough();
  const headers = {};
  const chunks = [];
  response.setHeader = (name, value) => {
    headers[name] = value;
  };
  response.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    response.once("end", resolve);
    response.once("error", reject);
  });

  streamBattleRoomCertificateData(
    {
      certificateId: "BR-507F1F77BCF86CD799439011",
      participantName: "Candidate Name",
      roomTitle: "Assessment",
      roomCode: "ROOM-123",
      rank: 1,
      totalParticipants: 1,
      totalScore: 100,
      completedAt: new Date("2026-10-19T12:00:00.000Z"),
    },
    response,
  );
  await completed;

  const pdf = Buffer.concat(chunks);
  assert.match(headers["Content-Type"], /^application\/pdf/);
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});
