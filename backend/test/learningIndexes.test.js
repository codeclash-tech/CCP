import assert from "node:assert/strict";
import test from "node:test";
import LearningModule from "../src/models/LearningModule.js";
import LearningPurchase from "../src/models/LearningPurchase.js";
import {
  ensureLearningIndexes,
  ensureLearningModuleSequenceIndex,
} from "../src/models/ensureIndexes.js";

test("live module entitlements are unique while historical failed purchases remain recordable", () => {
  const [keys, options] = LearningPurchase.schema.indexes().find(
    ([indexKeys]) => indexKeys.userId === 1 && indexKeys.moduleId === 1,
  );
  assert.deepEqual(keys, { userId: 1, moduleId: 1 });
  assert.equal(options.unique, true);
  assert.deepEqual(options.partialFilterExpression, {
    moduleId: { $type: "objectId" },
    status: { $in: ["PENDING", "ACTIVE"] },
  });

  test("module ordering uniqueness excludes archived modules", () => {
    const [keys, options] = LearningModule.schema.indexes().find(
      ([indexKeys]) => indexKeys.programId === 1 && indexKeys.sequence === 1,
    );
    assert.deepEqual(keys, { programId: 1, sequence: 1 });
    assert.equal(options.unique, true);
    assert.deepEqual(options.partialFilterExpression, { deletedAt: null });
  });

  test("replaces the full module sequence index with the active-module index", async () => {
    const dropped = [];
    const created = [];
    const collection = {
      indexes: async () => [
        { name: "_id_", key: { _id: 1 } },
        { name: "programId_1_sequence_1", key: { programId: 1, sequence: 1 }, unique: true },
        { name: "programId_1_status_1", key: { programId: 1, status: 1 } },
      ],
      dropIndex: async (name) => dropped.push(name),
      createIndex: async (keys, options) => created.push({ keys, options }),
    };
    await ensureLearningModuleSequenceIndex(collection);
    assert.deepEqual(dropped, ["programId_1_sequence_1"]);
    assert.deepEqual(created, [{
      keys: { programId: 1, sequence: 1 },
      options: {
        name: "unique_active_learning_module_sequence",
        unique: true,
        partialFilterExpression: { deletedAt: null },
      },
    }]);
  });
  assert.equal(LearningPurchase.schema.options.autoIndex, false);
});

test("replaces only the stale all-status purchase uniqueness index", async () => {
  const dropped = [];
  const created = [];
  const collection = {
    indexes: async () => [
      { name: "_id_", key: { _id: 1 } },
      { name: "userId_1_moduleId_1", key: { userId: 1, moduleId: 1 }, unique: true },
      { name: "paymentOrderId_1", key: { paymentOrderId: 1 } },
    ],
    dropIndex: async (name) => dropped.push(name),
    createIndex: async (keys, options) => created.push({ keys, options }),
  };
  await ensureLearningIndexes(collection, false);
  assert.deepEqual(dropped, ["userId_1_moduleId_1"]);
  assert.deepEqual(created, [{
    keys: { userId: 1, moduleId: 1 },
    options: {
      name: "unique_live_user_module_purchase",
      unique: true,
      partialFilterExpression: {
        moduleId: { $type: "objectId" },
        status: { $in: ["PENDING", "ACTIVE"] },
      },
    },
  }]);
});
