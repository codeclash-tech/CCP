import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import BattleRoom from "../src/models/BattleRoom.js";
import BattleRoomSubmission from "../src/models/BattleRoomSubmission.js";
import { streamBattleRoomCertificateData } from "../src/services/battleRoomCertificateService.js";
import {
  listParticipantBattleRoomCertificates,
  downloadParticipantBattleRoomCertificate,
  deleteParticipantBattleRoomCertificate,
  toParticipantCertificate,
} from "../src/controllers/battleRoomCertificateController.js";
import battleRoomRoutes from "../src/routes/battleRoomRoutes.js";

test("certificate library returns only the authenticated user's completed certificate metadata", async () => {
  const originalFind = BattleRoomSubmission.find;
  const originalRoomFind = BattleRoom.find;
  const completedAt = new Date("2026-10-19T12:00:00.000Z");
  const submission = {
    _id: "507f1f77bcf86cd799439011",
    totalScore: 85,
    totalPassed: 12,
    totalFailed: 0,
    status: "COMPLETED",
    roomId: "room-id",
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
  BattleRoom.find = (query) => {
    assert.deepEqual(query, {
      _id: { $in: ["room-id", "room-id", "room-id"] },
      status: "CLOSED",
    });
    return {
      select() {
        return this;
      },
      lean: async () => [{ _id: "room-id" }],
    };
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
      "_id roomId certificateSnapshot totalScore totalPassed totalFailed status",
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
          deletePath: "/battle-rooms/ROOM-123/certificate",
        },
      ],
    });
    assert.equal(
      Object.hasOwn(responseBody.certificates[0], "questionResults"),
      false,
    );
  } finally {
    BattleRoomSubmission.find = originalFind;
    BattleRoom.find = originalRoomFind;
  }
});

test("certificate library hides snapshots until their battle room is closed", async () => {
  const originalFind = BattleRoomSubmission.find;
  const originalRoomFind = BattleRoom.find;
  BattleRoomSubmission.find = () => ({
    select() {
      return this;
    },
    sort() {
      return this;
    },
    lean: async () => [{
      _id: "submission-id",
      roomId: "open-room",
      status: "COMPLETED",
      totalPassed: 2,
      totalFailed: 0,
      certificateSnapshot: {
        roomCode: "OPEN-ROOM",
        roomTitle: "Open Battle",
        rank: 1,
        totalParticipants: 1,
        totalTestCases: 2,
        completedAt: new Date(),
      },
    }],
  });
  BattleRoom.find = () => ({
    select() {
      return this;
    },
    lean: async () => [],
  });

  try {
    let responseBody;
    await listParticipantBattleRoomCertificates(
      { userId: "candidate-id" },
      {
        json(body) {
          responseBody = body;
          return this;
        },
      },
    );
    assert.deepEqual(responseBody, { certificates: [] });
  } finally {
    BattleRoomSubmission.find = originalFind;
    BattleRoom.find = originalRoomFind;
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

test("battle certificate deletion route requires authentication", () => {
  const layer = battleRoomRoutes.stack.find(
    (routeLayer) =>
      routeLayer.route?.path === "/:roomCode/certificate" &&
      routeLayer.route.methods.delete,
  );

  assert.ok(layer, "certificate deletion route should be registered");
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

test("battle certificate download is gated on room closure and preserves the certificate", async () => {
  const originalSubmissionFindOne = BattleRoomSubmission.findOne;
  const originalSubmissionUpdateOne = BattleRoomSubmission.updateOne;
  const originalRoomFindOne = BattleRoom.findOne;
  const submission = {
    _id: "submission-id",
    roomId: "room-id",
    totalScore: 40,
    totalPassed: 2,
    totalFailed: 3,
    status: "COMPLETED",
    participantName: "Candidate",
    certificateSnapshot: {
      roomCode: "ROOM-1",
      roomTitle: "Daily Battle",
      rank: 2,
      totalParticipants: 4,
      totalTestCases: 5,
      completedAt: new Date("2026-10-25T10:00:00.000Z"),
    },
  };
  let roomFilter;
  let deletion;
  BattleRoomSubmission.findOne = () => ({ lean: async () => submission });
  BattleRoomSubmission.updateOne = async (filter, update) => {
    deletion = { filter, update };
    return { matchedCount: 1 };
  };
  BattleRoom.findOne = (filter) => {
    roomFilter = filter;
    return {
      select() {
        return this;
      },
      lean: async () => ({ _id: "room-id" }),
    };
  };

  try {
    const response = new PassThrough();
    response.setHeader = () => {};
    response.on("data", () => {});
    const completed = new Promise((resolve, reject) => {
      response.once("end", resolve);
      response.once("error", reject);
    });
    await downloadParticipantBattleRoomCertificate(
      { params: { roomCode: "room-1" }, userId: "candidate-id" },
      response,
    );
    await completed;
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(roomFilter, { _id: "room-id", status: "CLOSED" });
    assert.equal(deletion, undefined);
  } finally {
    BattleRoomSubmission.findOne = originalSubmissionFindOne;
    BattleRoomSubmission.updateOne = originalSubmissionUpdateOne;
    BattleRoom.findOne = originalRoomFindOne;
  }
});

test("battle certificate is deleted only by an explicit authenticated request", async () => {
  const originalSubmissionUpdateOne = BattleRoomSubmission.updateOne;
  let deletion;
  BattleRoomSubmission.updateOne = async (filter, update) => {
    deletion = { filter, update };
    return { matchedCount: 1 };
  };

  try {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await deleteParticipantBattleRoomCertificate(
      { params: { roomCode: "room-1" }, userId: "candidate-id" },
      res,
    );

    assert.deepEqual(deletion, {
      filter: {
        userId: "candidate-id",
        "certificateSnapshot.roomCode": "ROOM-1",
        status: "COMPLETED",
      },
      update: { $unset: { certificateSnapshot: 1 } },
    });
    assert.equal(res.statusCode, 200);
  } finally {
    BattleRoomSubmission.updateOne = originalSubmissionUpdateOne;
  }
});
