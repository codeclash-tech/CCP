import assert from "node:assert/strict";
import test from "node:test";
import LearningModule from "../src/models/LearningModule.js";
import LearningModuleVersion from "../src/models/LearningModuleVersion.js";
import LearningAiUsage from "../src/models/LearningAiUsage.js";
import LearningCertificate from "../src/models/LearningCertificate.js";
import LearningProgram from "../src/models/LearningProgram.js";
import LearningProgress from "../src/models/LearningProgress.js";
import LearningPurchase from "../src/models/LearningPurchase.js";
import LearningSession from "../src/models/LearningSession.js";
import { executionService } from "../src/services/executionService.js";
import { submitLearningExercise } from "../src/services/learningService.js";
import config from "../src/config/env.js";

test("written learning activities are evaluated, evidence-gated, and never invoke Java execution", async () => {
  const originalModuleFindOne = LearningModule.findOne;
  const originalModuleFindById = LearningModule.findById;
  const originalVersionFindOne = LearningModuleVersion.findOne;
  const originalProgramExists = LearningProgram.exists;
  const originalPurchaseFindOne = LearningPurchase.findOne;
  const originalProgressUpdate = LearningProgress.findOneAndUpdate;
  const originalProgressFind = LearningProgress.findOne;
  const originalSessionFind = LearningSession.findOne;
  const originalSessionSave = LearningSession.prototype.save;
  const originalCertificateUpdate = LearningCertificate.findOneAndUpdate;
  const originalUsageCreate = LearningAiUsage.create;
  const originalExecute = executionService.execute;
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    AI_PROVIDER: config.AI_PROVIDER,
    AI_MODEL: config.AI_MODEL,
    AI_BASE_URL: config.AI_BASE_URL,
    AI_API_KEY: config.AI_API_KEY,
    AI_TIMEOUT_MS: config.AI_TIMEOUT_MS,
  };
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
      objectives: ["Explain how network layers divide communication responsibilities."],
      objectiveDefinitions: [{
        key: "layers",
        title: "Explain network layers",
        description: "Explain how network layers divide communication responsibilities.",
        expectedOutcome: "Describe how layers divide and coordinate responsibilities.",
        masteryCriteria: [
          {
            key: "responsibilities",
            description: "Explain that layers divide communication responsibilities.",
            evaluationMethod: "EXPLANATION",
            requiredEvidenceCount: 1,
          },
          {
            key: "coordination",
            description: "Explain how layers work together.",
            evaluationMethod: "EXPLANATION",
            requiredEvidenceCount: 1,
          },
        ],
      }],
      exercises: [{
        type: "ACTIVITY",
        title: "Explain the layers",
        instructions: "Describe how the layers work together.",
        objectiveKeys: ["layers"],
        criterionKeys: ["responsibilities", "coordination"],
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
    completedObjectiveKeys: [],
    completedExerciseIds: [],
    objectiveEvidence: [],
    objectiveProfiles: [],
    taskAttempts: [],
    assessmentPassed: false,
    assessmentScorePercent: 0,
    completedAt: null,
    progressPercentage: 0,
    async save() {
      return this;
    },
  };
  const session = new LearningSession({
    userId: progress.userId,
    moduleId: module._id,
    moduleVersion: 1,
    topicId: module.topics[0]._id,
    learningStage: "OBJECTIVE_VERIFICATION",
    awaitingTeachingIntroduction: false,
  });
  LearningModule.findOne = () => ({ select: async () => currentModule });
  LearningModule.findById = async () => module;
  LearningModuleVersion.findOne = () => ({ lean: async () => null });
  LearningProgram.exists = async () => ({ _id: module.programId });
  LearningPurchase.findOne = async () => ({
    status: "ACTIVE",
    accessExpiresAt: null,
  });
  LearningProgress.findOneAndUpdate = async () => progress;
  LearningProgress.findOne = async () => progress;
  LearningSession.findOne = () => ({
    sort() {
      return this;
    },
    async then(resolve, reject) {
      return Promise.resolve(session).then(resolve, reject);
    },
  });
  LearningSession.prototype.save = async function saveSession() { return this; };
  LearningCertificate.findOneAndUpdate = async () => null;
  LearningAiUsage.create = async () => ({});
  executionService.execute = async () => {
    throw new Error("Written activities must not use the code runner.");
  };
  config.AI_PROVIDER = "ollama";
  config.AI_MODEL = "test-model";
  config.AI_BASE_URL = "http://localhost:11434";
  config.AI_API_KEY = "";
  config.AI_TIMEOUT_MS = "1000";
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const response = request.messages.at(-1).content;
    const hasMisconception = /router|removes the need/i.test(response);
    const explainsResponsibilities = /divide|responsibilit/i.test(response);
    const explainsCoordination = /work together|coordinate/i.test(response);
    return {
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            reply: "Your explanation identifies how the layers divide responsibility.",
            objectiveEvidence: [{
              objectiveKey: "layers",
              criteria: [
                {
                  criterionKey: "responsibilities",
                  demonstrated: explainsResponsibilities,
                  evidenceQuote: explainsResponsibilities ? response : "",
                  confidence: 0.95,
                  misconceptions: hasMisconception
                    ? ["A router makes network layers unnecessary."]
                    : [],
                },
                {
                  criterionKey: "coordination",
                  demonstrated: explainsCoordination,
                  evidenceQuote: explainsCoordination ? response : "",
                  confidence: 0.95,
                },
              ],
            }],
          }),
        },
      }),
    };
  };

  try {
    const exercise = module.topics[0].exercises[0];
    const misconception = await submitLearningExercise(
      progress.userId,
      moduleId,
      module.topics[0]._id,
      exercise._id,
      "A router removes the need for network layers.",
    );
    assert.equal(misconception.accepted, false);
    assert.equal(misconception.status, "MISCONCEPTION_DETECTED");
    assert.equal(progress.completedObjectiveKeys.length, 0);

    const ambiguous = await submitLearningExercise(
      progress.userId,
      moduleId,
      module.topics[0]._id,
      exercise._id,
      "I am not sure what this question is asking.",
    );
    assert.equal(ambiguous.accepted, false);
    assert.equal(ambiguous.status, "NEEDS_CLARIFICATION");
    assert.equal(progress.completedObjectiveKeys.length, 0);

    const first = await submitLearningExercise(
      progress.userId,
      moduleId,
      module.topics[0]._id,
      exercise._id,
      "The layers divide communication into responsibilities.",
    );
    assert.equal(first.accepted, false);
    assert.equal(first.status, "PARTIALLY_CORRECT");
    assert.equal(progress.completedObjectiveKeys.length, 0);

    const result = await submitLearningExercise(
      progress.userId,
      moduleId,
      module.topics[0]._id,
      exercise._id,
      "The layers work together to coordinate communication.",
    );
    assert.equal(result.accepted, true);
    assert.equal(result.status, "CORRECT");
    assert.equal(progress.completedExerciseIds.length, 1);
    assert.equal(progress.completedObjectiveKeys.length, 1);
    assert.equal(progress.taskAttempts.length, 4);
  } finally {
    LearningModule.findOne = originalModuleFindOne;
    LearningModule.findById = originalModuleFindById;
    LearningModuleVersion.findOne = originalVersionFindOne;
    LearningProgram.exists = originalProgramExists;
    LearningPurchase.findOne = originalPurchaseFindOne;
    LearningProgress.findOneAndUpdate = originalProgressUpdate;
    LearningProgress.findOne = originalProgressFind;
    LearningSession.findOne = originalSessionFind;
    LearningSession.prototype.save = originalSessionSave;
    LearningCertificate.findOneAndUpdate = originalCertificateUpdate;
    LearningAiUsage.create = originalUsageCreate;
    executionService.execute = originalExecute;
    globalThis.fetch = originalFetch;
    Object.assign(config, originalConfig);
  }
});
