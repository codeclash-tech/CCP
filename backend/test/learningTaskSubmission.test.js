import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import LearningAiUsage from "../src/models/LearningAiUsage.js";
import LearningCertificate from "../src/models/LearningCertificate.js";
import LearningModule from "../src/models/LearningModule.js";
import LearningModuleVersion from "../src/models/LearningModuleVersion.js";
import LearningProgress from "../src/models/LearningProgress.js";
import LearningProgram from "../src/models/LearningProgram.js";
import LearningPurchase from "../src/models/LearningPurchase.js";
import LearningSession from "../src/models/LearningSession.js";
import config from "../src/config/env.js";
import { executionService } from "../src/services/executionService.js";
import { submitLearningExercise } from "../src/services/learningService.js";

async function withLearningStubs({ module, progress, session, execute }, callback) {
  const patches = [
    [LearningModule, "findOne", () => ({ select: async () => ({
      _id: module._id,
      programId: module.programId,
      currentPublishedVersion: 1,
      prerequisites: [],
    }) })],
    [LearningModule, "findById", async () => module],
    [LearningModuleVersion, "findOne", () => ({ lean: async () => null })],
    [LearningProgram, "exists", async () => ({ _id: module.programId })],
    [LearningPurchase, "findOne", async () => ({ status: "ACTIVE", accessExpiresAt: null })],
    [LearningProgress, "findOneAndUpdate", async () => progress],
    [LearningSession, "findOne", async () => session],
    [LearningCertificate, "findOneAndUpdate", async () => null],
    [LearningAiUsage, "create", async () => ({})],
    [LearningProgress.prototype, "save", async function saveProgress() { return this; }],
    [LearningSession.prototype, "save", async function saveSession() { return this; }],
    [executionService, "execute", execute],
  ];
  const originals = patches.map(([target, name]) => [target, name, target[name]]);
  for (const [target, name, replacement] of patches) target[name] = replacement;
  try {
    return await callback();
  } finally {
    for (const [target, name, original] of originals) target[name] = original;
  }
}

function createFixture(exercise) {
  const userId = new mongoose.Types.ObjectId();
  const moduleId = new mongoose.Types.ObjectId();
  const programId = new mongoose.Types.ObjectId();
  const topicId = new mongoose.Types.ObjectId();
  const sessionId = new mongoose.Types.ObjectId();
  const module = new LearningModule({
    _id: moduleId,
    programId,
    title: "Foundations",
    description: "Learning foundations.",
    sequence: 1,
    estimatedDurationMinutes: 60,
    status: "PUBLISHED",
    currentPublishedVersion: 1,
    topics: [{
      _id: topicId,
      title: "Current topic",
      description: "Practice one objective.",
      objectiveDefinitions: [{
        key: "task-objective",
        title: "Demonstrate the concept",
        description: "Demonstrate the concept correctly.",
        expectedOutcome: "Apply the concept.",
        masteryCriteria: [{
          key: "task-criterion",
          description: "Complete the task accurately.",
          evaluationMethod: exercise.type === "CODE" ? "CODE" : "CALCULATION",
          requiredEvidenceCount: 1,
        }],
      }],
      exercises: [exercise],
    }],
  });
  const progress = {
    userId,
    moduleId,
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
    async save() { return this; },
  };
  const session = new LearningSession({
    _id: sessionId,
    userId,
    moduleId,
    moduleVersion: 1,
    topicId,
    language: "en",
    learningStage: "OBJECTIVE_VERIFICATION",
    awaitingTeachingIntroduction: false,
  });
  return { userId, module, progress, session, topicId, exercise: module.topics[0].exercises[0] };
}

test("mathematics task uses deterministic expression evaluation and records calculation evidence", async () => {
  const fixture = createFixture({
    type: "MATH",
    title: "Calculate the result",
    instructions: "Evaluate the expression.",
    objectiveKeys: ["task-objective"],
    expectedAnswer: "4",
    numericTolerance: 0,
    requireReasoning: false,
    tests: [],
  });
  let runnerCalls = 0;
  await withLearningStubs({
    ...fixture,
    execute: async () => {
      runnerCalls += 1;
      throw new Error("Mathematics must not use Java execution.");
    },
  }, async () => {
    const request = () => submitLearningExercise(
      fixture.userId,
      fixture.module._id,
      fixture.topicId,
      fixture.exercise._id,
      { answer: "(10 - 2) / 2" },
      null,
      { sessionId: fixture.session._id },
    );
    const result = await request();
    const replay = await request();

    assert.equal(result.accepted, true);
    assert.equal(replay.accepted, true);
    assert.equal(result.status, "CORRECT");
    assert.deepEqual(fixture.progress.completedObjectiveKeys, [`${fixture.topicId}:task-objective`]);
    assert.equal(fixture.progress.objectiveEvidence[0].sourceType, "MATH_TASK");
    assert.equal(fixture.progress.taskAttempts.length, 1);
    assert.equal(runnerCalls, 0);
  });
});

test("incorrect deterministic answers receive a progressive hint without answer leakage", async () => {
  const fixture = createFixture({
    type: "MATH",
    title: "Calculate the result",
    instructions: "Evaluate the expression.",
    objectiveKeys: ["task-objective"],
    expectedAnswer: "4",
    numericTolerance: 0,
    requireReasoning: false,
    tests: [],
  });
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    AI_PROVIDER: config.AI_PROVIDER,
    AI_MODEL: config.AI_MODEL,
    AI_BASE_URL: config.AI_BASE_URL,
    AI_API_KEY: config.AI_API_KEY,
    AI_TIMEOUT_MS: config.AI_TIMEOUT_MS,
  };
  let requestBody;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://hint-provider/api/chat");
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            reply: "Think about the order in which the operations are applied.",
          }),
        },
      }),
    };
  };
  Object.assign(config, {
    AI_PROVIDER: "ollama",
    AI_MODEL: "hint-test-model",
    AI_BASE_URL: "http://hint-provider",
    AI_API_KEY: "",
    AI_TIMEOUT_MS: "1000",
  });

  try {
    await withLearningStubs({
      ...fixture,
      execute: async () => {
        throw new Error("Mathematics must not use Java execution.");
      },
    }, async () => {
      const result = await submitLearningExercise(
        fixture.userId,
        fixture.module._id,
        fixture.topicId,
        fixture.exercise._id,
        { answer: "2" },
        null,
        { sessionId: fixture.session._id },
      );

      assert.equal(result.accepted, false);
      assert.match(result.feedback, /order in which the operations are applied/i);
      assert.match(requestBody.messages[0].content, /hint level 1/i);
      assert.equal(JSON.stringify(requestBody).includes('"expectedAnswer"'), false);
      assert.equal(fixture.progress.completedObjectiveKeys.length, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(config, originalConfig);
  }
});

test("Java tasks use the secure runner, hide hidden test results, and replay idempotently", async () => {
  const fixture = createFixture({
    type: "CODE",
    title: "Write a Java method",
    instructions: "Return the sum of two values.",
    language: "java",
    objectiveKeys: ["task-objective"],
    criterionKeys: ["task-criterion"],
    tests: [
      { input: "1 2", expectedOutput: "3", visible: true },
      { input: "10 15", expectedOutput: "25", visible: false },
    ],
  });
  let runnerCalls = 0;
  let sentTests = [];
  await withLearningStubs({
    ...fixture,
    execute: async (_code, tests) => {
      runnerCalls += 1;
      sentTests = tests;
      return {
        accepted: true,
        status: "ACCEPTED",
        passed: 2,
        total: 2,
        results: [
          { testCase: 1, status: "PASSED", output: "3", executionTime: 1 },
          { testCase: 2, status: "PASSED", output: "25", executionTime: 1 },
        ],
      };
    },
  }, async () => {
    const request = () => submitLearningExercise(
      fixture.userId,
      fixture.module._id,
      fixture.topicId,
      fixture.exercise._id,
      "class Solution { }",
      null,
      { sessionId: fixture.session._id, idempotencyKey: "code-attempt-1" },
    );
    const result = await request();
    const replay = await request();

    assert.equal(result.accepted, true);
    assert.equal(result.status, "ACCEPTED");
    assert.equal(runnerCalls, 1);
    assert.equal(sentTests.length, 2);
    assert.equal(result.visibleResults.length, 1);
    assert.equal(JSON.stringify(result).includes("10 15"), false);
    assert.equal(result.visibleResults.some((visible) => visible.output === "25"), false);
    assert.deepEqual(fixture.progress.completedObjectiveKeys, [`${fixture.topicId}:task-objective`]);
    assert.equal(replay.accepted, true);
    assert.equal(fixture.progress.taskAttempts.length, 1);
    assert.equal(fixture.progress.taskAttempts[0].duplicateCount, 1);
    assert.equal(fixture.session.learningStage, "TOPIC_COMPLETED");
    assert.equal(fixture.session.messages.length, 2);
  });
});

test("failed Java tasks receive a hint without sending hidden test outputs to the tutor", async () => {
  const fixture = createFixture({
    type: "CODE",
    title: "Write a Java method",
    instructions: "Return the sum of two values.",
    language: "java",
    objectiveKeys: ["task-objective"],
    criterionKeys: ["task-criterion"],
    tests: [
      { input: "1 2", expectedOutput: "3", visible: true },
      { input: "10 15", expectedOutput: "25", visible: false },
    ],
  });
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    AI_PROVIDER: config.AI_PROVIDER,
    AI_MODEL: config.AI_MODEL,
    AI_BASE_URL: config.AI_BASE_URL,
    AI_API_KEY: config.AI_API_KEY,
    AI_TIMEOUT_MS: config.AI_TIMEOUT_MS,
  };
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            reply: "Trace how each input value contributes to the result.",
          }),
        },
      }),
    };
  };
  Object.assign(config, {
    AI_PROVIDER: "ollama",
    AI_MODEL: "hint-test-model",
    AI_BASE_URL: "http://hint-provider",
    AI_API_KEY: "",
    AI_TIMEOUT_MS: "1000",
  });

  try {
    await withLearningStubs({
      ...fixture,
      execute: async () => ({
        accepted: false,
        status: "WRONG_ANSWER",
        passed: 0,
        total: 2,
        results: [
          { testCase: 1, status: "FAILED", output: "wrong", executionTime: 1 },
          { testCase: 2, status: "FAILED", output: "secret-output", executionTime: 1 },
        ],
      }),
    }, async () => {
      const result = await submitLearningExercise(
        fixture.userId,
        fixture.module._id,
        fixture.topicId,
        fixture.exercise._id,
        "class Solution { }",
        null,
        { sessionId: fixture.session._id },
      );

      assert.equal(result.accepted, false);
      assert.match(result.feedback, /Trace how each input value/i);
      assert.equal(JSON.stringify(requestBody).includes("secret-output"), false);
      assert.equal(JSON.stringify(requestBody).includes("25"), false);
      assert.equal(result.visibleResults.length, 1);
      assert.equal(fixture.progress.completedObjectiveKeys.length, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(config, originalConfig);
  }
});

test("verification tasks cannot be submitted during the teaching stage", async () => {
    const fixture = createFixture({
      type: "MATH",
      title: "Calculate the result",
      instructions: "Evaluate the expression.",
      objectiveKeys: ["task-objective"],
      expectedAnswer: "4",
      numericTolerance: 0,
      requireReasoning: false,
      tests: [],
    });
    fixture.session.learningStage = "TEACHING";
    await withLearningStubs({
      ...fixture,
      execute: async () => {
        throw new Error("Mathematics must not use Java execution.");
      },
    }, async () => {
      await assert.rejects(
        submitLearningExercise(
          fixture.userId,
          fixture.module._id,
          fixture.topicId,
          fixture.exercise._id,
          { answer: "4" },
          null,
          { sessionId: fixture.session._id },
        ),
        /Finish the teaching conversation before submitting a verification task/,
      );
      assert.equal(fixture.progress.taskAttempts.length, 0);
  });
});

test("a concurrent key reuse with a different Java submission is rejected", async () => {
  const fixture = createFixture({
    type: "CODE",
    title: "Write a Java method",
    instructions: "Return the sum of two values.",
    language: "java",
    objectiveKeys: ["task-objective"],
    criterionKeys: ["task-criterion"],
    tests: [{ input: "1 2", expectedOutput: "3", visible: true }],
  });
  let releaseRunner;
  let runnerStarted;
  const started = new Promise((resolve) => { runnerStarted = resolve; });
  const runnerGate = new Promise((resolve) => { releaseRunner = resolve; });
  let runnerCalls = 0;

  await withLearningStubs({
    ...fixture,
    execute: async () => {
      runnerCalls += 1;
      runnerStarted();
      await runnerGate;
      return {
        accepted: true,
        status: "ACCEPTED",
        passed: 1,
        total: 1,
        results: [{ testCase: 1, status: "PASSED", output: "3", executionTime: 1 }],
      };
    },
  }, async () => {
    const first = submitLearningExercise(
      fixture.userId,
      fixture.module._id,
      fixture.topicId,
      fixture.exercise._id,
      "class Solution { }",
      null,
      { sessionId: fixture.session._id, idempotencyKey: "shared-key" },
    );
    await started;
    await assert.rejects(
      submitLearningExercise(
        fixture.userId,
        fixture.module._id,
        fixture.topicId,
        fixture.exercise._id,
        "class Solution { int different() { return 1; } }",
        null,
        { sessionId: fixture.session._id, idempotencyKey: "shared-key" },
      ),
      /already used for a different response/,
    );
    releaseRunner();
    const result = await first;

    assert.equal(result.accepted, true);
    assert.equal(runnerCalls, 1);
    assert.equal(fixture.progress.taskAttempts.length, 1);
  });
});
