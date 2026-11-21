import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import LearningAiUsage from "../src/models/LearningAiUsage.js";
import LearningModule from "../src/models/LearningModule.js";
import config from "../src/config/env.js";
import { executionService } from "../src/services/executionService.js";
import { previewLearningTutor } from "../src/services/learningService.js";

function createModule() {
  return new LearningModule({
    _id: new mongoose.Types.ObjectId(),
    programId: new mongoose.Types.ObjectId(),
    title: "Preview tasks",
    description: "Preview-only test module.",
    sequence: 1,
    estimatedDurationMinutes: 30,
    status: "DRAFT",
    topics: [],
  });
}

function createTopicDraft(type, exerciseId, evaluationMethod) {
  const objectiveKey = `objective-${type.toLowerCase()}`;
  const criterionKey = `criterion-${type.toLowerCase()}`;
  return {
    title: "Task preview",
    description: "Simulate one task.",
    objectiveDefinitions: [{
      key: objectiveKey,
      title: "Demonstrate the objective",
      description: "Demonstrate the approved objective.",
      expectedOutcome: "Demonstrate the approved objective.",
      prerequisites: [],
      masteryCriteria: [{
        key: criterionKey,
        description: "Demonstrate the objective.",
        evaluationMethod,
        requiredEvidenceCount: 1,
      }],
    }],
    exercises: [{
      _id: exerciseId,
      type,
      title: "Preview task",
      instructions: "Complete this task.",
      language: "java",
      expectedAnswer: "4",
      numericTolerance: 0,
      requireReasoning: false,
      objectiveKeys: [objectiveKey],
      criterionKeys: [criterionKey],
      tests: [
        { input: "", expectedOutput: "visible", visible: true },
        { input: "", expectedOutput: "secret", visible: false },
      ],
    }],
  };
}

async function withPreviewDependencies(module, callback) {
  const originalFindOne = LearningModule.findOne;
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
  const usages = [];
  LearningModule.findOne = async () => module;
  LearningAiUsage.create = async (usage) => {
    usages.push(usage);
    return usage;
  };
  try {
    await callback({ usages });
  } finally {
    LearningModule.findOne = originalFindOne;
    LearningAiUsage.create = originalUsageCreate;
    executionService.execute = originalExecute;
    globalThis.fetch = originalFetch;
    Object.assign(config, originalConfig);
  }
}

test("admin math preview uses the deterministic evaluator and never persists mastery", async () => {
  const module = createModule();
  const adminId = new mongoose.Types.ObjectId();
  const exerciseId = new mongoose.Types.ObjectId();
  const topicDraft = createTopicDraft("MATH", exerciseId, "CALCULATION");

  await withPreviewDependencies(module, async ({ usages }) => {
    const correct = await previewLearningTutor(adminId, module._id, null, {
      taskSimulation: {
        type: "MATH",
        exerciseId: String(exerciseId),
        submission: { answer: "2 + 2" },
      },
      topicDraft,
    });
    const incorrect = await previewLearningTutor(adminId, module._id, null, {
      taskSimulation: {
        type: "MATH",
        exerciseId: String(exerciseId),
        submission: { answer: "5" },
      },
      topicDraft,
    });

    assert.equal(correct.taskResult.status, "CORRECT");
    assert.equal(correct.masteryDecision.mastered, true);
    assert.equal(correct.evidence[0].criteria[0].criterionKey, "criterion-math");
    assert.equal(incorrect.taskResult.status, "INCORRECT_VALUE");
    assert.equal(incorrect.masteryDecision.mastered, false);
    assert.equal(usages.length, 0);
  });
});

test("admin Java preview uses the secure runner path and omits hidden case output", async () => {
  const module = createModule();
  const adminId = new mongoose.Types.ObjectId();
  const exerciseId = new mongoose.Types.ObjectId();
  const topicDraft = createTopicDraft("CODE", exerciseId, "CODE");

  await withPreviewDependencies(module, async () => {
    executionService.execute = async (_code, tests, language, limits) => {
      assert.equal(language, "java");
      assert.deepEqual(limits, { timeLimit: 2000, memoryLimit: 65536 });
      assert.equal(tests.length, 2);
      return {
        status: "ACCEPTED",
        accepted: true,
        passed: 2,
        total: 2,
        results: [
          { testCase: 1, status: "PASSED", output: "visible" },
          { testCase: 2, status: "PASSED", output: "secret" },
        ],
      };
    };
    const result = await previewLearningTutor(adminId, module._id, null, {
      taskSimulation: {
        type: "CODE",
        exerciseId: String(exerciseId),
        submission: { code: "class Solution {}" },
      },
      topicDraft,
    });
    const responseText = JSON.stringify(result);

    assert.equal(result.taskResult.status, "ACCEPTED");
    assert.equal(result.taskResult.accepted, true);
    assert.equal(result.masteryDecision.mastered, true);
    assert.equal(result.taskResult.visibleResults.length, 1);
    assert.equal(responseText.includes("secret"), false);
  });
});

test("admin activity preview validates cited theory evidence and runner failures cannot master objectives", async () => {
  const module = createModule();
  const adminId = new mongoose.Types.ObjectId();
  const exerciseId = new mongoose.Types.ObjectId();
  const topicDraft = createTopicDraft("ACTIVITY", exerciseId, "EXPLANATION");
  topicDraft.exercises[0].tests = [];
  const originalResponse = globalThis.fetch;

  await withPreviewDependencies(module, async () => {
    config.AI_PROVIDER = "ollama";
    config.AI_MODEL = "preview-model";
    config.AI_BASE_URL = "http://preview-provider";
    config.AI_API_KEY = "";
    config.AI_TIMEOUT_MS = "1000";
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            reply: "Your explanation demonstrates the objective.",
            objectiveEvidence: [{
              objectiveKey: "objective-activity",
              criteria: [{
                criterionKey: "criterion-activity",
                demonstrated: true,
                evidenceQuote: "A variable stores a value",
                confidence: 0.95,
              }],
            }],
          }),
        },
      }),
    });
    const result = await previewLearningTutor(adminId, module._id, null, {
      taskSimulation: {
        type: "ACTIVITY",
        exerciseId: String(exerciseId),
        submission: { response: "A variable stores a value." },
      },
      topicDraft,
    });

    assert.equal(result.taskResult.accepted, true);
    assert.equal(result.masteryDecision.mastered, true);
    assert.equal(result.evidence[0].criteria[0].evidenceQuote, "A variable stores a value");

    executionService.execute = async () => ({
      status: "SYSTEM_ERROR",
      accepted: false,
      passed: 0,
      total: 2,
      results: [
        { testCase: 1, status: "SYSTEM_ERROR", output: "" },
        { testCase: 2, status: "SYSTEM_ERROR", output: "hidden-output" },
      ],
    });
    const codeExerciseId = new mongoose.Types.ObjectId();
    const codeDraft = createTopicDraft("CODE", codeExerciseId, "CODE");
    const failedRunner = await previewLearningTutor(adminId, module._id, null, {
      taskSimulation: {
        type: "CODE",
        exerciseId: String(codeExerciseId),
        submission: { code: "class Solution {}" },
      },
      topicDraft: codeDraft,
    });
    assert.equal(failedRunner.taskResult.status, "SYSTEM_ERROR");
    assert.equal(failedRunner.taskResult.accepted, false);
    assert.equal(failedRunner.masteryDecision.mastered, false);
    assert.equal(JSON.stringify(failedRunner).includes("hidden-output"), false);
  });
  globalThis.fetch = originalResponse;
});
