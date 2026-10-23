import assert from "node:assert/strict";
import test from "node:test";
import BattleRoom from "../src/models/BattleRoom.js";
import battleRoomRoutes from "../src/routes/battleRoomRoutes.js";
import {
  getRoomForEdit,
  getRoomParticipants,
  updateRoomAllowlist,
} from "../src/controllers/battleRoomController.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function withRoomQueryMock(room, run) {
  const originalFindOne = BattleRoom.findOne;
  BattleRoom.findOne = () => ({ select: async () => room });
  try {
    await run();
  } finally {
    BattleRoom.findOne = originalFindOne;
  }
}

test("another creator cannot read a saved room's edit payload", async () => {
  const res = responseRecorder();
  await withRoomQueryMock(
    { createdBy: "creator-b", toEditJSON() { throw new Error("must not serialize"); } },
    async () => {
      await getRoomForEdit({ params: { roomCode: "ABCDE2" }, userId: "creator-a" }, res);
    },
  );
  assert.equal(res.statusCode, 403);
});

test("another creator cannot read private participant and allowlist data", async () => {
  const res = responseRecorder();
  await withRoomQueryMock(
    { createdBy: "creator-b" },
    async () => {
      await getRoomParticipants({ params: { roomCode: "ABCDE2" }, userId: "creator-a" }, res);
    },
  );
  assert.equal(res.statusCode, 403);
});

test("another creator cannot modify a room's candidate allowlist", async () => {
  const res = responseRecorder();
  await withRoomQueryMock(
    { createdBy: "creator-b" },
    async () => {
      await updateRoomAllowlist(
        {
          params: { roomCode: "ABCDE2" },
          userId: "creator-a",
          body: { candidateAccess: "OPEN", allowedEmails: [] },
        },
        res,
      );
    },
  );
  assert.equal(res.statusCode, 403);
});

test("saved room management APIs require authentication and enforce room ownership in handlers", () => {
  for (const [method, path] of [
    ["get", "/:roomCode/edit"],
    ["put", "/:roomCode"],
    ["get", "/:roomCode/participants"],
    ["put", "/:roomCode/allowlist"],
  ]) {
    const layer = battleRoomRoutes.stack.find(
      (item) => item.route?.path === path && item.route.methods[method],
    );
    assert.ok(layer, `missing ${method.toUpperCase()} ${path}`);
    assert.equal(layer.route.stack[0].name, "authenticate");
    assert.equal(layer.route.stack.length, 2);
    assert.notEqual(layer.route.stack[1].name, "requireVerifiedCreator");
  }
});
