import assert from "node:assert/strict";
import test from "node:test";
import { ensureOrganizationMembershipIndexes } from "../src/models/ensureIndexes.js";
import OrganizationMembership from "../src/models/OrganizationMembership.js";

test("declares the named unique active-membership index without automatic index races", () => {
  const [keys, options] = OrganizationMembership.schema
    .indexes()
    .find(([keys]) => Object.keys(keys).length === 1 && keys.userId === 1);

  assert.deepEqual(keys, { userId: 1 });
  assert.equal(options.name, "active_user_membership_unique");
  assert.equal(options.unique, true);
  assert.deepEqual(options.partialFilterExpression, { status: "ACTIVE" });
  assert.equal(OrganizationMembership.schema.options.autoIndex, false);
});

function createCollection(indexes) {
  const dropped = [];
  const created = [];
  return {
    dropped,
    created,
    indexes: async () => indexes,
    dropIndex: async (name) => dropped.push(name),
    createIndex: async (keys, options) => created.push({ keys, options }),
  };
}

test("replaces only stale single-field userId indexes without touching data", async () => {
  const collection = createCollection([
    { name: "_id_", key: { _id: 1 } },
    { name: "userId_1", key: { userId: 1 } },
    {
      name: "userId_1_validFrom_1_validTo_1",
      key: { userId: 1, validFrom: 1, validTo: 1 },
    },
  ]);

  await ensureOrganizationMembershipIndexes(collection);

  assert.deepEqual(collection.dropped, ["userId_1"]);
  assert.deepEqual(collection.created, [
    {
      keys: { userId: 1 },
      options: {
        name: "active_user_membership_unique",
        unique: true,
        partialFilterExpression: { status: "ACTIVE" },
      },
    },
  ]);
});

test("keeps the intended active-membership index and still ensures it", async () => {
  const collection = createCollection([
    {
      name: "active_user_membership_unique",
      key: { userId: 1 },
      unique: true,
      partialFilterExpression: { status: "ACTIVE" },
    },
  ]);

  await ensureOrganizationMembershipIndexes(collection);

  assert.deepEqual(collection.dropped, []);
  assert.equal(collection.created.length, 1);
});

test("creates the intended index when the collection does not exist yet", async () => {
  const collection = {
    dropped: [],
    created: [],
    indexes: async () => {
      const error = new Error("namespace does not exist");
      error.code = 26;
      throw error;
    },
    dropIndex: async (name) => collection.dropped.push(name),
    createIndex: async (keys, options) => collection.created.push({ keys, options }),
  };

  await ensureOrganizationMembershipIndexes(collection);

  assert.deepEqual(collection.dropped, []);
  assert.equal(collection.created[0].options.name, "active_user_membership_unique");
});
