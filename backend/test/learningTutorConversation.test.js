import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import LearningCertificate from "../src/models/LearningCertificate.js";
import LearningAiUsage from "../src/models/LearningAiUsage.js";
import LearningModule from "../src/models/LearningModule.js";
import LearningModuleVersion from "../src/models/LearningModuleVersion.js";
import LearningProgress from "../src/models/LearningProgress.js";
import LearningProgram from "../src/models/LearningProgram.js";
import LearningPurchase from "../src/models/LearningPurchase.js";
import LearningSession from "../src/models/LearningSession.js";
import config from "../src/config/env.js";
import { askLearningTutor } from "../src/services/learningService.js";

test("Groq tutor receives the student's current question and preserves the session", async () => {
  const userId = new mongoose.Types.ObjectId();
  const moduleId = new mongoose.Types.ObjectId();
  const programId = new mongoose.Types.ObjectId();
  const topicId = new mongoose.Types.ObjectId();
  const sessionId = new mongoose.Types.ObjectId();
  const module = new LearningModule({
    _id: moduleId,
    programId,
    title: "Java basics",
    currentPublishedVersion: 1,
    aiConfiguration: { behaviorPrompt: "Use friendly analogies." },
    topics: [{
      _id: topicId,
      title: "Variables",
      description: "Store values in named variables.",
      objectives: ["Explain that a variable stores a value."],
    }],
  });
  const objectiveProgress = new LearningProgress({
    userId,
    moduleId,
    moduleVersion: 1,
  });
  const session = new LearningSession({
    _id: sessionId,
    userId,
    moduleId,
    moduleVersion: 1,
    topicId,
    language: "en",
    messages: [
      { role: "user", content: "What is a variable?" },
      { role: "assistant", content: "It is a named place to store a value." },
    ],
  });
  let requestBody;
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    AI_PROVIDER: config.AI_PROVIDER,
    AI_MODEL: config.AI_MODEL,
    AI_BASE_URL: config.AI_BASE_URL,
    AI_API_KEY: config.AI_API_KEY,
    AI_TIMEOUT_MS: config.AI_TIMEOUT_MS,
  };
  const patches = [
    [LearningSession, "findOne", async () => session],
    [LearningSession.prototype, "save", async function saveSession() { return this; }],
    [LearningModule, "findOne", () => ({ select: async () => module })],
    [LearningModule, "findById", async () => module],
    [LearningModuleVersion, "findOne", () => ({ lean: async () => null })],
    [LearningProgram, "exists", async () => ({ _id: programId })],
    [LearningPurchase, "findOne", async () => ({ status: "ACTIVE", accessExpiresAt: null })],
    [LearningProgress, "findOne", () => ({
      select: () => ({
        lean: async () => ({
          completedTopicIds: [],
          completedObjectiveKeys: [],
          completedExerciseIds: [],
          assessmentPassed: false,
        }),
      }),
    })],
    [LearningProgress, "findOneAndUpdate", async () => objectiveProgress],
    [LearningProgress.prototype, "save", async function saveProgress() { return this; }],
    [LearningCertificate, "findOneAndUpdate", async () => null],
    [LearningAiUsage, "create", async () => ({})],
  ];
  const originals = patches.map(([target, name]) => [target, name, target[name]]);

  config.AI_PROVIDER = "groq";
  config.AI_MODEL = "openai/gpt-oss-20b";
  config.AI_BASE_URL = "https://api.groq.com/openai/v1";
  config.AI_API_KEY = "test-groq-key";
  config.AI_TIMEOUT_MS = "1000";
  for (const [target, name, replacement] of patches) target[name] = replacement;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "A variable stores a value. What can you use a variable to store?",
              masteredObjectiveIndexes: [0, 999],
            }),
          },
        }],
      }),
    };
  };

  try {
    const result = await askLearningTutor(
      userId,
      sessionId,
      "A variable stores a value, such as a score.",
      "ta",
      true,
      "Kai",
    );
    const conversation = requestBody.messages.slice(1);

    assert.deepEqual(conversation.map(({ role, content }) => ({ role, content })), [
      { role: "user", content: "What is a variable?" },
      { role: "assistant", content: "It is a named place to store a value." },
      { role: "user", content: "A variable stores a value, such as a score." },
    ]);
    assert.match(requestBody.messages[0].content, /Explain that a variable stores a value/);
    assert.match(requestBody.messages[0].content, /Student nickname: "Kai"/);
    assert.match(requestBody.messages[0].content, /Teach one incomplete objective at a time/);
    assert.match(
      requestBody.messages[0].content,
      /English speech transcript and may contain recognition errors/,
    );
    assert.match(
      requestBody.messages[0].content,
      /Always reply in clear, simple English/,
    );
    assert.match(
      requestBody.messages[0].content,
      /Never use emojis, markdown/,
    );
    assert.equal(result.reply, "A variable stores a value. What can you use a variable to store?");
    assert.equal(result.replyLanguage, "en");
    assert.equal(session.language, "en");
    assert.deepEqual(objectiveProgress.completedObjectiveKeys, [`${topicId}:0`]);
    assert.deepEqual(objectiveProgress.completedTopicIds.map(String), [String(topicId)]);
    assert.equal(result.progress.progressPercentage, 100);
    assert.deepEqual(
      session.messages.slice(-2).map(({ role, content }) => ({ role, content })),
      [
        { role: "user", content: "A variable stores a value, such as a score." },
        { role: "assistant", content: "A variable stores a value. What can you use a variable to store?" },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [target, name, original] of originals) target[name] = original;
    Object.assign(config, originalConfig);
  }
});
