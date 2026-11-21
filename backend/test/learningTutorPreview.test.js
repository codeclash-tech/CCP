import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import LearningAiUsage from "../src/models/LearningAiUsage.js";
import LearningModule from "../src/models/LearningModule.js";
import config from "../src/config/env.js";
import { previewLearningTutor } from "../src/services/learningService.js";

test("admin tutor preview evaluates a draft with backend evidence and does not persist it", async () => {
  const module = new LearningModule({
    _id: new mongoose.Types.ObjectId(),
    programId: new mongoose.Types.ObjectId(),
    title: "Foundations",
    description: "Core concepts.",
    sequence: 1,
    estimatedDurationMinutes: 30,
    status: "DRAFT",
    topics: [],
  });
  const adminId = new mongoose.Types.ObjectId();
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    AI_PROVIDER: config.AI_PROVIDER,
    AI_MODEL: config.AI_MODEL,
    AI_BASE_URL: config.AI_BASE_URL,
    AI_API_KEY: config.AI_API_KEY,
    AI_TIMEOUT_MS: config.AI_TIMEOUT_MS,
  };
  const originalFindOne = LearningModule.findOne;
  const originalUsageCreate = LearningAiUsage.create;
  const usages = [];
  let request;
  const previewInput = {
    message: "A variable stores a value, like a score.",
    scenario: "NO_PRIOR_KNOWLEDGE",
    history: [],
    topicDraft: {
      title: "Variables",
      description: "Understand named storage.",
      objectiveDefinitions: [{
        key: "variable-storage",
        title: "Explain variables",
        description: "Explain what a variable stores.",
        expectedOutcome: "Describe a variable as a named value.",
        requiredKnowledge: ["A variable stores a value."],
        commonMisconceptions: [],
        prerequisites: [],
        masteryCriteria: [{
          key: "purpose",
          description: "Explain that a variable stores a value.",
          evaluationMethod: "EXPLANATION",
          requiredEvidenceCount: 1,
        }],
      }],
    },
  };
  LearningModule.findOne = async () => module;
  LearningAiUsage.create = async (usage) => {
    usages.push(usage);
    return usage;
  };
  config.AI_PROVIDER = "ollama";
  config.AI_MODEL = "preview-test-model";
  config.AI_BASE_URL = "http://preview-provider";
  config.AI_API_KEY = "";
  config.AI_TIMEOUT_MS = "1000";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://preview-provider/api/chat");
    request = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            reply: "A variable stores a value under a name.",
            objectiveEvidence: [{
              objectiveKey: "variable-storage",
              criteria: [{
                criterionKey: "purpose",
                demonstrated: true,
                evidenceQuote: "A variable stores a value",
                confidence: 0.96,
              }],
            }],
          }),
        },
      }),
    };
  };

  try {
    const result = await previewLearningTutor(adminId, module._id, null, previewInput);

    assert.equal(result.evaluation.correctness, "correct");
    assert.equal(result.evidence.length, 1);
    assert.deepEqual(result.simulatedProgress.objectiveProgress, [{
      objectiveKey: "variable-storage",
      state: "MASTERED",
    }]);
    assert.match(request.messages[0].content, /private curriculum preview/);
    assert.equal(module.topics.length, 0);
    assert.equal(usages.length, 1);
    assert.equal(usages[0].operation, "TUTOR_PREVIEW");
    assert.equal(usages[0].succeeded, true);

    globalThis.fetch = async () => { throw new Error("provider unavailable"); };
    await assert.rejects(
      previewLearningTutor(adminId, module._id, null, previewInput),
      /temporarily unavailable/i,
    );
    assert.equal(module.topics.length, 0);
    assert.equal(usages[1].succeeded, false);
  } finally {
    globalThis.fetch = originalFetch;
    LearningModule.findOne = originalFindOne;
    LearningAiUsage.create = originalUsageCreate;
    Object.assign(config, originalConfig);
  }
});
