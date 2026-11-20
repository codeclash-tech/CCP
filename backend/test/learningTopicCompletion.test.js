import assert from "node:assert/strict";
import test from "node:test";
import LearningModule from "../src/models/LearningModule.js";
import LearningModuleVersion from "../src/models/LearningModuleVersion.js";
import LearningCertificate from "../src/models/LearningCertificate.js";
import LearningProgram from "../src/models/LearningProgram.js";
import LearningProgress from "../src/models/LearningProgress.js";
import LearningPurchase from "../src/models/LearningPurchase.js";
import { completeLearningTopic } from "../src/services/learningService.js";

test("topic completion requires recorded objective mastery and cannot be self-marked", async () => {
  const methods = [
    [LearningModule, "findOne"],
    [LearningModule, "findById"],
    [LearningModuleVersion, "findOne"],
    [LearningProgram, "exists"],
    [LearningPurchase, "findOne"],
    [LearningProgress, "findOneAndUpdate"],
    [LearningCertificate, "findOneAndUpdate"],
  ];
  const originals = methods.map(([target, name]) => [target, name, target[name]]);
  const moduleId = "507f1f77bcf86cd799439031";
  const programId = "507f1f77bcf86cd799439032";
  const userId = "507f1f77bcf86cd799439033";
  const module = new LearningModule({
    _id: moduleId,
    programId,
    title: "Foundations",
    description: "Core ideas.",
    sequence: 1,
    estimatedDurationMinutes: 60,
    status: "PUBLISHED",
    currentPublishedVersion: 1,
    topics: [
      {
        title: "Topic one",
        description: "Lesson one.",
        objectives: ["Explain the first outcome."],
      },
      {
        title: "Topic two",
        description: "Lesson two.",
        objectives: ["Explain the second outcome."],
      },
    ],
  });
  const topic = module.topics[0];
  const currentModule = {
    _id: module._id,
    programId,
    currentPublishedVersion: 1,
    prerequisites: [],
  };
  const progress = {
    userId,
    moduleId: module._id,
    moduleVersion: 1,
    completedTopicIds: [],
    completedObjectiveKeys: [],
    completedExerciseIds: [],
    assessmentPassed: false,
    assessmentScorePercent: 0,
    completedAt: null,
    progressPercentage: 0,
    async save() { return this; },
  };

  LearningModule.findOne = () => ({ select: async () => currentModule });
  LearningModule.findById = async () => module;
  LearningModuleVersion.findOne = () => ({ lean: async () => null });
  LearningProgram.exists = async () => ({ _id: programId });
  LearningPurchase.findOne = async () => ({ status: "ACTIVE", accessExpiresAt: null });
  LearningProgress.findOneAndUpdate = async () => progress;
  LearningCertificate.findOneAndUpdate = async () => null;

  try {
    const incorrect = await completeLearningTopic(userId, moduleId, String(topic._id), {});
    assert.equal(incorrect.passed, false);
    assert.equal(progress.completedTopicIds.length, 0);

    progress.completedObjectiveKeys = [`${topic._id}:0`];
    const accepted = await completeLearningTopic(userId, moduleId, String(topic._id));
    assert.equal(accepted.passed, true);
    assert.equal(accepted.scorePercent, 100);
    assert.equal(progress.completedTopicIds.length, 1);
    assert.equal(progress.completedAt, null);
    assert.equal(accepted.certificate, null);
  } finally {
    for (const [target, name, original] of originals) target[name] = original;
  }
});
