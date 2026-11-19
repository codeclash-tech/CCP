import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
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
      explanation: "A variable stores a value.",
      tutorInstructions: "Explain one idea at a time.",
      validationInstructions: "Offer a hint before feedback.",
    }],
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
          completedExerciseIds: [],
          assessmentPassed: false,
        }),
      }),
    })],
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
        choices: [{ message: { content: "Let's practice with a simple example." } }],
      }),
    };
  };

  try {
    const result = await askLearningTutor(
      userId,
      sessionId,
      "Can you show me an example?",
      "en",
    );
    const conversation = requestBody.messages.slice(1);

    assert.deepEqual(conversation.map(({ role, content }) => ({ role, content })), [
      { role: "user", content: "What is a variable?" },
      { role: "assistant", content: "It is a named place to store a value." },
      { role: "user", content: "Can you show me an example?" },
    ]);
    assert.match(requestBody.messages[0].content, /A variable stores a value/);
    assert.match(requestBody.messages[0].content, /Use friendly analogies/);
    assert.equal(result.reply, "Let's practice with a simple example.");
    assert.deepEqual(
      session.messages.slice(-2).map(({ role, content }) => ({ role, content })),
      [
        { role: "user", content: "Can you show me an example?" },
        { role: "assistant", content: "Let's practice with a simple example." },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [target, name, original] of originals) target[name] = original;
    Object.assign(config, originalConfig);
  }
});
