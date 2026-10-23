import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import Nonce from "../src/models/Nonce.js";

test("creates a short-lived nonce with a bounded expiry", async (t) => {
  const now = Date.now();
  let savedDocument;
  t.mock.method(Nonce.prototype, "save", async function saveNonce() {
    savedDocument = this;
    return this;
  });

  const nonceValue = await Nonce.generate(
    new mongoose.Types.ObjectId(),
    "SUBMIT",
    "room:submission:question:codehash",
    5 * 60 * 1000,
  );

  assert.match(nonceValue, /^[a-f\d]{64}$/);
  assert.equal(savedDocument.action, "SUBMIT");
  assert.equal(savedDocument.resourceId, "room:submission:question:codehash");
  assert.ok(
    savedDocument.authorizationExpiresAt.getTime() - now <=
      5 * 60 * 1000 + 1_000,
  );
  assert.ok(savedDocument.authorizationExpiresAt.getTime() - now > 0);
  assert.ok(savedDocument.expiresAt.getTime() - now > 23 * 60 * 60 * 1000);
  assert.ok(
    savedDocument.recoveryExpiresAt.getTime() === savedDocument.expiresAt.getTime(),
  );
});

test("rejects unbounded or malformed nonce lifetimes", async (t) => {
  let saveCalled = false;
  t.mock.method(Nonce.prototype, "save", async function saveNonce() {
    saveCalled = true;
    return this;
  });

  for (const ttl of [0, -1, 999, 24 * 60 * 60 * 1000 + 1, 1.5, "300000"]) {
    await assert.rejects(
      Nonce.generate(new mongoose.Types.ObjectId(), "SUBMIT", "resource", ttl),
      /Nonce lifetime/,
    );
  }
  assert.equal(saveCalled, false);
});

test("consumes a nonce with one atomic database operation", async (t) => {
  let query;
  let update;
  t.mock.method(Nonce, "findOneAndUpdate", async (filter, changes) => {
    query = filter;
    update = changes;
    return { used: true };
  });
  const userId = new mongoose.Types.ObjectId();

  const consumed = await Nonce.validateAndConsume(
    userId,
    "b".repeat(64),
    "SUBMIT",
    "room:question:source",
  );

  assert.equal(consumed, true);
  assert.equal(query.userId, userId);
  assert.equal(query.nonce, "b".repeat(64));
  assert.equal(query.action, "SUBMIT");
  assert.equal(query.resourceId, "room:question:source");
  assert.equal(query.used, false);
  assert.ok(query.authorizationExpiresAt.$gt instanceof Date);
  assert.deepEqual(update.$set, {
    used: true,
    state: "COMPLETED",
    consumedAt: update.$set.consumedAt,
    completedAt: update.$set.completedAt,
  });
  assert.ok(update.$set.consumedAt instanceof Date);
  assert.ok(update.$set.completedAt instanceof Date);
});

test("atomically claims a desktop grant and blocks an in-flight replay", async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const nonceValue = "c".repeat(64);
  const resourceId = "room:submission:question:source";
  const nonceDocument = {
    _id: new mongoose.Types.ObjectId(),
    state: "PROCESSING",
  };
  let claimQuery;
  let claimUpdate;
  let claimCalls = 0;
  let replayQuery;
  t.mock.method(Nonce, "findOneAndUpdate", async (query, update) => {
    claimCalls += 1;
    claimQuery = query;
    claimUpdate = update;
    return claimCalls === 1 ? nonceDocument : null;
  });
  t.mock.method(Nonce, "findOne", (query) => {
    replayQuery = query;
    return { lean: async () => nonceDocument };
  });

  const firstClaim = await Nonce.claimDesktopSubmission(
    userId,
    nonceValue,
    resourceId,
  );
  const replay = await Nonce.claimDesktopSubmission(
    userId,
    nonceValue,
    resourceId,
  );

  assert.equal(firstClaim.claimed, true);
  assert.equal(firstClaim.nonce, nonceDocument);
  assert.match(firstClaim.claimId, /^[a-f\d]{32}$/);
  assert.equal(claimQuery.userId, userId);
  assert.equal(claimQuery.nonce, nonceValue);
  assert.equal(claimQuery.action, "SUBMIT");
  assert.equal(claimQuery.resourceId, resourceId);
  assert.ok(
    claimQuery.$or.some(
      (condition) =>
        condition.state === "AVAILABLE" &&
        condition.authorizationExpiresAt.$gt instanceof Date,
    ),
  );
  assert.ok(
    claimQuery.$or.some(
      (condition) =>
        condition.state === "PROCESSING" &&
        condition.leaseExpiresAt.$lte instanceof Date,
    ),
  );
  assert.equal(claimUpdate.$set.state, "PROCESSING");
  assert.equal(claimUpdate.$set.used, true);
  assert.ok(claimUpdate.$set.leaseExpiresAt instanceof Date);
  assert.equal(claimUpdate.$inc.attemptCount, 1);
  assert.equal(replay.claimed, false);
  assert.equal(replay.claimId, null);
  assert.equal(replay.nonce, nonceDocument);
  assert.equal(replayQuery.userId, userId);
  assert.equal(replayQuery.resourceId, resourceId);
});

test("releases failed judging for retry and finalizes only the owning claim", async (t) => {
  const nonceId = new mongoose.Types.ObjectId();
  const claimId = "claim-1";
  const queries = [];
  const updates = [];
  t.mock.method(Nonce, "findOneAndUpdate", async (query, update) => {
    queries.push(query);
    updates.push(update);
    return { _id: nonceId };
  });

  await Nonce.releaseDesktopSubmission(nonceId, claimId);
  await Nonce.completeDesktopSubmission(nonceId, claimId);

  assert.equal(queries[0]._id, nonceId);
  assert.equal(queries[0].state, "PROCESSING");
  assert.equal(queries[0].claimId, claimId);
  assert.equal(updates[0].$set.state, "RETRYABLE");
  assert.equal(updates[0].$set.claimId, null);
  assert.equal(updates[0].$set.leaseExpiresAt, null);
  assert.equal(queries[1]._id, nonceId);
  assert.equal(queries[1].state, "PROCESSING");
  assert.equal(queries[1].claimId, claimId);
  assert.ok(queries[1].leaseExpiresAt.$gt instanceof Date);
  assert.equal(updates[1].$set.state, "COMPLETED");
  assert.ok(updates[1].$set.completedAt instanceof Date);
});
