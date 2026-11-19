import assert from "node:assert/strict";
import test from "node:test";
import LearningModule from "../src/models/LearningModule.js";
import LearningModuleVersion from "../src/models/LearningModuleVersion.js";
import LearningProgram from "../src/models/LearningProgram.js";
import LearningProgress from "../src/models/LearningProgress.js";
import LearningPurchase from "../src/models/LearningPurchase.js";
import { executionService } from "../src/services/executionService.js";
import { submitLearningExercise } from "../src/services/learningService.js";

test("written learning activities complete without invoking Java execution", async () => {
  const originalModuleFindOne = LearningModule.findOne;
  const originalModuleFindById = LearningModule.findById;
  const originalVersionFindOne = LearningModuleVersion.findOne;
  const originalProgramExists = LearningProgram.exists;
  const originalPurchaseFindOne = LearningPurchase.findOne;
  const originalProgressUpdate = LearningProgress.findOneAndUpdate;
  const originalExecute = executionService.execute;
  const moduleId = "507f1f77bcf86cd799439011";
  const module = new LearningModule({
    _id: moduleId,
    programId: "507f1f77bcf86cd799439012",
    title: "Networks",
    description: "Theory module.",
    sequence: 1,
    estimatedDurationMinutes: 60,
    status: "PUBLISHED",
    currentPublishedVersion: 1,
    topics: [{
      title: "Network layers",
      exercises: [{
        type: "ACTIVITY",
        title: "Explain the layers",
        instructions: "Describe how the layers work together.",
      }],
    }],
  });
  const currentModule = {
    _id: module._id,
    programId: module.programId,
    currentPublishedVersion: 1,
    prerequisites: [],
  };
  const progress = {
    userId: "507f1f77bcf86cd799439013",
    moduleId: module._id,
    moduleVersion: 1,
    completedTopicIds: [],
    completedExerciseIds: [],
    assessmentPassed: false,
    assessmentScorePercent: 0,
    completedAt: null,
    progressPercentage: 0,
    async save() {
      return this;
    },
  };
  LearningModule.findOne = () => ({ select: async () => currentModule });
  LearningModule.findById = async () => module;
  LearningModuleVersion.findOne = () => ({ lean: async () => null });
  LearningProgram.exists = async () => ({ _id: module.programId });
  LearningPurchase.findOne = async () => ({
    status: "ACTIVE",
    accessExpiresAt: null,
  });
  LearningProgress.findOneAndUpdate = async () => progress;
  executionService.execute = async () => {
    throw new Error("Written activities must not use the code runner.");
  };

  try {
    const exercise = module.topics[0].exercises[0];
    const result = await submitLearningExercise(
      progress.userId,
      moduleId,
      module.topics[0]._id,
      exercise._id,
      "The layers divide communication into responsibilities.",
    );
    assert.equal(result.accepted, true);
    assert.equal(result.status, "COMPLETED");
    assert.equal(progress.completedExerciseIds.length, 1);
  } finally {
    LearningModule.findOne = originalModuleFindOne;
    LearningModule.findById = originalModuleFindById;
    LearningModuleVersion.findOne = originalVersionFindOne;
    LearningProgram.exists = originalProgramExists;
    LearningPurchase.findOne = originalPurchaseFindOne;
    LearningProgress.findOneAndUpdate = originalProgressUpdate;
    executionService.execute = originalExecute;
  }
});
