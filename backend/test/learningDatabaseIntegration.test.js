import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import LearningAiUsage from "../src/models/LearningAiUsage.js";
import LearningCertificate from "../src/models/LearningCertificate.js";
import LearningModule from "../src/models/LearningModule.js";
import LearningModuleVersion from "../src/models/LearningModuleVersion.js";
import LearningProgress from "../src/models/LearningProgress.js";
import LearningPurchase from "../src/models/LearningPurchase.js";
import LearningProgram from "../src/models/LearningProgram.js";
import LearningSession from "../src/models/LearningSession.js";
import LearningTopicVersion from "../src/models/LearningTopicVersion.js";
import config from "../src/config/env.js";
import {
  askLearningTutor,
  completeLearningTopic,
  createLearningModule,
  createLearningProgram,
  createLearningPurchase,
  createLearningTopic,
  getLearningSession,
  requestLearningSession,
  setLearningModuleStatus,
  submitLearningExercise,
  updateLearningProgram,
  updateLearningTopic,
} from "../src/services/learningService.js";

const testUri = process.env.MONGODB_TEST_URI;
const indexedModels = [
  User,
  LearningAiUsage,
  LearningCertificate,
  LearningModule,
  LearningModuleVersion,
  LearningProgress,
  LearningPurchase,
  LearningProgram,
  LearningSession,
  LearningTopicVersion,
];

test("isolated MongoDB learner journey publishes, resumes, evaluates, and certifies", {
  skip: !testUri,
}, async () => {
  const parsedUri = new URL(testUri);
  const databaseName = decodeURIComponent(parsedUri.pathname.slice(1));
  assert.match(
    databaseName,
    /^ccp_phase3_test_[a-z0-9_-]+$/i,
    "MONGODB_TEST_URI must target a uniquely named ccp_phase3_test_* database",
  );
  const previousFetch = globalThis.fetch;
  const previousConfig = {
    AI_PROVIDER: config.AI_PROVIDER,
    AI_MODEL: config.AI_MODEL,
    AI_BASE_URL: config.AI_BASE_URL,
    AI_API_KEY: config.AI_API_KEY,
    AI_TIMEOUT_MS: config.AI_TIMEOUT_MS,
  };
  let connected = false;
  try {
    await mongoose.connect(testUri, { serverSelectionTimeoutMS: 5000 });
    connected = true;
    await mongoose.connection.dropDatabase();
    await Promise.all(indexedModels.map((model) => model.syncIndexes()));

    const admin = await User.create({
      email: `phase3-admin-${Date.now()}@example.test`,
      name: "Integration Admin",
      role: "ADMIN",
    });
    const student = await User.create({
      email: `phase3-student-${Date.now()}@example.test`,
      name: "Complete Beginner",
    });
    const existingKnowledgeStudent = await User.create({
      email: `phase3-known-${Date.now()}@example.test`,
      name: "Existing Knowledge Student",
    });
    const program = await createLearningProgram(admin._id, {
      title: "Python Output",
      description: "Understand program output and calculate simple values.",
    });
    const module = await createLearningModule(program._id, {
      title: "Output foundations",
      description: "A test module with fixed objectives.",
      price: 0,
      completionRequirements: {
        minCompletedTopics: 1,
        requiredExercises: 0,
        requireAssessment: false,
      },
    });
    const topic = await createLearningTopic(module._id, {
      title: "Output and ratios",
      description: "Interpret output and calculate a ratio.",
      explanation: "Version one approved explanation.",
      objectiveDefinitions: [
        {
          key: "output-meaning",
          title: "Explain output",
          description: "Explain what program output means.",
          expectedOutcome: "Explain that output is information displayed by a program.",
          masteryCriteria: [{
            key: "displayed-information",
            description: "Explain that output is information displayed by a program.",
            evaluationMethod: "EXPLANATION",
            requiredEvidenceCount: 1,
          }],
        },
        {
          key: "ratio-calculation",
          title: "Calculate a ratio",
          description: "Evaluate a ratio as a numeric result.",
          expectedOutcome: "Calculate the expected ratio.",
          prerequisites: ["output-meaning"],
          masteryCriteria: [{
            key: "ratio-result",
            description: "Calculate the ratio correctly.",
            evaluationMethod: "CALCULATION",
            requiredEvidenceCount: 1,
          }],
        },
      ],
      exercises: [{
        type: "MATH",
        title: "Calculate one half",
        instructions: "Evaluate one half.",
        expectedAnswer: "0.5",
        numericTolerance: 0,
        objectiveKeys: ["ratio-calculation"],
        criterionKeys: ["ratio-result"],
      }],
    });
    await setLearningModuleStatus(module._id, "PUBLISHED");
    await updateLearningProgram(admin._id, program._id, { status: "PUBLISHED" });

    const publishedModule = await LearningModule.findById(module._id).lean();
    assert.equal(publishedModule.currentPublishedVersion, 1);
    assert.equal(publishedModule.status, "PUBLISHED");
    const originalTopicVersion = await LearningTopicVersion.findOne({
      moduleId: module._id,
      moduleVersion: 1,
      topicId: topic._id,
    }).lean();
    assert.equal(originalTopicVersion.topicSnapshot.explanation, "Version one approved explanation.");

    const { purchase } = await createLearningPurchase(student._id, {
      moduleId: module._id,
    });
    await createLearningPurchase(existingKnowledgeStudent._id, { moduleId: module._id });
    assert.equal(purchase.status, "ACTIVE");
    await assert.rejects(
      requestLearningSession(new mongoose.Types.ObjectId(), module._id, topic._id, "en"),
      /Purchase this module/,
    );

    const firstSession = await requestLearningSession(student._id, module._id, topic._id, "en");
    const resumedSession = await requestLearningSession(student._id, module._id, topic._id, "en");
    assert.equal(String(resumedSession._id), String(firstSession._id));
    assert.equal(resumedSession.moduleVersion, 1);
    const knownStudentSession = await requestLearningSession(
      existingKnowledgeStudent._id,
      module._id,
      topic._id,
      "en",
    );
    assert.equal(knownStudentSession.messages.length, 0);

    await updateLearningTopic(module._id, topic._id, {
      explanation: "Version two explanation for future learners.",
    });
    const updatedModule = await LearningModule.findById(module._id).lean();
    assert.equal(updatedModule.currentPublishedVersion, 2);
    const preservedVersion = await LearningTopicVersion.findOne({
      moduleId: module._id,
      moduleVersion: 1,
      topicId: topic._id,
    }).lean();
    assert.equal(preservedVersion.topicSnapshot.explanation, "Version one approved explanation.");

    const progress = await LearningProgress.findOne({
      userId: student._id,
      moduleId: module._id,
    });
    assert.equal(progress.moduleVersion, 1);
    progress.moduleVersion = 2;
    await progress.save();
    await assert.rejects(
      submitLearningExercise(
        student._id,
        module._id,
        topic._id,
        topic.exercises[0]._id,
        { answer: "1/2" },
        null,
        { sessionId: firstSession._id },
      ),
      /topic version/,
    );
    await LearningProgress.updateOne(
      { _id: progress._id },
      { $set: { moduleVersion: 1 } },
    );
    await assert.rejects(
      submitLearningExercise(
        student._id,
        module._id,
        topic._id,
        topic.exercises[0]._id,
        { answer: "1/2" },
        null,
        { sessionId: firstSession._id },
      ),
      /not available for the current learning objective/,
    );

    config.AI_PROVIDER = "ollama";
    config.AI_MODEL = "integration-test-model";
    config.AI_BASE_URL = "http://integration-test-provider";
    config.AI_API_KEY = "";
    config.AI_TIMEOUT_MS = "1000";
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "http://integration-test-provider/api/chat");
      const request = JSON.parse(options.body);
      assert.match(request.messages.at(-1).content, /Output is information shown to a user/);
      return {
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              reply: "Correct. Output is information displayed by a program.",
              objectiveEvidence: [{
                objectiveKey: "output-meaning",
                criteria: [{
                  criterionKey: "displayed-information",
                  demonstrated: true,
                  evidenceQuote: "Output is information shown to a user",
                  confidence: 0.98,
                  demonstratedConcepts: ["program output"],
                }],
              }],
            }),
          },
          prompt_eval_count: 21,
          eval_count: 9,
        }),
      };
    };
    const tutorResult = await askLearningTutor(
      student._id,
      firstSession._id,
      "Output is information shown to a user.",
      "en",
    );
    assert.equal(tutorResult.evaluation.correctness, "correct");
    assert.equal(tutorResult.objectiveProgress[0].state, "MASTERED");
    assert.equal(tutorResult.session.messages.length, 2);
    const resumedAfterInterruption = await getLearningSession(student._id, firstSession._id);
    assert.equal(resumedAfterInterruption.topic.explanation, "Version one approved explanation.");
    assert.equal(resumedAfterInterruption.session.messages.length, 2);
    const knownStudentResult = await askLearningTutor(
      existingKnowledgeStudent._id,
      knownStudentSession._id,
      "Output is information shown to a user.",
      "en",
    );
    assert.equal(knownStudentResult.evaluation.correctness, "correct");
    const knownStudentProgress = await LearningProgress.findOne({
      userId: existingKnowledgeStudent._id,
      moduleId: module._id,
    }).lean();
    assert.equal(knownStudentProgress.objectiveProfiles[0].demonstratedCount, 1);
    assert.equal(knownStudentProgress.objectiveProfiles[0].moduleVersion, 1);

    const mathExerciseId = topic.exercises[0]._id;
    const submissionOptions = {
      sessionId: firstSession._id,
      idempotencyKey: "phase3-math-attempt-1",
    };
    const concurrentSubmissions = await Promise.all([
      submitLearningExercise(
        student._id,
        module._id,
        topic._id,
        mathExerciseId,
        { answer: "1/2" },
        null,
        submissionOptions,
      ),
      submitLearningExercise(
        student._id,
        module._id,
        topic._id,
        mathExerciseId,
        { answer: "1/2" },
        null,
        submissionOptions,
      ),
    ]);
    assert.equal(concurrentSubmissions[0].accepted, true);
    assert.equal(concurrentSubmissions[1].accepted, true);
    const storedProgress = await LearningProgress.findOne({
      userId: student._id,
      moduleId: module._id,
    }).lean();
    assert.equal(storedProgress.taskAttempts.length, 1);
    assert.equal(storedProgress.taskAttempts[0].duplicateCount, 1);
    assert.ok(storedProgress.taskAttempts[0].evaluationTimeMs >= 0);
    assert.equal(storedProgress.completedObjectiveKeys.length, 2);
    assert.equal(storedProgress.moduleVersion, 1);

    const completion = await completeLearningTopic(student._id, module._id, topic._id);
    assert.equal(completion.passed, true);
    assert.equal(completion.scorePercent, 100);
    assert.ok(completion.certificate);
    const certificate = await LearningCertificate.findOne({
      userId: student._id,
      moduleId: module._id,
    }).lean();
    assert.equal(certificate.moduleVersion, 1);
    const usage = await LearningAiUsage.findOne({
      userId: student._id,
      objectiveKey: "output-meaning",
    }).lean();
    assert.equal(usage.promptTokens, 21);
    assert.equal(usage.completionTokens, 9);
    assert.equal(usage.totalTokens, 30);
  } finally {
    globalThis.fetch = previousFetch;
    Object.assign(config, previousConfig);
    if (connected) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
