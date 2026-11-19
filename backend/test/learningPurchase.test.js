import assert from "node:assert/strict";
import test from "node:test";
import LearningModule from "../src/models/LearningModule.js";
import LearningProgram from "../src/models/LearningProgram.js";
import LearningProgress from "../src/models/LearningProgress.js";
import LearningPurchase from "../src/models/LearningPurchase.js";
import {
  createLearningPurchase,
  getStudentModule,
} from "../src/services/learningService.js";

test("free module access uses the database price and never accepts course purchases", async () => {
  const methods = [
    [LearningModule, "findOne"],
    [LearningProgram, "findOne"],
    [LearningPurchase, "findOne"],
    [LearningPurchase.prototype, "save"],
    [LearningProgress, "updateOne"],
  ];
  const originals = methods.map(([target, name]) => [target, name, target[name]]);
  const userId = "507f1f77bcf86cd799439011";
  const moduleId = "507f1f77bcf86cd799439012";
  const programId = "507f1f77bcf86cd799439013";
  const module = {
    _id: moduleId,
    programId,
    title: "Free module",
    price: 0,
    currency: "INR",
    currentPublishedVersion: 3,
    accessDurationDays: 2,
  };
  LearningModule.findOne = () => ({ select: async () => module });
  LearningProgram.findOne = () => ({ select: async () => ({ _id: programId }) });
  LearningPurchase.findOne = () => ({ sort: async () => null });
  LearningPurchase.prototype.save = async function savePurchase() { return this; };
  LearningProgress.updateOne = async () => ({ acknowledged: true });

  try {
    const result = await createLearningPurchase(userId, {
      moduleId,
      price: 9000,
      currency: "USD",
    });

    assert.equal(result.purchase.amount, 0);
    assert.equal(result.purchase.currency, "INR");
    assert.equal(result.purchase.status, "ACTIVE");
    assert.equal(result.purchase.moduleVersion, 3);
    assert.equal(result.purchase.paymentProvider, "FREE");
    assert.equal(result.purchase.accessDurationDays, 2);
    assert.ok(result.purchase.accessStartedAt instanceof Date);
    assert.equal(
      result.purchase.accessExpiresAt.getTime() - result.purchase.accessStartedAt.getTime(),
      2 * 24 * 60 * 60 * 1000,
    );
    assert.equal(result.checkout, null);
    await assert.rejects(createLearningPurchase(userId, { programId }), /individual module purchases/);
  } finally {
    for (const [target, name, original] of originals) target[name] = original;
  }
});

test("expired paid-module access is blocked and recorded as expired", async () => {
  const methods = [
    [LearningModule, "findOne"],
    [LearningProgram, "exists"],
    [LearningPurchase, "findOne"],
  ];
  const originals = methods.map(([target, name]) => [target, name, target[name]]);
  const module = {
    _id: "507f1f77bcf86cd799439022",
    programId: "507f1f77bcf86cd799439023",
    currentPublishedVersion: 1,
    prerequisites: [],
  };
  const purchase = {
    status: "ACTIVE",
    accessExpiresAt: new Date(Date.now() - 1000),
    async save() {},
  };
  LearningModule.findOne = () => ({ select: async () => module });
  LearningProgram.exists = async () => ({ _id: module.programId });
  LearningPurchase.findOne = async () => purchase;

  try {
    await assert.rejects(
      getStudentModule("student-1", module.programId, module._id),
      (error) => error.statusCode === 403 && /access.*expired/.test(error.message),
    );
    assert.equal(purchase.status, "EXPIRED");
  } finally {
    for (const [target, name, original] of originals) target[name] = original;
  }
});
