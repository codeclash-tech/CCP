import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import LearningAiUsage from "../models/LearningAiUsage.js";
import LearningAssessmentAttempt from "../models/LearningAssessmentAttempt.js";
import LearningCertificate from "../models/LearningCertificate.js";
import LearningModule from "../models/LearningModule.js";
import LearningModuleVersion from "../models/LearningModuleVersion.js";
import LearningPaymentEvent from "../models/LearningPaymentEvent.js";
import LearningProgress from "../models/LearningProgress.js";
import LearningProgram from "../models/LearningProgram.js";
import LearningPurchase from "../models/LearningPurchase.js";
import LearningSession from "../models/LearningSession.js";
import LearningTopicVersion from "../models/LearningTopicVersion.js";
import config from "../config/env.js";
import { executionService } from "./executionService.js";
import { createTutorProvider } from "./learningAiProvider.js";
import { dispatchLearningCertificateEmail } from "./learningCertificateNotificationService.js";
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  getRazorpayPayment,
  toMinorUnitAmount,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from "./razorpayService.js";
import {
  evaluateLearningAssessment,
  meetsModuleCompletionRequirements,
} from "./learningProgress.js";
import {
  evaluateObjectiveEvidence,
  getObjectiveProgress,
  getTopicObjectives,
  objectiveProgressKey,
} from "./learningObjectiveEngine.js";
import { evaluateMathematicsTask } from "./learningTaskEngine.js";

const MAX_PAGE_SIZE = 50;
const MAX_SESSION_MESSAGES = 40;
const MAX_OBJECTIVE_EVIDENCE = 500;
const MAX_TASK_ATTEMPTS = 100;
const taskSubmissionsInFlight = new Map();
const LEARNING_EVALUATION_METHODS = new Set([
  "EXPLANATION",
  "IDENTIFICATION",
  "PREDICTION",
  "COMPARISON",
  "APPLICATION",
  "ANALYSIS",
  "CALCULATION",
  "DIAGRAM",
  "PROCEDURE",
  "CODE",
  "DEBUGGING",
  "PRACTICAL",
]);
function normalizeTutorLanguage() {
  return "en";
}

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
function normalizePage(value, fallback) {
  const page = Number.parseInt(value, 10);
  return Number.isInteger(page) && page > 0 ? page : fallback;
}

function id(value) {
  return String(value?._id || value || "");
}

function sameId(left, right) {
  return id(left) === id(right);
}

function aiUsageFields(reply, objectiveKey = "") {
  const usage = reply?.usage || {};
  return {
    objectiveKey,
    ...(Number.isInteger(usage.promptTokens) && usage.promptTokens >= 0
      ? { promptTokens: usage.promptTokens }
      : {}),
    ...(Number.isInteger(usage.completionTokens) && usage.completionTokens >= 0
      ? { completionTokens: usage.completionTokens }
      : {}),
    ...(Number.isInteger(usage.totalTokens) && usage.totalTokens >= 0
      ? { totalTokens: usage.totalTokens }
      : {}),
  };
}

function getTopic(module, topicId) {
  return module.topics.id(topicId);
}

function studentQuestion(question) {
  const result = question.toObject ? question.toObject() : { ...question };
  delete result.expectedAnswer;
  delete result.acceptedAnswers;
  return result;
}

function studentExercise(exercise) {
  const result = exercise.toObject ? exercise.toObject() : { ...exercise };
  if (!result.objectiveKeys?.length) delete result.objectiveKeys;
  delete result.criterionKeys;
  delete result.expectedAnswer;
  delete result.acceptedAnswers;
  delete result.numericTolerance;
  result.tests = (result.tests || [])
    .filter((testCase) => testCase.visible)
    .map(({ expectedOutput, ...testCase }) => testCase);
  return result;
}

function applyEvidenceDecision(progress, decision, topic) {
  if (!decision.evidence.length) return false;
  progress.objectiveEvidence = [
    ...(progress.objectiveEvidence || []),
    ...decision.evidence,
  ].slice(-MAX_OBJECTIVE_EVIDENCE);
  progress.objectiveProfiles ||= [];
  const profile = progress.objectiveProfiles.find(
    (item) =>
      item.objectiveKey === decision.targetObjectiveKey &&
      Number(item.moduleVersion) === Number(progress.moduleVersion),
  );
  const evaluationResults = decision.evidence.flatMap((item) => item.criteria || []);
  const evidenceSignals = evaluationResults.reduce(
    (signals, item) => ({
      missingConcepts: [...signals.missingConcepts, ...(item.missingConcepts || [])],
      misconceptions: [...signals.misconceptions, ...(item.misconceptions || [])],
    }),
    { missingConcepts: [], misconceptions: [] },
  );
  const profileUpdate = {
    objectiveKey: decision.targetObjectiveKey,
    moduleVersion: progress.moduleVersion,
    demonstratedCount: (profile?.demonstratedCount || 0) +
      evaluationResults.filter((item) => item.demonstrated).length,
    missingConcepts: [...new Set(evidenceSignals.missingConcepts)].slice(-12),
    misconceptions: [...new Set(evidenceSignals.misconceptions)].slice(-12),
    teachingSignals: [
      ...new Set([
        ...(profile?.teachingSignals || []),
        ...evidenceSignals.missingConcepts.map(() => "TARGETED_EXPLANATION"),
        ...evidenceSignals.misconceptions.map(() => "MISCONCEPTION_CORRECTION"),
      ]),
    ].slice(-6),
    updatedAt: new Date(),
  };
  if (profile) Object.assign(profile, profileUpdate);
  else progress.objectiveProfiles.push(profileUpdate);

  const completedKeys = new Set((progress.completedObjectiveKeys || []).map(String));
  for (const key of decision.masteredObjectiveKeys) {
    completedKeys.add(objectiveProgressKey(topic._id, key));
  }
  progress.completedObjectiveKeys = [...completedKeys];
  const statesAfterEvaluation = getObjectiveProgress(topic, progress);
  const topicComplete = statesAfterEvaluation.length > 0 &&
    statesAfterEvaluation.every((state) => state.state === "MASTERED");
  progress.completedTopicIds ||= [];
  if (
    topicComplete &&
    !progress.completedTopicIds.some((currentId) => sameId(currentId, topic._id))
  ) {
    progress.completedTopicIds.push(new mongoose.Types.ObjectId(topic._id));
  }
  return true;
}

function validateTopicTasks(topic) {
  const objectives = topic.objectiveDefinitions || [];
  const objectiveKeys = new Set(objectives.map((objective) => String(objective.key)));
  const exercises = [
    ...(topic.exercises || []),
    ...(topic.subtopics || []).flatMap((subtopic) => subtopic.exercises || []),
  ];
  for (const exercise of exercises) {
    const linkedObjectives = (exercise.objectiveKeys || []).map(String);
    const linkedCriteria = (exercise.criterionKeys || []).map(String);
    if (
      new Set(linkedObjectives).size !== linkedObjectives.length ||
      linkedObjectives.some((key) => !objectiveKeys.has(key))
    ) {
      throw requestError(`Task "${exercise.title}" must reference valid, unique objective keys.`);
    }
    if (!objectives.length || !linkedObjectives.length) continue;
    const allowedCriteria = new Set(
      objectives
        .filter((objective) => linkedObjectives.includes(String(objective.key)))
        .flatMap((objective) => (objective.masteryCriteria || []).map((criterion) => String(criterion.key))),
    );
    if (
      new Set(linkedCriteria).size !== linkedCriteria.length ||
      linkedCriteria.some((key) => !allowedCriteria.has(key))
    ) {
      throw requestError(`Task "${exercise.title}" must reference mastery criteria from its linked objectives.`);
    }
    if (exercise.type === "CODE") {
      const codeCriteria = linkedObjectives.flatMap((key) =>
        objectives.find((objective) => String(objective.key) === key)?.masteryCriteria || [],
      ).filter((criterion) =>
        (!linkedCriteria.length || linkedCriteria.includes(String(criterion.key))) &&
        ["CODE", "DEBUGGING", "PRACTICAL"].includes(criterion.evaluationMethod),
      );
      if (
        String(exercise.language || "java").toLowerCase() !== "java" ||
        !Array.isArray(exercise.tests) ||
        exercise.tests.length < 1 ||
        exercise.tests.length > 50 ||
        !codeCriteria.length
      ) {
        throw requestError(`Java task "${exercise.title}" needs test cases and a linked CODE, DEBUGGING, or PRACTICAL criterion.`);
      }
    }
    if (exercise.type === "MATH") {
      const calculationCriteria = linkedObjectives.flatMap((key) =>
        objectives.find((objective) => String(objective.key) === key)?.masteryCriteria || [],
      ).filter((criterion) =>
        (!linkedCriteria.length || linkedCriteria.includes(String(criterion.key))) &&
        criterion.evaluationMethod === "CALCULATION",
      );
      if (!String(exercise.expectedAnswer || "").trim() || !calculationCriteria.length) {
        throw requestError(`Mathematics task "${exercise.title}" needs an expected answer and a linked CALCULATION criterion.`);
      }
      const validation = evaluateMathematicsTask(
        { ...(exercise.toObject ? exercise.toObject() : exercise), requireReasoning: false },
        { answer: exercise.expectedAnswer },
      );
      if (validation.status !== "CORRECT") {
        throw requestError(`Mathematics task "${exercise.title}" has an answer or unit that cannot be evaluated safely.`);
      }
    }
  }
}

function studentTopic(topic) {
  const result = topic.toObject ? topic.toObject() : { ...topic };
  delete result.tutorInstructions;
  delete result.validationInstructions;
  result.objectiveDefinitions = getTopicObjectives(result).map((objective) => ({
    key: objective.key,
    title: objective.title,
    description: objective.description,
    expectedOutcome: objective.expectedOutcome,
    prerequisites: objective.prerequisites,
  }));
  result.questions = (result.questions || []).map(studentQuestion);
  result.exercises = (result.exercises || []).map(studentExercise);
  result.subtopics = (result.subtopics || []).map((subtopic) => ({
    ...subtopic,
    questions: (subtopic.questions || []).map(studentQuestion),
    exercises: (subtopic.exercises || []).map(studentExercise),
  }));
  return result;
}

function studentProgressSummary(progress) {
  if (!progress) {
    return {
      completedTopicIds: [],
      completedObjectiveKeys: [],
      completedExerciseIds: [],
      progressPercentage: 0,
      assessmentPassed: false,
      assessmentScorePercent: 0,
      completedAt: null,
    };
  }
  return {
    moduleId: progress.moduleId,
    moduleVersion: progress.moduleVersion,
    completedTopicIds: progress.completedTopicIds || [],
    completedObjectiveKeys: progress.completedObjectiveKeys || [],
    completedExerciseIds: progress.completedExerciseIds || [],
    progressPercentage: progress.progressPercentage || 0,
    assessmentPassed: progress.assessmentPassed === true,
    assessmentScorePercent: progress.assessmentScorePercent || 0,
    completedAt: progress.completedAt || null,
  };
}

export function serializeStudentModule(module) {
  const result = module.toObject ? module.toObject() : { ...module };
  delete result.aiConfiguration;
  delete result.currentPublishedVersion;
  result.topics = (result.topics || []).map((topic) => {
    const summary = {
      _id: topic._id,
      title: topic.title,
      description: topic.description,
      objectives: (topic.objectives || []).length
        ? topic.objectives
        : getTopicObjectives(topic).map((objective) => objective.title),
    };
    if (topic.objectiveDefinitions?.length) {
      summary.objectiveKeys = topic.objectiveDefinitions.map((objective) => objective.key);
    }
    if (topic.prerequisiteTopicIds?.length) {
      summary.prerequisiteTopicIds = topic.prerequisiteTopicIds;
    }
    if (topic.subject) summary.subject = topic.subject;
    if (topic.estimatedDurationMinutes) {
      summary.estimatedDurationMinutes = topic.estimatedDurationMinutes;
    }
    return summary;
  });
  result.assessment ||= { questions: [] };
  result.assessment.questions = (result.assessment?.questions || []).map(studentQuestion);
  return result;
}

function approvedTopicContext(topic, activeObjectiveKey) {
  const plain = topic.toObject ? topic.toObject() : topic;
  const objective = getTopicObjectives(plain)
    .find((item) => item.key === activeObjectiveKey);
  const knowledge = (plain.coreKnowledge || []).filter((item) =>
    !item.objectiveKeys?.length || item.objectiveKeys.includes(activeObjectiveKey),
  );
  return JSON.stringify({
    title: plain.title,
    description: plain.description,
    objective,
    coreKnowledge: knowledge,
    explanation: plain.explanation,
    examples: plain.examples,
  }).slice(0, 16000);
}

function objectiveEvaluationSummary(objective, decision, progress, topic, feedback) {
  const states = getObjectiveProgress(topic, progress);
  const activeState = states.find((state) => state.objectiveKey === objective.key);
  const latestResults = decision.evidence.flatMap((item) => item.criteria || []);
  const demonstratedKnowledge = [...new Set(
    latestResults.flatMap((item) => item.demonstratedConcepts || []),
  )].slice(0, 12);
  const missingKnowledge = [...new Set(
    latestResults.flatMap((item) => item.missingConcepts || []),
  )].slice(0, 12);
  const identifiedMisconceptions = [...new Set(
    latestResults.flatMap((item) => item.misconceptions || []),
  )].slice(0, 12);
  const allCriteriaDemonstrated = Boolean(activeState?.criteria?.length) &&
    activeState.criteria.every((criterion) =>
      criterion.demonstratedCount >= criterion.requiredEvidenceCount,
    );
  const correctness = allCriteriaDemonstrated
    ? "correct"
    : demonstratedKnowledge.length
      ? "partially_correct"
      : identifiedMisconceptions.length
        ? "incorrect"
        : "ambiguous";
  return {
    correctness,
    demonstratedKnowledge,
    missingKnowledge,
    identifiedMisconceptions,
    evidence: latestResults.map((item) => ({
      criterionKey: item.criterionKey,
      demonstrated: item.demonstrated,
      evidenceQuote: item.evidenceQuote || "",
      confidence: item.confidence || 0,
    })),
    masteryCriteriaResults: activeState?.criteria || [],
    confidence: latestResults.length
      ? Math.min(...latestResults.map((item) => Number(item.confidence) || 0))
      : 0,
    feedback: String(feedback || ""),
    recommendedNextAction: activeState?.state === "MASTERED"
      ? states.every((state) => state.state === "MASTERED")
        ? "TOPIC_COMPLETE"
        : "NEXT_OBJECTIVE"
      : identifiedMisconceptions.length
        ? "CORRECT_MISCONCEPTION"
        : demonstratedKnowledge.length
          ? "TARGETED_FOLLOW_UP"
          : "CLARIFY",
  };
}

function validateModuleCompletionConfiguration(module) {
  const topics = (module.topics || []).filter((topic) => String(topic.title || "").trim());
  if (!topics.length) {
    throw requestError(`Module "${module.title}" needs at least one topic before it can be published.`);
  }
  if (topics.some((topic) =>
    !(topic.objectives || []).some((objective) => String(objective || "").trim()) &&
    !(topic.objectiveDefinitions || []).length
  )) {
    throw requestError(`Every topic in "${module.title}" needs at least one learning objective before publishing.`);
  }
  for (const topic of topics) {
    validateTopicTasks(topic);
    const earlierTopicIds = new Set(
      topics.slice(0, topics.indexOf(topic)).map((item) => id(item._id)),
    );
    if (
      (topic.prerequisiteTopicIds || []).some((topicId) => !earlierTopicIds.has(id(topicId))) ||
      new Set((topic.prerequisiteTopicIds || []).map(id)).size !==
        (topic.prerequisiteTopicIds || []).length
    ) {
      throw requestError(
        `Topic prerequisites in "${topic.title}" must reference earlier topics in the same module.`,
      );
    }
    if (
      (topic.coreKnowledge || []).length > 100 ||
      Buffer.byteLength(JSON.stringify(topic.coreKnowledge || []), "utf8") > 64000
    ) {
      throw requestError(`Core knowledge for "${module.title}" exceeds the supported structured content size.`);
    }
    const objectives = topic.objectiveDefinitions || [];
    if (!objectives.length) continue;
    const keys = objectives.map((objective) => String(objective.key || "").trim());
    if (
      objectives.length > 50 ||
      keys.some((key) => !key || key.length > 100) ||
      new Set(keys).size !== keys.length ||
      objectives.some((objective, index) =>
        !String(objective.title || "").trim() ||
        !String(objective.description || "").trim() ||
        !String(objective.expectedOutcome || "").trim() ||
        !(objective.masteryCriteria || []).length ||
        objective.masteryCriteria.length > 10 ||
        (objective.requiredKnowledge || []).length > 20 ||
        (objective.commonMisconceptions || []).length > 20 ||
        (objective.masteryCriteria || []).some((criterion) =>
          !String(criterion.key || "").trim() ||
          String(criterion.key || "").length > 100 ||
          !String(criterion.description || "").trim() ||
          !LEARNING_EVALUATION_METHODS.has(String(criterion.evaluationMethod || "EXPLANATION")) ||
          !Number.isInteger(Number(criterion.requiredEvidenceCount || 1)) ||
          Number(criterion.requiredEvidenceCount || 1) < 1 ||
          Number(criterion.requiredEvidenceCount || 1) > 5,
        ) ||
        (objective.prerequisites || []).some((key) =>
          !keys.slice(0, index).includes(String(key)),
        )
      )
    ) {
      throw requestError(
        `Every structured objective in "${topic.title}" needs a unique key, a title, specific mastery criteria, and only earlier objective prerequisites.`,
      );
    }
    for (const objective of objectives) {
      const criterionKeys = objective.masteryCriteria.map((criterion) => String(criterion.key));
      if (new Set(criterionKeys).size !== criterionKeys.length) {
        throw requestError(`Mastery criteria in "${objective.title}" must have unique keys.`);
      }
    }
  }
  const requirements = module.completionRequirements || {};
  const exerciseCount = (module.topics || []).reduce(
    (total, topic) =>
      total +
      (topic.exercises || []).length +
      (topic.subtopics || []).reduce(
        (subtopicTotal, subtopic) =>
          subtopicTotal + (subtopic.exercises || []).length,
        0,
      ),
    0,
  );
  if (Number(requirements.minCompletedTopics || 0) > module.topics.length) {
    throw requestError(`Module "${module.title}" requires more completed topics than it contains.`);
  }
  if (Number(requirements.requiredExercises || 0) > exerciseCount) {
    throw requestError(`Module "${module.title}" requires more exercises than it contains.`);
  }
  if (requirements.requireAssessment && !module.assessment?.questions?.length) {
    throw requestError(`Module "${module.title}" requires an assessment but has no assessment questions.`);
  }
}

function requireTopicPrerequisites(topic, progress) {
  const completed = new Set((progress.completedTopicIds || []).map(id));
  const missing = (topic.prerequisiteTopicIds || []).filter(
    (topicId) => !completed.has(id(topicId)),
  );
  if (missing.length) {
    throw requestError("Complete the prerequisite topics before starting this topic.", 403);
  }
}

function validateAiConfiguration(value) {
  if (value === undefined) return;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value.behaviorPrompt || "") !== "string" ||
    !value.advancedSettings ||
    typeof value.advancedSettings !== "object" ||
    Array.isArray(value.advancedSettings) ||
    JSON.stringify(value.advancedSettings).length > 4000
  ) {
    throw requestError("AI configuration must be a valid prompt and small advanced-settings object.");
  }
}

async function loadProgress(userId, moduleId) {
  const module = typeof moduleId === "object"
    ? moduleId
    : await LearningModule.findById(moduleId).select("currentPublishedVersion");
  if (!module) throw requestError("Learning module not found.", 404);
  const progress = await LearningProgress.findOneAndUpdate(
    { userId, moduleId: module._id },
    {
      $setOnInsert: {
        userId,
        moduleId: module._id,
        moduleVersion: Math.max(1, Number(module.currentPublishedVersion) || 1),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  if (!progress.moduleVersion) {
    progress.moduleVersion = Math.max(1, Number(module.currentPublishedVersion) || 1);
    await progress.save();
  }
  return progress;
}

async function getModuleVersion(module, version) {
  const snapshot = await LearningModuleVersion.findOne({
    moduleId: module._id,
    version,
  }).lean();
  if (snapshot?.moduleSnapshot) {
    const versionedModule = LearningModule.hydrate({
      ...snapshot.moduleSnapshot,
      topics: snapshot.topicSummaries,
    });
    versionedModule.$locals.topicExerciseCount = snapshot.topicExerciseCount;
    versionedModule.$locals.versioned = true;
    return versionedModule;
  }
  if (snapshot?.contentSnapshot) return LearningModule.hydrate(snapshot.contentSnapshot);
  return LearningModule.findById(module._id);
}

async function getVersionedTopic(module, topicId) {
  const topicSummary = getTopic(module, topicId);
  if (!topicSummary || !module.$locals.versioned) return topicSummary;
  const versionedTopic = await LearningTopicVersion.findOne({
    moduleId: module._id,
    moduleVersion: module.currentPublishedVersion,
    topicId,
  }).lean();
  return versionedTopic
    ? module.topics.create(versionedTopic.topicSnapshot)
    : null;
}

async function getEntitledModuleForStudent(userId, moduleId) {
  const currentModule = await LearningModule.findOne({
    _id: moduleId,
    status: "PUBLISHED",
    deletedAt: null,
  })
    .select("_id programId currentPublishedVersion prerequisites");
  if (!currentModule) throw requestError("Learning module not found.", 404);
  await requirePublishedProgram(currentModule.programId);
  await requireModulePurchase(userId, currentModule);
  const progress = await loadProgress(userId, currentModule);
  const module = await getModuleVersion(
    currentModule,
    progress.moduleVersion || currentModule.currentPublishedVersion || 1,
  );
  await requireModulePrerequisites(userId, module);
  return { module, progress };
}

async function savePublishedModuleVersion(module) {
  const version = Math.max(1, Number(module.currentPublishedVersion) || 0);
  module.currentPublishedVersion = version;
  const moduleSnapshot = module.toObject();
  const topics = moduleSnapshot.topics || [];
  delete moduleSnapshot.topics;
  const topicSummaries = topics.map((topic) => ({
    _id: topic._id,
    title: topic.title,
    description: topic.description,
    objectives: topic.objectives,
    objectiveDefinitions: topic.objectiveDefinitions,
    prerequisiteTopicIds: topic.prerequisiteTopicIds,
    subject: topic.subject,
    estimatedDurationMinutes: topic.estimatedDurationMinutes,
  }));
  const topicExerciseCount = topics.reduce(
    (total, topic) =>
      total +
      (topic.exercises || []).length +
      (topic.subtopics || []).reduce(
        (subtopicTotal, subtopic) => subtopicTotal + (subtopic.exercises || []).length,
        0,
      ),
    0,
  );
  await LearningModuleVersion.findOneAndUpdate(
    { moduleId: module._id, version },
    {
      $setOnInsert: {
        moduleId: module._id,
        version,
        moduleSnapshot,
        topicSummaries,
        topicExerciseCount,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (topics.length) {
    await LearningTopicVersion.bulkWrite(
      topics.map((topic) => ({
        updateOne: {
          filter: { moduleId: module._id, moduleVersion: version, topicId: topic._id },
          update: {
            $setOnInsert: {
              moduleId: module._id,
              moduleVersion: version,
              topicId: topic._id,
              topicSnapshot: topic,
            },
          },
          upsert: true,
        },
      })),
    );
  }
}

async function preparePublishedModuleEdit(module) {
  const wasPublished = module.status === "PUBLISHED";
  let version = Number(module.currentPublishedVersion) || 0;
  if (wasPublished) {
    if (version === 0) {
      version = 1;
      module.currentPublishedVersion = version;
      await savePublishedModuleVersion(module);
    }
    await LearningProgress.updateMany(
      { moduleId: module._id, moduleVersion: null },
      { $set: { moduleVersion: version } },
    );
  }
  return { wasPublished, version };
}

async function saveModuleEdit(module, revision) {
  if (
    module.status === "PUBLISHED" &&
    !(module.topics || []).some((topic) => String(topic.title || "").trim())
  ) {
    throw requestError(`Module "${module.title}" needs at least one topic.`);
  }
  if (module.status === "PUBLISHED") {
    validateModuleCompletionConfiguration(module);
  }
  if (revision.wasPublished) module.currentPublishedVersion = revision.version + 1;
  await module.save();
  if (revision.wasPublished) await savePublishedModuleVersion(module);
  return module;
}

const editableTopicFields = [
  "title",
  "description",
  "explanation",
  "tutorInstructions",
  "validationInstructions",
  "objectives",
  "objectiveDefinitions",
  "coreKnowledge",
  "subject",
  "estimatedDurationMinutes",
  "prerequisiteTopicIds",
  "examples",
  "questions",
  "exercises",
  "subtopics",
];

const PREVIEW_SCENARIOS = new Set([
  "NO_PRIOR_KNOWLEDGE",
  "SOME_PRIOR_KNOWLEDGE",
  "MOST_OBJECTIVES_VERIFIED",
  "MISCONCEPTION",
]);

function normalizePreviewHistory(value) {
  if (!Array.isArray(value) || value.length > 12) {
    throw requestError("Preview history must contain no more than 12 messages.");
  }
  let total = 0;
  return value.map((item) => {
    if (
      !item ||
      !["user", "assistant"].includes(item.role) ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > 2000
    ) {
      throw requestError("Preview messages must be user or tutor text within 2000 characters.");
    }
    total += item.content.length;
    if (total > 8000) throw requestError("Preview conversation context is too long.");
    return { role: item.role, content: item.content };
  });
}

function validatePreviewTopic(topic) {
  const objectives = getTopicObjectives(topic);
  if (!objectives.length || objectives.length > 50) {
    throw requestError("The preview topic needs between 1 and 50 learning objectives.");
  }
  const keys = objectives.map((objective) => objective.key);
  if (new Set(keys).size !== keys.length) {
    throw requestError("Preview objective keys must be unique.");
  }
  objectives.forEach((objective, index) => {
    const criteria = objective.masteryCriteria;
    const criterionKeys = criteria.map((criterion) => criterion.key);
    if (
      !objective.title.trim() ||
      !objective.description.trim() ||
      !objective.expectedOutcome.trim() ||
      !criteria.length ||
      criteria.length > 10 ||
      new Set(criterionKeys).size !== criterionKeys.length ||
      criteria.some((criterion) =>
        !criterion.key.trim() ||
        !criterion.description.trim() ||
        !LEARNING_EVALUATION_METHODS.has(criterion.evaluationMethod) ||
        !Number.isInteger(criterion.requiredEvidenceCount) ||
        criterion.requiredEvidenceCount < 1 ||
        criterion.requiredEvidenceCount > 5,
      ) ||
      objective.prerequisites.some((key) => !keys.slice(0, index).includes(key))
    ) {
      throw requestError(`Objective "${objective.title}" needs valid criteria and only earlier prerequisites.`);
    }
  });
  if (Buffer.byteLength(JSON.stringify(topic.coreKnowledge || []), "utf8") > 64000) {
    throw requestError("Approved topic knowledge is too large to preview.");
  }
  return objectives;
}

export async function previewLearningTutor(adminId, moduleId, topicId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw requestError("A tutor preview request is required.");
  }
  const taskSimulation = input.taskSimulation;
  if (
    taskSimulation !== undefined &&
    (!taskSimulation ||
      typeof taskSimulation !== "object" ||
      Array.isArray(taskSimulation) ||
      !["ACTIVITY", "MATH", "CODE"].includes(String(taskSimulation.type || "")))
  ) {
    throw requestError("A supported task simulation is required.");
  }
  const taskType = String(taskSimulation?.type || "");
  const taskSubmission = taskSimulation?.submission;
  const message = String(
    input.message ||
      (taskType === "ACTIVITY"
        ? taskSubmission?.response
        : taskType === "MATH"
          ? taskSubmission?.answer
          : taskType === "CODE"
            ? "Simulated Java submission."
            : ""),
  ).trim();
  const scenario = String(input.scenario || "NO_PRIOR_KNOWLEDGE");
  if (
    !message ||
    message.length > (taskType === "ACTIVITY" ? 5000 : 2000) ||
    !PREVIEW_SCENARIOS.has(scenario)
  ) {
    throw requestError("Provide a preview message and a supported starting-knowledge scenario.");
  }
  if (
    input.topicDraft &&
    (typeof input.topicDraft !== "object" ||
      Array.isArray(input.topicDraft) ||
      Buffer.byteLength(JSON.stringify(input.topicDraft), "utf8") > 64000)
  ) {
    throw requestError("The topic draft preview is invalid or too large.");
  }
  if (Array.isArray(input.previousEvidence) && input.previousEvidence.length > 20) {
    throw requestError("Preview evidence history is too large.");
  }
  const module = await LearningModule.findOne({ _id: moduleId, deletedAt: null });
  if (!module) throw requestError("Learning module not found.", 404);
  const previewModule = new LearningModule(module.toObject());
  let topic = topicId ? previewModule.topics.id(topicId) : null;
  if (topicId && !topic) throw requestError("Learning topic not found.", 404);
  if (input.topicDraft) {
    if (!topic) {
      previewModule.topics.push({
        title: String(input.topicDraft.title || "Preview topic").slice(0, 160),
        description: String(input.topicDraft.description || "Tutor preview.").slice(0, 2000),
      });
      topic = previewModule.topics[previewModule.topics.length - 1];
    }
    for (const field of editableTopicFields) {
      if (input.topicDraft[field] !== undefined) topic[field] = input.topicDraft[field];
    }
  }
  if (!topic) throw requestError("A topic draft is required for tutor preview.");
  const objectives = validatePreviewTopic(topic);
  const selectedObjective = objectives.find(
    (objective) => objective.key === String(input.objectiveKey || ""),
  ) || objectives[0];
  if (!selectedObjective) throw requestError("The preview topic needs a learning objective.");
  const previewTaskList = [
        ...(topic.exercises || []),
        ...(topic.subtopics || []).flatMap((subtopic) => subtopic.exercises || []),
      ];
  const taskExercise = taskSimulation
    ? previewTaskList.find((exercise) => id(exercise) === String(taskSimulation.exerciseId || "")) ||
      (Number.isInteger(Number(taskSimulation.exerciseIndex)) &&
        Number(taskSimulation.exerciseIndex) >= 0
        ? previewTaskList[Number(taskSimulation.exerciseIndex)]
        : null)
    : null;
  if (taskSimulation && !taskExercise) {
    throw requestError("Select a task included in this topic preview.", 404);
  }
  if (taskExercise && String(taskExercise.type || "CODE") !== taskType) {
    throw requestError("The selected task type does not match the task definition.");
  }
  if (
    taskExercise?.objectiveKeys?.length &&
    !taskExercise.objectiveKeys.map(String).includes(selectedObjective.key)
  ) {
    throw requestError("The selected task is not linked to this objective.", 409);
  }
  const objectiveIndex = objectives.findIndex((objective) => objective.key === selectedObjective.key);
  const completedObjectiveKeys = objectives
    .slice(0, objectiveIndex)
    .map((objective) => objectiveProgressKey(topic._id, objective.key));
  const history = normalizePreviewHistory(input.history || []);
  const priorStudentText = history
    .filter((item) => item.role === "user")
    .map((item) => item.content.toLocaleLowerCase().replace(/\s+/g, " ").trim())
    .join("\n");
  const profile = scenario === "SOME_PRIOR_KNOWLEDGE"
    ? {
        demonstratedCount: 1,
        missingConcepts: selectedObjective.requiredKnowledge.slice(0, 1),
        misconceptions: [],
        teachingSignals: ["TARGETED_EXPLANATION"],
      }
    : scenario === "MOST_OBJECTIVES_VERIFIED"
      ? {
          demonstratedCount: Math.max(0, selectedObjective.masteryCriteria.length - 1),
          missingConcepts: [],
          misconceptions: [],
          teachingSignals: ["BRIEF_VERIFICATION"],
        }
      : scenario === "MISCONCEPTION"
        ? {
            demonstratedCount: 0,
            missingConcepts: selectedObjective.requiredKnowledge.slice(0, 1),
            misconceptions: selectedObjective.commonMisconceptions.slice(0, 1),
            teachingSignals: ["MISCONCEPTION_CORRECTION"],
          }
        : null;
  const priorUnderstanding = Array.isArray(input.previousEvidence)
    ? input.previousEvidence
        .filter((item) =>
          item &&
          item.objectiveKey === selectedObjective.key &&
          Array.isArray(item.criteria),
        )
        .slice(-20)
        .flatMap((item, index) => {
          const evidenceId = String(item.evidenceId || `preview-${index}`).slice(0, 100);
          const acceptedKeys = new Set();
          const criteria = item.criteria.slice(0, 20).flatMap((criterion) => {
            const criterionKey = String(criterion?.criterionKey || "");
            const quote = String(criterion?.evidenceQuote || "")
              .toLocaleLowerCase()
              .replace(/\s+/g, " ")
              .trim();
            if (
              criterion?.demonstrated !== true ||
              !selectedObjective.masteryCriteria.some((approved) => approved.key === criterionKey) ||
              acceptedKeys.has(criterionKey) ||
              Number(criterion.confidence) < 0.7 ||
              quote.length < 3 ||
              !priorStudentText.includes(quote)
            ) return [];
            acceptedKeys.add(criterionKey);
            return [{
              criterionKey,
              demonstrated: true,
              evidenceQuote: quote,
              confidence: Math.min(1, Number(criterion.confidence)),
            }];
          });
          return criteria.length
            ? [{
                evidenceId,
                topicId: topic._id,
                moduleVersion: 1,
                objectiveKey: selectedObjective.key,
                criteria,
              }]
            : [];
        })
    : [];
  if (taskType === "MATH" || taskType === "CODE") {
    return simulateLearningTaskPreview({
      adminId,
      module,
      topic,
      taskExercise,
      taskType,
      taskSubmission,
      selectedObjective,
      objectives,
      objectiveIndex,
      priorUnderstanding,
      completedObjectiveKeys,
      historyLength: history.length,
    });
  }
  const startedAt = Date.now();
  const providerName = String(config.AI_PROVIDER || "ollama").trim().toLowerCase();
  const model = String(config.AI_MODEL || "").trim();
  try {
    const previewTopic = { ...topic.toObject(), previewMode: true };
    const provider = createTutorProvider(config);
    const reply = await provider.generateReply({
      topic: previewTopic,
      approvedContent: approvedTopicContext(previewTopic, selectedObjective.key),
      objectiveProgress: {
        currentObjective: {
          key: selectedObjective.key,
          title: selectedObjective.title,
          expectedOutcome: selectedObjective.expectedOutcome,
          masteryCriteria: selectedObjective.masteryCriteria,
          commonMisconceptions: selectedObjective.commonMisconceptions,
          priorUnderstanding: { ...profile, evidence: priorUnderstanding },
        },
        states: objectives.map((objective, index) => ({
          objectiveKey: objective.key,
          state: index < objectiveIndex
            ? "MASTERED"
            : index === objectiveIndex
              ? "IN_PROGRESS"
              : "NOT_STARTED",
        })),
      },
      evaluationTask: {
        type: taskType || undefined,
        title: String(taskExercise?.title || input.task?.title || "").slice(0, 160),
        instructions: String(taskExercise?.instructions || input.task?.instructions || "").slice(0, 2000),
        evaluationMethod: String(taskExercise?.evaluationMethod || input.task?.evaluationMethod || "EXPLANATION").slice(0, 40),
      },
      previewScenario: scenario,
      progressContext: { preview: true },
      history: [...history, { role: "user", content: message }],
      language: "en",
      advancedSettings: module.aiConfiguration?.advancedSettings || {},
    });
    const evidenceDecision = evaluateObjectiveEvidence({
      topic,
      moduleVersion: 1,
      completedObjectiveKeys,
      existingEvidence: priorUnderstanding,
      proposals: reply.objectiveEvidence || [],
      studentResponse: message,
      evidenceId: createHash("sha256")
        .update(`${topic._id}:${selectedObjective.key}:${message.toLocaleLowerCase().replace(/\s+/g, " ")}`)
        .digest("hex")
        .slice(0, 40),
      sessionId: new mongoose.Types.ObjectId(),
      messageId: randomUUID(),
      messageIndex: history.length,
    });
    const simulatedProgress = {
      moduleVersion: 1,
      completedObjectiveKeys: [
        ...completedObjectiveKeys,
        ...evidenceDecision.masteredObjectiveKeys.map((key) =>
          objectiveProgressKey(topic._id, key),
        ),
      ],
      objectiveEvidence: [...priorUnderstanding, ...evidenceDecision.evidence],
    };
    const evaluation = objectiveEvaluationSummary(
      selectedObjective,
      evidenceDecision,
      simulatedProgress,
      topic,
      reply.content,
    );
    const activeCriteria = selectedObjective.masteryCriteria.filter((criterion) =>
      !(taskExercise?.criterionKeys || []).length ||
      taskExercise.criterionKeys.map(String).includes(criterion.key),
    );
    const taskState = getObjectiveProgress(topic, simulatedProgress)
      .find((state) => state.objectiveKey === selectedObjective.key);
    const taskAccepted = taskType === "ACTIVITY" &&
      activeCriteria.length > 0 &&
      activeCriteria.every((criterion) => {
        const state = taskState?.criteria.find((item) => item.criterionKey === criterion.key);
        return state && state.demonstratedCount >= state.requiredEvidenceCount;
      });
    const nextObjective = objectives[objectiveIndex + 1];
    await LearningAiUsage.create({
      userId: adminId,
      operation: "TUTOR_PREVIEW",
      provider: reply.provider,
      model: reply.model,
      ...aiUsageFields(reply, selectedObjective.key),
      responseTimeMs: Date.now() - startedAt,
      succeeded: true,
    });
    return {
      reply: reply.content,
      objectiveKey: selectedObjective.key,
      evaluation,
      evidence: evidenceDecision.evidence,
      taskResult: taskType
        ? {
            type: taskType,
            status: taskAccepted ? "CORRECT" : evaluation.correctness.toUpperCase(),
            accepted: taskAccepted,
            feedback: reply.content,
          }
        : null,
      masteryDecision: {
        mastered: evidenceDecision.masteredObjectiveKeys.includes(selectedObjective.key),
        state: taskState?.state || "IN_PROGRESS",
      },
      task: taskExercise
        ? { id: id(taskExercise), title: taskExercise.title, type: taskType }
        : null,
      missingCriteria: getObjectiveProgress(topic, simulatedProgress)
        .find((state) => state.objectiveKey === selectedObjective.key)
        ?.criteria.filter((criterion) =>
          criterion.demonstratedCount < criterion.requiredEvidenceCount,
        ) || [],
      reason: evidenceDecision.masteredObjectiveKeys.length
        ? nextObjective
          ? "Approved criteria have sufficient cited evidence; preview can advance to the next objective."
          : "Approved criteria have sufficient cited evidence; the topic objectives are complete in this simulation."
        : "More valid evidence is needed for at least one approved criterion.",
      simulatedProgress: {
        completedObjectiveKeys: simulatedProgress.completedObjectiveKeys,
        objectiveProgress: getObjectiveProgress(topic, simulatedProgress)
          .map(({ objectiveKey, state }) => ({ objectiveKey, state })),
      },
    };
  } catch (error) {
    await LearningAiUsage.create({
      userId: adminId,
      operation: "TUTOR_PREVIEW",
      provider: providerName || "unknown",
      model: model || "unconfigured",
      responseTimeMs: Date.now() - startedAt,
      succeeded: false,
    });
    throw error;
  }
}

async function simulateLearningTaskPreview({
  adminId,
  module,
  topic,
  taskExercise,
  taskType,
  taskSubmission,
  selectedObjective,
  objectives,
  objectiveIndex,
  priorUnderstanding,
  completedObjectiveKeys,
  historyLength,
}) {
  const normalizedSubmission = normalizeTaskSubmission(taskType, taskSubmission);
  const responseText = taskResponseText(taskType, normalizedSubmission);
  const activeCriteria = selectedObjective.masteryCriteria.filter((criterion) =>
    !(taskExercise.criterionKeys || []).length ||
    taskExercise.criterionKeys.map(String).includes(criterion.key),
  );
  const mayRecordEvidence = (taskExercise.objectiveKeys || [])
    .map(String)
    .includes(selectedObjective.key);
  const sourceType = taskType === "CODE" ? "CODE_TASK" : "MATH_TASK";
  const startedAt = Date.now();
  const providerName = String(config.AI_PROVIDER || "ollama").trim().toLowerCase();
  const modelName = String(config.AI_MODEL || "").trim();
  let deterministicResult;
  let proposals = [];
  let verifiedCriteria = [];
  let reply = null;
  let taskAccepted = false;

  if (taskType === "CODE") {
    if (String(taskExercise.language || "java").toLowerCase() !== "java") {
      throw requestError("The current secure execution engine supports Java exercises only.", 400);
    }
    if (!taskExercise.tests.length || taskExercise.tests.length > 50) {
      throw requestError("This exercise does not have a valid test set.", 409);
    }
    deterministicResult = await executionService.execute(
      normalizedSubmission,
      taskExercise.tests.map(({ input, expectedOutput }) => ({ input, expectedOutput })),
      "java",
      { timeLimit: 2000, memoryLimit: 65536 },
    );
    if (deterministicResult.accepted && mayRecordEvidence) {
      verifiedCriteria = activeCriteria
        .filter((criterion) => ["CODE", "DEBUGGING", "PRACTICAL"].includes(criterion.evaluationMethod))
        .map((criterion) => ({
          criterionKey: criterion.key,
          sourceType,
          verificationReference: `Secure Java runner accepted ${deterministicResult.passed} of ${deterministicResult.total} test cases.`,
        }));
    }
    reply = taskEvaluationReply(taskType, deterministicResult);
    taskAccepted = deterministicResult.accepted === true;
  } else {
    deterministicResult = evaluateMathematicsTask(taskExercise, normalizedSubmission);
    if (deterministicResult.accepted && !taskExercise.requireReasoning && mayRecordEvidence) {
      verifiedCriteria = activeCriteria
        .filter((criterion) => criterion.evaluationMethod === "CALCULATION")
        .map((criterion) => ({
          criterionKey: criterion.key,
          sourceType,
          verificationReference: "Numerical expression validated by the deterministic evaluator.",
        }));
    }
    const shouldEvaluateReasoning = Boolean(taskExercise.requireReasoning) &&
      Boolean(normalizedSubmission.reasoning);
    if (shouldEvaluateReasoning && mayRecordEvidence) {
      try {
        const provider = createTutorProvider(config);
        reply = await provider.generateReply({
          topic,
          approvedContent: approvedTopicContext(topic, selectedObjective.key),
          objectiveProgress: {
            currentObjective: {
              key: selectedObjective.key,
              title: selectedObjective.title,
              expectedOutcome: selectedObjective.expectedOutcome,
              masteryCriteria: activeCriteria,
              commonMisconceptions: selectedObjective.commonMisconceptions,
            },
            states: getObjectiveProgress(topic, {
              moduleVersion: 1,
              completedObjectiveKeys,
              objectiveEvidence: priorUnderstanding,
            }),
          },
          evaluationTask: {
            type: taskType,
            title: taskExercise.title,
            instructions: taskExercise.instructions,
            evaluationMethod: taskExercise.evaluationMethod,
            expectedAnswer: taskExercise.expectedAnswer,
            unit: taskExercise.unit,
            requireReasoning: true,
          },
          progressContext: { preview: true },
          history: [{ role: "user", content: responseText }],
          advancedSettings: module.aiConfiguration?.advancedSettings || {},
          language: "en",
        });
        proposals = reply.objectiveEvidence || [];
        await LearningAiUsage.create({
          userId: adminId,
          operation: "TUTOR_PREVIEW",
          provider: reply.provider,
          model: reply.model,
          ...aiUsageFields(reply, selectedObjective.key),
          responseTimeMs: Date.now() - startedAt,
          succeeded: true,
        });
      } catch (error) {
        await LearningAiUsage.create({
          userId: adminId,
          operation: "TUTOR_PREVIEW",
          provider: providerName || "unknown",
          model: modelName || "unconfigured",
          responseTimeMs: Date.now() - startedAt,
          succeeded: false,
        });
        throw error;
      }
    }
    if (!deterministicResult.accepted && proposals.length) {
      proposals = proposals.map((proposal) => ({
        ...proposal,
        criteria: proposal.criteria.filter((criterion) =>
          activeCriteria.some((approved) =>
            approved.key === criterion.criterionKey &&
            approved.evaluationMethod !== "CALCULATION",
          ),
        ),
      }));
    }
    reply ||= deterministicResult.feedback;
  }

  const evidenceDecision = evaluateObjectiveEvidence({
    topic,
    moduleVersion: 1,
    completedObjectiveKeys,
    existingEvidence: priorUnderstanding,
    proposals,
    verifiedCriteria: mayRecordEvidence ? verifiedCriteria : [],
    studentResponse: responseText,
    sourceType,
    taskId: taskExercise._id,
    taskAttemptKey: "admin-preview",
    evidenceId: createHash("sha256")
      .update(`${topic._id}:${taskExercise._id}:${responseText.trim().toLocaleLowerCase().replace(/\s+/g, " ")}`)
      .digest("hex")
      .slice(0, 40),
    sessionId: new mongoose.Types.ObjectId(),
    messageId: randomUUID(),
    messageIndex: historyLength,
  });
  const simulatedProgress = {
    moduleVersion: 1,
    completedObjectiveKeys: [
      ...completedObjectiveKeys,
      ...evidenceDecision.masteredObjectiveKeys.map((key) =>
        objectiveProgressKey(topic._id, key),
      ),
    ],
    objectiveEvidence: [...priorUnderstanding, ...evidenceDecision.evidence],
  };
  const objectiveState = getObjectiveProgress(topic, simulatedProgress)
    .find((state) => state.objectiveKey === selectedObjective.key);
  if (taskType === "MATH") {
    if (!taskExercise.requireReasoning) {
      taskAccepted = deterministicResult.accepted;
    } else {
      const calculationCriteria = activeCriteria.filter((criterion) =>
        criterion.evaluationMethod === "CALCULATION",
      );
      taskAccepted = deterministicResult.accepted &&
        calculationCriteria.length > 0 &&
        calculationCriteria.every((criterion) => {
          const state = objectiveState?.criteria.find((item) => item.criterionKey === criterion.key);
          return state && state.demonstratedCount >= state.requiredEvidenceCount;
        });
    }
  }
  const evaluation = objectiveEvaluationSummary(
    selectedObjective,
    evidenceDecision,
    simulatedProgress,
    topic,
    reply,
  );
  const nextObjective = objectives[objectiveIndex + 1];
  const visibleResults = taskType === "CODE"
    ? deterministicResult.results
        .filter((_result, index) => taskExercise.tests[index]?.visible)
        .map(({ testCase, status, output, executionTime }) => ({
          testCase,
          status,
          output,
          executionTime,
        }))
    : [];
  return {
    reply,
    objectiveKey: selectedObjective.key,
    task: { id: id(taskExercise), title: taskExercise.title, type: taskType },
    taskResult: {
      type: taskType,
      status: taskType === "CODE"
        ? deterministicResult.status
        : taskAccepted
          ? "CORRECT"
          : taskExercise.requireReasoning && deterministicResult.accepted
            ? "REASONING_REQUIRED"
            : deterministicResult.status,
      accepted: taskAccepted,
      feedback: reply,
      passed: taskType === "CODE" ? deterministicResult.passed : Number(taskAccepted),
      total: taskType === "CODE" ? deterministicResult.total : 1,
      visibleResults,
    },
    evaluation,
    evidence: evidenceDecision.evidence,
    missingCriteria: objectiveState?.criteria.filter((criterion) =>
      criterion.demonstratedCount < criterion.requiredEvidenceCount,
    ) || [],
    masteryDecision: {
      mastered: evidenceDecision.masteredObjectiveKeys.includes(selectedObjective.key),
      state: objectiveState?.state || "IN_PROGRESS",
    },
    reason: evidenceDecision.masteredObjectiveKeys.length
      ? nextObjective
        ? "The simulated evidence meets all approved criteria; preview can advance to the next objective."
        : "The simulated evidence meets all approved criteria; the topic objectives are complete in this simulation."
      : "More valid evidence is needed for at least one approved criterion.",
    nextAction: evaluation.recommendedNextAction,
    simulatedProgress: {
      completedObjectiveKeys: simulatedProgress.completedObjectiveKeys,
      objectiveProgress: getObjectiveProgress(topic, simulatedProgress)
        .map(({ objectiveKey, state }) => ({ objectiveKey, state })),
    },
  };
}

function validateTopicProposal(rawContent, request) {
  let proposal;
  try {
    proposal = JSON.parse(rawContent);
  } catch {
    throw requestError("The AI returned an invalid topic proposal. Please retry or author the topic manually.", 502);
  }
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    throw requestError("The AI topic proposal must be a JSON object.", 502);
  }
  const objectives = proposal.objectiveDefinitions;
  if (
    !Array.isArray(objectives) ||
    objectives.length < 1 ||
    objectives.length > 50 ||
    objectives.some((objective) =>
      !objective || typeof objective !== "object" || Array.isArray(objective),
    )
  ) {
    throw requestError("The AI topic proposal must include between 1 and 50 learning objectives.", 502);
  }
  const keys = objectives.map((objective) => String(objective?.key || "").trim());
  if (
    keys.some((key) => !key || key.length > 100) ||
    new Set(keys).size !== keys.length
  ) {
    throw requestError("The AI topic proposal contains missing or duplicate objective keys.", 502);
  }
  const objectiveDefinitions = objectives.map((objective, index) => {
    const masteryCriteria = objective.masteryCriteria;
    const prerequisites = objective.prerequisites === undefined ? [] : objective.prerequisites;
    if (
      !String(objective.title || "").trim() ||
      String(objective.title).length > 160 ||
      !String(objective.description || "").trim() ||
      String(objective.description).length > 2000 ||
      !String(objective.expectedOutcome || "").trim() ||
      String(objective.expectedOutcome).length > 2000 ||
      !Array.isArray(prerequisites) ||
      !Array.isArray(masteryCriteria) ||
      masteryCriteria.length < 1 ||
      masteryCriteria.length > 10 ||
      masteryCriteria.some((criterion) =>
        !criterion || typeof criterion !== "object" || Array.isArray(criterion),
      )
    ) {
      throw requestError(`The AI proposal has an incomplete objective at position ${index + 1}.`, 502);
    }
    const criterionKeys = masteryCriteria.map((criterion) => String(criterion?.key || "").trim());
    if (
      criterionKeys.some((key) => !key || key.length > 100) ||
      new Set(criterionKeys).size !== criterionKeys.length ||
      masteryCriteria.some((criterion) =>
        !String(criterion.description || "").trim() ||
        String(criterion.description).length > 1000 ||
        !LEARNING_EVALUATION_METHODS.has(String(criterion.evaluationMethod || "EXPLANATION")) ||
        !Number.isInteger(Number(criterion.requiredEvidenceCount || 1)) ||
        Number(criterion.requiredEvidenceCount || 1) < 1 ||
        Number(criterion.requiredEvidenceCount || 1) > 5,
      ) ||
      prerequisites.some((key) =>
        !keys.slice(0, index).includes(String(key)),
      )
    ) {
      throw requestError(`The AI proposal has invalid mastery criteria or prerequisites for "${objective.title}".`, 502);
    }
    return {
      key: keys[index],
      title: String(objective.title).trim(),
      description: String(objective.description || "").trim(),
      requiredKnowledge: normalizeProposalStringList(objective.requiredKnowledge, "required knowledge"),
      expectedOutcome: String(objective.expectedOutcome).trim(),
      masteryCriteria: masteryCriteria.map((criterion) => ({
        key: String(criterion.key).trim(),
        description: String(criterion.description).trim(),
        evaluationMethod: String(criterion.evaluationMethod || "EXPLANATION"),
        requiredEvidenceCount: Number(criterion.requiredEvidenceCount || 1),
      })),
      commonMisconceptions: normalizeProposalStringList(
        objective.commonMisconceptions,
        "common misconceptions",
      ),
      prerequisites: prerequisites.map(String),
    };
  });
  const coreKnowledge = Array.isArray(proposal.coreKnowledge) ? proposal.coreKnowledge : [];
  const allowedKnowledgeTypes = new Set([
    "CONCEPT", "DEFINITION", "EXPLANATION", "EXAMPLE", "ANALOGY", "PROCEDURE",
    "STEPS", "FORMULA", "DERIVATION", "CASE_STUDY", "SCENARIO", "DIAGRAM",
    "SIMULATION", "EXERCISE", "QUESTION", "COMPARISON", "REVISION_SUMMARY",
  ]);
  if (
    coreKnowledge.length < 1 ||
    coreKnowledge.length > 100 ||
    coreKnowledge.some((item) =>
      !item ||
      !String(item.key || "").trim() ||
      String(item.key).length > 100 ||
      !allowedKnowledgeTypes.has(String(item.type || "")) ||
      Number(item.schemaVersion) !== 1 ||
      (item.title && String(item.title).length > 160) ||
      !Array.isArray(item.objectiveKeys) ||
      !item.objectiveKeys.length ||
      item.objectiveKeys.some((key) => !keys.includes(String(key))) ||
      !Number.isInteger(Number(item.order)) ||
      item.order < 0 ||
      !item.content ||
      (item.metadata !== undefined &&
        (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata))) ||
      typeof item.content === "function",
    ) ||
    Buffer.byteLength(JSON.stringify(coreKnowledge), "utf8") > 64000
  ) {
    throw requestError("The AI topic proposal contains invalid or oversized core knowledge.", 502);
  }
  const knowledgeKeys = coreKnowledge.map((item) => String(item.key));
  if (new Set(knowledgeKeys).size !== knowledgeKeys.length) {
    throw requestError("The AI topic proposal contains duplicate core knowledge keys.", 502);
  }
  const practiceTasks = Array.isArray(proposal.practiceTasks) ? proposal.practiceTasks : [];
  if (
    practiceTasks.length > 10 ||
    practiceTasks.some((task) =>
      !task ||
      !String(task.title || "").trim() ||
      String(task.title).length > 160 ||
      !String(task.instructions || "").trim() ||
      String(task.instructions).length > 5000 ||
      !Array.isArray(task.objectiveKeys) ||
      !task.objectiveKeys.length ||
      task.objectiveKeys.some((key) => !keys.includes(String(key))),
    )
  ) {
    throw requestError("The AI topic proposal contains invalid practice tasks.", 502);
  }
  const estimatedDurationMinutes = Number(proposal.estimatedDurationMinutes);
  const proposalDescription = String(proposal.description || request.description).trim();
  if (
    !proposalDescription ||
    proposalDescription.length > 2000 ||
    !Number.isInteger(estimatedDurationMinutes) ||
    estimatedDurationMinutes < 1 ||
    estimatedDurationMinutes > 100000
  ) {
    throw requestError("The AI topic proposal must include a valid estimated duration.", 502);
  }
  return {
    title: request.title,
    subject: request.subject,
    description: proposalDescription,
    estimatedDurationMinutes,
    objectiveDefinitions,
    coreKnowledge,
    practiceTasks: practiceTasks.map((task) => ({
      title: String(task.title).trim(),
      instructions: String(task.instructions).trim(),
      objectiveKeys: task.objectiveKeys.map(String),
    })),
  };
}

function normalizeProposalStringList(value, label) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw requestError(`AI proposal ${label} must be a list of at most 20 non-empty strings.`, 502);
  }
  return value.map((item) => item.trim());
}

export async function generateLearningTopicProposal(adminId, moduleId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw requestError("A topic proposal request is required.");
  }
  const module = await LearningModule.findOne({ _id: moduleId, deletedAt: null })
    .select("title");
  if (!module) throw requestError("Learning module not found.", 404);
  const title = String(input.title || "").trim();
  const subject = String(input.subject || "").trim();
  const description = String(input.description || "").trim();
  const referenceContent = String(input.referenceContent || "").trim();
  if (!title || title.length > 160 || subject.length > 100 || description.length > 2000 ||
      referenceContent.length > 12000 || (!description && !referenceContent)) {
    throw requestError("Provide a topic title and a short description or reference material within the supported limits.");
  }
  const startedAt = Date.now();
  const providerName = String(config.AI_PROVIDER || "ollama").trim().toLowerCase();
  const model = String(config.AI_MODEL || "").trim();
  let reply;
  try {
    const provider = createTutorProvider(config);
    reply = await provider.generateReply({
      topic: { title, authoringProposal: true },
      approvedContent: JSON.stringify({
        moduleTitle: module.title,
        title,
        subject,
        description,
        referenceContent,
      }),
      progressContext: {},
      objectiveProgress: {},
      history: [],
      language: "en",
      advancedSettings: {},
    });
  } catch (error) {
    await LearningAiUsage.create({
      userId: adminId,
      operation: "TOPIC_PROPOSAL",
      provider: providerName || "unknown",
      model: model || "unconfigured",
      responseTimeMs: Date.now() - startedAt,
      succeeded: false,
    });
    throw error;
  }
  let proposal;
  try {
    proposal = validateTopicProposal(reply.content, {
      title,
      subject,
      description,
    });
  } catch (error) {
    await LearningAiUsage.create({
      userId: adminId,
      operation: "TOPIC_PROPOSAL",
      provider: reply.provider,
      model: reply.model,
      responseTimeMs: Date.now() - startedAt,
      succeeded: false,
    });
    throw error;
  }
  await LearningAiUsage.create({
    userId: adminId,
    operation: "TOPIC_PROPOSAL",
    provider: reply.provider,
    model: reply.model,
    ...aiUsageFields(reply),
    responseTimeMs: Date.now() - startedAt,
    succeeded: true,
  });
  return { proposal };
}

export async function createLearningTopic(moduleId, input) {
  const module = await LearningModule.findOne({ _id: moduleId, deletedAt: null });
  if (!module) throw requestError("Learning module not found.", 404);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw requestError("A topic object is required.");
  }
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw requestError("Topic title is required.");
  }
  const revision = await preparePublishedModuleEdit(module);
  const topicInput = Object.fromEntries(
    editableTopicFields
      .filter((field) => input[field] !== undefined)
      .map((field) => [field, input[field]]),
  );
  const topic = module.topics.create(topicInput);
  module.topics.push(topic);
  await saveModuleEdit(module, revision);
  return topic;
}

export async function updateLearningTopic(moduleId, topicId, input) {
  const module = await LearningModule.findOne({ _id: moduleId, deletedAt: null });
  if (!module) throw requestError("Learning module not found.", 404);
  const topic = module.topics.id(topicId);
  if (!topic) throw requestError("Learning topic not found.", 404);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw requestError("A topic object is required.");
  }
  if (input.title !== undefined && (typeof input.title !== "string" || !input.title.trim())) {
    throw requestError("Topic title cannot be empty.");
  }
  const revision = await preparePublishedModuleEdit(module);
  for (const field of editableTopicFields) {
    if (input[field] !== undefined) topic[field] = input[field];
  }
  await saveModuleEdit(module, revision);
  return topic;
}

export async function deleteLearningTopic(moduleId, topicId) {
  const module = await LearningModule.findOne({ _id: moduleId, deletedAt: null });
  if (!module) throw requestError("Learning module not found.", 404);
  if (!module.topics.id(topicId)) throw requestError("Learning topic not found.", 404);
  const revision = await preparePublishedModuleEdit(module);
  module.topics.pull(topicId);
  await saveModuleEdit(module, revision);
  return { deleted: true };
}

export async function reorderLearningTopics(moduleId, orderedTopicIds) {
  const module = await LearningModule.findOne({ _id: moduleId, deletedAt: null });
  if (!module) throw requestError("Learning module not found.", 404);
  if (
    !Array.isArray(orderedTopicIds) ||
    orderedTopicIds.length !== module.topics.length ||
    new Set(orderedTopicIds.map(id)).size !== module.topics.length ||
    orderedTopicIds.some((topicId) => !module.topics.id(topicId))
  ) {
    throw requestError("The order must include every topic exactly once.");
  }
  const revision = await preparePublishedModuleEdit(module);
  const byId = new Map(module.topics.map((topic) => [id(topic), topic.toObject()]));
  module.topics = orderedTopicIds.map((topicId) => byId.get(id(topicId)));
  await saveModuleEdit(module, revision);
  return module.topics;
}

async function createCertificateIfComplete(module, progress) {
  if (!meetsModuleCompletionRequirements(module, progress)) return null;
  if (!progress.completedAt) {
    progress.completedAt = new Date();
    await progress.save();
  }
  return LearningCertificate.findOneAndUpdate(
    { userId: progress.userId, moduleId: module._id },
    {
      $setOnInsert: {
        code: randomUUID(),
        userId: progress.userId,
        programId: module.programId,
        moduleId: module._id,
        moduleVersion: progress.moduleVersion || module.currentPublishedVersion || 1,
        earnedAt: progress.completedAt,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

async function activateModulePurchase(purchase) {
  if (!purchase.accessStartedAt) {
    const startedAt = new Date();
    purchase.accessStartedAt = startedAt;
    purchase.accessExpiresAt = Number.isInteger(purchase.accessDurationDays)
      ? new Date(startedAt.getTime() + purchase.accessDurationDays * 24 * 60 * 60 * 1000)
      : null;
  }
  purchase.status = "ACTIVE";
  await purchase.save();
  await LearningProgress.updateOne(
    { userId: purchase.userId, moduleId: purchase.moduleId },
    {
      $setOnInsert: {
        userId: purchase.userId,
        moduleId: purchase.moduleId,
        moduleVersion: purchase.moduleVersion || 1,
      },
    },
    { upsert: true },
  );
  await LearningProgress.updateOne(
    { userId: purchase.userId, moduleId: purchase.moduleId, moduleVersion: null },
    { $set: { moduleVersion: purchase.moduleVersion || 1 } },
  );
  return purchase;
}

async function requireModulePurchase(userId, module) {
  const purchase = await LearningPurchase.findOne({
    userId,
    status: "ACTIVE",
    moduleId: module._id,
  });
  if (!purchase) throw requestError("Purchase this module to continue.", 403);
  if (purchase.accessExpiresAt && purchase.accessExpiresAt <= new Date()) {
    purchase.status = "EXPIRED";
    await purchase.save();
    throw requestError("Your access to this module has expired. Purchase it again to continue.", 403);
  }
}

async function requirePublishedProgram(programId) {
  const program = await LearningProgram.exists({
    _id: programId,
    status: "PUBLISHED",
    deletedAt: null,
  });
  if (!program) throw requestError("Published course not found.", 404);
}

async function requireModulePrerequisites(userId, module) {
  const prerequisites = module.prerequisites || [];
  if (prerequisites.length) {
    const completed = await LearningProgress.find({
      userId,
      moduleId: { $in: prerequisites },
      completedAt: { $ne: null },
    }).select("moduleId");
    const completedIds = new Set(completed.map((entry) => id(entry.moduleId)));
    if (prerequisites.some((prerequisiteId) => !completedIds.has(id(prerequisiteId)))) {
      throw requestError("Complete the module prerequisites before opening this module.", 403);
    }
  }
}

export async function listLearningPrograms(userId, pageInput, limitInput) {
  const page = normalizePage(pageInput, 1);
  const limit = Math.min(MAX_PAGE_SIZE, normalizePage(limitInput, 20));
  const publishedModuleProgramIds = await LearningModule.distinct("programId", {
    deletedAt: null,
    $or: [{ status: "PUBLISHED" }, { status: { $exists: false } }],
  });
  if (!publishedModuleProgramIds.length) return { programs: [], page, limit, total: 0 };
  const filter = {
    status: "PUBLISHED",
    deletedAt: null,
    _id: { $in: publishedModuleProgramIds },
  };
  const [programs, total] = await Promise.all([
    LearningProgram.find(filter)
      .sort({ displayOrder: 1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LearningProgram.countDocuments(filter),
  ]);
  if (!programs.length) return { programs: [], page, limit, total };

  const programIds = programs.map((program) => program._id);
  const modules = await LearningModule.find({
    programId: { $in: programIds },
    deletedAt: null,
    $or: [{ status: "PUBLISHED" }, { status: { $exists: false } }],
  })
    .select("programId title description price currency difficulty sequence estimatedDurationMinutes accessDurationDays prerequisites status")
    .sort({ programId: 1, sequence: 1 })
    .lean();
  const moduleIds = modules.map((module) => module._id);
  const [purchases, progress, certificates] = await Promise.all([
    LearningPurchase.find({
      userId,
      status: { $in: ["PENDING", "ACTIVE", "EXPIRED"] },
      moduleId: { $in: moduleIds },
    }).select("programId moduleId status accessExpiresAt").lean(),
    LearningProgress.find({ userId, moduleId: { $in: moduleIds } })
      .select("moduleId completedTopicIds completedObjectiveKeys completedAt assessmentPassed progressPercentage")
      .lean(),
    LearningCertificate.find({ userId, moduleId: { $in: moduleIds } })
      .select("_id code moduleId")
      .lean(),
  ]);
  const purchaseFor = (module) => {
    const matches = purchases.filter((purchase) =>
      sameId(purchase.programId, module.programId) ||
      sameId(purchase.moduleId, module._id),
    );
    return matches.find((purchase) =>
      purchase.status === "ACTIVE" &&
      (!purchase.accessExpiresAt || new Date(purchase.accessExpiresAt) > new Date()),
    ) ||
      matches.find((purchase) => purchase.status === "PENDING") ||
      matches.find((purchase) => purchase.status === "EXPIRED" || purchase.status === "ACTIVE");
  };
  const progressByModule = new Map(progress.map((entry) => [id(entry.moduleId), entry]));
  const certificateByModule = new Map(certificates.map((entry) => [id(entry.moduleId), entry]));
  const activeCompleted = new Set(progress.filter((entry) => entry.completedAt).map((entry) => id(entry.moduleId)));

  return {
    programs: programs.map((program) => ({
      ...program,
      modules: modules
        .filter((module) => sameId(module.programId, program._id))
        .map((module) => {
          const purchase = purchaseFor(module);
          const moduleProgress = progressByModule.get(id(module._id));
          const accessExpired = purchase?.status === "EXPIRED" ||
            (purchase?.status === "ACTIVE" &&
              purchase.accessExpiresAt &&
              new Date(purchase.accessExpiresAt) <= new Date());
          const prerequisitesMet = (module.prerequisites || []).every((prerequisite) =>
            activeCompleted.has(id(prerequisite)),
          );
          return {
            ...module,
            hasAccess: purchase?.status === "ACTIVE" && !accessExpired && prerequisitesMet,
            purchaseStatus: accessExpired ? "EXPIRED" : purchase?.status || null,
            accessExpiresAt: purchase?.accessExpiresAt || null,
            certificate: certificateByModule.get(id(module._id)) || null,
            progress: moduleProgress
              ? {
                  completedTopics: moduleProgress.completedTopicIds.length,
                  completedObjectives: moduleProgress.completedObjectiveKeys?.length || 0,
                  completed: Boolean(moduleProgress.completedAt),
                  assessmentPassed: moduleProgress.assessmentPassed,
                  progressPercentage: moduleProgress.progressPercentage || 0,
                }
              : { completedTopics: 0, completedObjectives: 0, completed: false, assessmentPassed: false, progressPercentage: 0 },
          };
        }),
    })),
    page,
    limit,
    total,
  };
}

export async function listAdminLearningPrograms(pageInput, limitInput) {
  const page = normalizePage(pageInput, 1);
  const limit = Math.min(MAX_PAGE_SIZE, normalizePage(limitInput, 20));
  const [programs, total] = await Promise.all([
    LearningProgram.find({ deletedAt: null })
      .sort({ displayOrder: 1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LearningProgram.countDocuments({ deletedAt: null }),
  ]);
  const modules = programs.length
    ? await LearningModule.find({ programId: { $in: programs.map((program) => program._id) }, deletedAt: null })
        .select("programId title description price currency difficulty sequence estimatedDurationMinutes accessDurationDays status")
        .sort({ programId: 1, sequence: 1 })
        .lean()
    : [];
  return {
    programs: programs.map((program) => ({
      ...program,
      modules: modules.filter((module) => sameId(module.programId, program._id)),
    })),
    page,
    limit,
    total,
  };
}

export async function createLearningProgram(userId, input) {
  const requiredFields = [
    ["title", "Course name", 140],
    ["description", "Full description", 4000],
  ];
  for (const [field, label, maxLength] of requiredFields) {
    if (typeof input[field] !== "string" || !input[field].trim()) {
      throw requestError(`${label} is required.`);
    }
    if (input[field].trim().length > maxLength) {
      throw requestError(`${label} must be ${maxLength} characters or fewer.`);
    }
  }
  if (
    input.difficulty !== undefined &&
    !["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(input.difficulty)
  ) {
    throw requestError("Course difficulty must be beginner, intermediate, or advanced.");
  }
  const thumbnailUrl = String(input.thumbnailUrl || "").trim();
  if (thumbnailUrl) {
    let parsed;
    try {
      parsed = new URL(thumbnailUrl);
    } catch {
      throw requestError("Course thumbnail URL must be a valid HTTPS URL.");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw requestError("Course thumbnail URL must be a valid HTTPS URL.");
    }
  }
  const program = new LearningProgram({
    title: input.title,
    description: input.description,
    shortDescription: input.shortDescription,
    category: input.category,
    difficulty: input.difficulty,
    technologies: input.technologies,
    features: input.features,
    prerequisites: input.prerequisites,
    learningOutcomes: input.learningOutcomes,
    thumbnailUrl,
    displayOrder: input.displayOrder,
    status: "DRAFT",
    createdBy: userId,
    updatedBy: userId,
  });
  await program.save();
  return program;
}

export async function updateLearningProgram(userId, programId, input) {
  const program = await LearningProgram.findById(programId);
  if (!program || program.deletedAt) throw requestError("Learning course not found.", 404);
  for (const field of [
    "title",
    "description",
    "shortDescription",
    "language",
    "category",
    "difficulty",
    "technologies",
    "features",
    "prerequisites",
    "learningOutcomes",
    "thumbnailUrl",
    "displayOrder",
  ]) {
    if (input[field] !== undefined) {
      if (field === "thumbnailUrl" && input[field]) {
        let parsed;
        try {
          parsed = new URL(input[field]);
        } catch {
          throw requestError("Course thumbnail URL must be a valid HTTPS URL.");
        }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
          throw requestError("Course thumbnail URL must be a valid HTTPS URL.");
        }
      }
      program[field] = input[field];
    }
  }
  if (input.status !== undefined) {
    if (!["DRAFT", "PUBLISHED"].includes(input.status)) {
      throw requestError("Program status must be DRAFT or PUBLISHED.");
    }
    if (input.status === "PUBLISHED") {
      const modules = await LearningModule.find({
        programId: program._id,
        deletedAt: null,
      });
      if (!modules.length) {
        throw requestError("Add at least one module before publishing this course.");
      }
      modules.forEach(validateModuleCompletionConfiguration);
      for (const module of modules) {
        if (module.status === "PUBLISHED" && module.currentPublishedVersion) continue;
        module.status = "PUBLISHED";
        module.currentPublishedVersion = Math.max(
          1,
          Number(module.currentPublishedVersion) + 1 || 1,
        );
        await module.save();
        await savePublishedModuleVersion(module);
      }
      if (program.status !== "PUBLISHED") program.publishedAt = new Date();
    }
    program.status = input.status;
  }
  program.updatedBy = userId;
  await program.save();
  return program;
}

export async function archiveLearningProgram(programId) {
  const program = await LearningProgram.findOneAndUpdate(
    { _id: programId, deletedAt: null },
    { $set: { deletedAt: new Date(), status: "DRAFT" } },
    { new: true, runValidators: true },
  );
  if (!program) throw requestError("Learning course not found.", 404);
  return program;
}

async function validatePrerequisites(programId, prerequisites, excludedModuleId = null) {
  if (!Array.isArray(prerequisites)) throw requestError("Prerequisites must be an array.");
  if (prerequisites.length > 20) throw requestError("A module can have at most 20 prerequisites.");
  const uniqueIds = [...new Set(prerequisites.map(id))];
  if (excludedModuleId && uniqueIds.includes(id(excludedModuleId))) {
    throw requestError("A module cannot be its own prerequisite.");
  }
  if (uniqueIds.length) {
    const found = await LearningModule.find({
      _id: { $in: uniqueIds },
      programId,
      ...(excludedModuleId ? { _id: { $in: uniqueIds, $ne: excludedModuleId } } : {}),
    }).select("_id");
    if (found.length !== uniqueIds.length) {
      throw requestError("Every prerequisite must be another module in the same program.");
    }
  }
  return uniqueIds;
}

function normalizeAccessDurationDays(value) {
  if (value === undefined || value === null || value === "") return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 36500) {
    throw requestError("Module access duration must be a whole number of days between 1 and 36500.");
  }
  return days;
}

export async function createLearningModule(programId, input) {
  for (const [field, label, maxLength] of [
    ["title", "Module name", 160],
    ["description", "Module description", 4000],
  ]) {
    if (typeof input[field] !== "string" || !input[field].trim()) {
      throw requestError(`${label} is required.`);
    }
    if (input[field].trim().length > maxLength) {
      throw requestError(`${label} must be ${maxLength} characters or fewer.`);
    }
  }
  const program = await LearningProgram.findOne({ _id: programId, deletedAt: null });
  if (!program) throw requestError("Learning course not found.", 404);
  const prerequisites = await validatePrerequisites(programId, input.prerequisites || []);
  validateAiConfiguration(input.aiConfiguration);
  const accessDurationDays = normalizeAccessDurationDays(input.accessDurationDays);
  const lastModule = await LearningModule.findOne({ programId, deletedAt: null })
    .sort({ sequence: -1 })
    .select("sequence")
    .lean();
  const requestedSequence = Number(input.sequence);
  const module = new LearningModule({
    title: input.title,
    shortDescription: String(input.shortDescription || input.description).slice(0, 300),
    description: input.description,
    objectives: input.objectives,
    price: input.price,
    currency: input.currency,
    accessDurationDays,
    difficulty: input.difficulty,
    sequence: Number.isInteger(requestedSequence) && requestedSequence > 0
      ? requestedSequence
      : (Number(lastModule?.sequence) || 0) + 1,
    estimatedDurationMinutes: Number(input.estimatedDurationMinutes) || 60,
    topics: [],
    assessment: input.assessment,
    completionRequirements: input.completionRequirements,
    aiConfiguration: input.aiConfiguration
      ? {
          behaviorPrompt: input.aiConfiguration.behaviorPrompt,
          advancedSettings: input.aiConfiguration.advancedSettings,
        }
      : undefined,
    programId,
    prerequisites,
    status: "DRAFT",
    currentPublishedVersion: 0,
  });
  await module.save();
  return module;
}

export async function getAdminLearningModule(moduleId) {
  const module = await LearningModule.findOne({ _id: moduleId, deletedAt: null });
  if (!module) throw requestError("Learning module not found.", 404);
  return module;
}

export async function updateLearningModule(moduleId, input) {
  const module = await LearningModule.findOne({ _id: moduleId, deletedAt: null });
  if (!module) throw requestError("Learning module not found.", 404);
  const revision = await preparePublishedModuleEdit(module);
  const fields = [
    "title",
    "shortDescription",
    "description",
    "objectives",
    "price",
    "currency",
    "difficulty",
    "sequence",
    "estimatedDurationMinutes",
    "accessDurationDays",
    "topics",
    "assessment",
    "completionRequirements",
  ];
  for (const field of fields) {
    if (input[field] !== undefined) {
      module[field] = field === "accessDurationDays"
        ? normalizeAccessDurationDays(input[field])
        : input[field];
    }
  }
  if (input.prerequisites !== undefined) {
    module.prerequisites = await validatePrerequisites(
      module.programId,
      input.prerequisites,
      module._id,
    );
  }
  if (input.aiConfiguration !== undefined) {
    const previous = module.aiConfiguration || {};
    const next = input.aiConfiguration;
    validateAiConfiguration(next);
    if (
      previous.behaviorPrompt !== next.behaviorPrompt ||
      JSON.stringify(previous.advancedSettings || {}) !== JSON.stringify(next.advancedSettings || {})
    ) {
      const version = Number(previous.version) || 1;
      module.aiConfiguration = {
        ...next,
        version: version + 1,
        history: [
          ...(previous.history || []),
          {
            version,
            behaviorPrompt: previous.behaviorPrompt || "",
            advancedSettings: previous.advancedSettings || {},
            createdAt: new Date(),
          },
        ].slice(-20),
      };
    }
  }
  return saveModuleEdit(module, revision);
}

export async function setLearningModuleStatus(moduleId, status) {
  if (!["DRAFT", "PUBLISHED"].includes(status)) {
    throw requestError("Module status must be DRAFT or PUBLISHED.");
  }
  const module = await LearningModule.findOne({ _id: moduleId, deletedAt: null });
  if (!module) throw requestError("Learning module not found.", 404);
  if (status === "PUBLISHED" && module.status === "PUBLISHED" && !module.currentPublishedVersion) {
    validateModuleCompletionConfiguration(module);
    module.currentPublishedVersion = 1;
    await module.save();
    await savePublishedModuleVersion(module);
    return module;
  }
  if (module.status !== status) {
    if (status === "PUBLISHED") {
      validateModuleCompletionConfiguration(module);
      module.currentPublishedVersion = Math.max(1, Number(module.currentPublishedVersion) + 1 || 1);
    }
    module.status = status;
    await module.save();
    if (status === "PUBLISHED") await savePublishedModuleVersion(module);
  }
  return module;
}

export async function archiveLearningModule(moduleId) {
  const module = await LearningModule.findOneAndUpdate(
    { _id: moduleId, deletedAt: null },
    { $set: { deletedAt: new Date(), status: "DRAFT" } },
    { new: true, runValidators: true },
  );
  if (!module) throw requestError("Learning module not found.", 404);
  return module;
}

export async function reorderLearningModules(programId, orderedModuleIds) {
  if (!Array.isArray(orderedModuleIds) || !orderedModuleIds.length) {
    throw requestError("Provide the ordered module IDs.");
  }
  const modules = await LearningModule.find({ programId, deletedAt: null }).select("_id sequence");
  if (
    modules.length !== orderedModuleIds.length ||
    new Set(orderedModuleIds.map(id)).size !== modules.length ||
    orderedModuleIds.some((moduleId) => !modules.some((module) => sameId(module._id, moduleId)))
  ) {
    throw requestError("The order must include every active module exactly once.");
  }
  const offset = Math.max(...modules.map((module) => module.sequence), modules.length) + modules.length + 1;
  await LearningModule.updateMany({ programId, deletedAt: null }, { $inc: { sequence: offset } });
  await Promise.all(
    orderedModuleIds.map((moduleId, index) =>
      LearningModule.updateOne(
        { _id: moduleId, programId, deletedAt: null },
        { $set: { sequence: index + 1 } },
      ),
    ),
  );
  return LearningModule.find({ programId, deletedAt: null })
    .sort({ sequence: 1 })
    .select("title sequence status")
    .lean();
}

export async function createLearningPurchase(userId, input) {
  const moduleId = input?.moduleId;
  if (!moduleId || input.programId) {
    throw requestError("Only individual module purchases are supported.");
  }
  const module = await LearningModule.findOne({
    _id: moduleId,
    status: "PUBLISHED",
    deletedAt: null,
  }).select("programId title price currency currentPublishedVersion accessDurationDays");
  if (!module) throw requestError("Published module not found.", 404);
  const program = await LearningProgram.findOne({
    _id: module.programId,
    status: "PUBLISHED",
    deletedAt: null,
  }).select("_id");
  if (!program) throw requestError("Published course not found.", 404);
  let existing = await LearningPurchase.findOne({
    userId,
    moduleId: module._id,
    status: { $in: ["PENDING", "ACTIVE"] },
  }).sort({ createdAt: -1 });
  if (existing?.status === "ACTIVE" && existing.accessExpiresAt && existing.accessExpiresAt <= new Date()) {
    existing.status = "EXPIRED";
    await existing.save();
    existing = null;
  }
  if (
    existing?.status === "PENDING" &&
    (
      existing.amount !== module.price ||
      existing.currency !== (module.currency || "INR") ||
      (existing.accessDurationDays ?? null) !== (module.accessDurationDays ?? null)
    )
  ) {
    existing.status = "FAILED";
    existing.paymentStatus = "FAILED";
    await existing.save();
    existing = null;
  }
  if (existing?.status === "ACTIVE") return { purchase: existing, checkout: null };
  if (existing?.paymentOrderId && existing.status === "PENDING") {
    return {
      purchase: existing,
      checkout: {
        keyId: getRazorpayKeyId(),
        orderId: existing.paymentOrderId,
        amount: toMinorUnitAmount(existing.amount, existing.currency),
        currency: existing.currency,
        moduleTitle: module.title,
      },
    };
  }
  const purchase = existing || new LearningPurchase({
    userId,
    moduleId: module._id,
    programId: module.programId,
    moduleVersion: Math.max(1, Number(module.currentPublishedVersion) || 1),
    amount: module.price,
    currency: module.currency || "INR",
    accessDurationDays: module.accessDurationDays ?? null,
  });
  if (!purchase.moduleVersion) {
    purchase.moduleVersion = Math.max(1, Number(module.currentPublishedVersion) || 1);
  }
  if (purchase.amount === 0) {
    purchase.paymentProvider = "FREE";
    purchase.paymentStatus = "FREE";
    await activateModulePurchase(purchase);
    return { purchase, checkout: null };
  }
  if (!getRazorpayKeyId()) {
    throw requestError("Razorpay is not configured. Contact the learning administrator.", 503);
  }
  if (!purchase.isNew) {
    purchase.status = "PENDING";
    purchase.paymentStatus = "CREATED";
    purchase.paymentOrderId = null;
    purchase.paymentId = null;
    await purchase.save();
  } else {
    try {
      await purchase.save();
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicate = await LearningPurchase.findOne({
        userId,
        moduleId: module._id,
        status: { $in: ["PENDING", "ACTIVE"] },
      }).sort({ createdAt: -1 });
      if (duplicate?.paymentOrderId) {
        return {
          purchase: duplicate,
          checkout: {
            keyId: getRazorpayKeyId(),
            orderId: duplicate.paymentOrderId,
            amount: toMinorUnitAmount(duplicate.amount, duplicate.currency),
            currency: duplicate.currency,
            moduleTitle: module.title,
          },
        };
      }
      if (duplicate) throw requestError("A purchase is already being prepared. Retry shortly.", 409);
      throw error;
    }
  }
  const amount = toMinorUnitAmount(purchase.amount, purchase.currency);
  const order = await createRazorpayOrder({
    amount,
    currency: purchase.currency,
    receipt: String(purchase._id),
  });
  if (
    !order?.id ||
    order.amount !== amount ||
    order.currency !== purchase.currency
  ) {
    throw requestError("The payment service returned an unexpected order.", 502);
  }
  purchase.paymentOrderId = order.id;
  await purchase.save();
  return {
    purchase,
    checkout: {
      keyId: getRazorpayKeyId(),
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      moduleTitle: module.title,
    },
  };
}

export async function verifyLearningPurchase(userId, purchaseId, input) {
  const purchase = await LearningPurchase.findOne({ _id: purchaseId, userId });
  if (!purchase) throw requestError("Purchase not found.", 404);
  if (purchase.status === "ACTIVE" && purchase.paymentId === input.paymentId) return purchase;
  if (
    purchase.status !== "PENDING" ||
    purchase.paymentOrderId !== input.orderId ||
    !verifyRazorpayPaymentSignature(input)
  ) {
    throw requestError("Payment verification failed.", 400);
  }
  const payment = await getRazorpayPayment(input.paymentId);
  if (
    payment.order_id !== purchase.paymentOrderId ||
    payment.status !== "captured" ||
    payment.currency !== purchase.currency ||
    payment.amount !== toMinorUnitAmount(purchase.amount, purchase.currency)
  ) {
    throw requestError("The payment has not been confirmed by Razorpay.", 409);
  }
  purchase.paymentId = payment.id;
  purchase.paymentStatus = "CAPTURED";
  return activateModulePurchase(purchase);
}

export async function processLearningPaymentWebhook(rawBody, signature, eventId, payload) {
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    throw requestError("Invalid payment webhook signature.", 400);
  }
  if (!eventId || typeof eventId !== "string") {
    throw requestError("Payment webhook event ID is required.", 400);
  }
  let event;
  try {
    event = await LearningPaymentEvent.create({
      provider: "RAZORPAY",
      eventId,
      eventType: String(payload?.event || "unknown"),
      processingStatus: "PROCESSING",
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    event = await LearningPaymentEvent.findOneAndUpdate(
      { provider: "RAZORPAY", eventId, processingStatus: "RECEIVED" },
      { $set: { processingStatus: "PROCESSING", eventType: String(payload?.event || "unknown") } },
      { new: true },
    );
    if (!event) return { duplicate: true };
  }

  try {
    const paymentEntity = payload?.payload?.payment?.entity;
    const refundEntity = payload?.payload?.refund?.entity;
    const orderId = paymentEntity?.order_id || refundEntity?.order_id;
    const paymentId = paymentEntity?.id || refundEntity?.payment_id;
    const purchase = orderId || paymentId
      ? await LearningPurchase.findOne({
          $or: [
            ...(orderId ? [{ paymentOrderId: orderId }] : []),
            ...(paymentId ? [{ paymentId }] : []),
          ],
        })
      : null;
    let processed = false;
    if (purchase && ["PENDING", "ACTIVE"].includes(purchase.status) &&
        payload.event === "payment.captured" &&
        paymentEntity?.currency === purchase.currency &&
        paymentEntity?.amount === toMinorUnitAmount(purchase.amount, purchase.currency)) {
      purchase.paymentId = paymentId;
      purchase.paymentStatus = "CAPTURED";
      await activateModulePurchase(purchase);
      processed = true;
    } else if (purchase && purchase.status === "PENDING" && payload.event === "payment.failed") {
      purchase.paymentId = paymentId;
      purchase.paymentStatus = "FAILED";
      purchase.status = "FAILED";
      await purchase.save();
      processed = true;
    } else if (
      purchase &&
      purchase.status === "ACTIVE" &&
      payload.event === "refund.processed" &&
      Number(refundEntity?.amount) >= toMinorUnitAmount(purchase.amount, purchase.currency)
    ) {
      purchase.paymentStatus = "REFUNDED";
      purchase.status = "REFUNDED";
      await purchase.save();
      processed = true;
    }
    event.processingStatus = processed ? "PROCESSED" : "IGNORED";
    event.processedAt = new Date();
    await event.save();
    return { duplicate: false, processed };
  } catch (error) {
    await LearningPaymentEvent.updateOne(
      { _id: event._id, processingStatus: "PROCESSING" },
      { $set: { processingStatus: "RECEIVED" } },
    );
    throw error;
  }
}

export async function listAdminLearningPurchases(pageInput, limitInput) {
  const page = normalizePage(pageInput, 1);
  const limit = Math.min(MAX_PAGE_SIZE, normalizePage(limitInput, 20));
  const [purchases, total] = await Promise.all([
    LearningPurchase.find()
      .populate("userId", "name email")
      .populate("programId", "title language")
      .populate("moduleId", "title sequence")
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LearningPurchase.countDocuments(),
  ]);
  return { purchases, page, limit, total };
}

export async function reviewLearningPurchase(adminId, purchaseId, status) {
  if (!["REJECTED", "REVOKED"].includes(status)) {
    throw requestError("Administrators may reject or revoke access; only verified payment can activate it.");
  }
  const purchase = await LearningPurchase.findByIdAndUpdate(
    purchaseId,
    { $set: { status, reviewedBy: adminId, reviewedAt: new Date() } },
    { new: true, runValidators: true },
  );
  if (!purchase) throw requestError("Purchase request not found.", 404);
  return purchase;
}

export async function getStudentModule(userId, programId, moduleId) {
  const currentModule = await LearningModule.findOne({
    _id: moduleId,
    programId,
    status: "PUBLISHED",
    deletedAt: null,
  })
    .select("_id programId currentPublishedVersion prerequisites");
  if (!currentModule) throw requestError("Learning module not found.", 404);
  await requirePublishedProgram(currentModule.programId);
  await requireModulePurchase(userId, currentModule);
  const progress = await loadProgress(userId, currentModule);
  const module = await getModuleVersion(
    currentModule,
    progress.moduleVersion || currentModule.currentPublishedVersion || 1,
  );
  await requireModulePrerequisites(userId, module);
  const program = await LearningProgram.findOne({
    _id: module.programId,
    status: "PUBLISHED",
    deletedAt: null,
  }).select("title");
  if (!program) throw requestError("The course for this module is unavailable.", 404);
  const certificate = await LearningCertificate.findOne({ userId, moduleId }).select("code earnedAt");
  return {
    program: { title: program.title },
    module: serializeStudentModule(module),
    progress: studentProgressSummary(progress),
    certificate,
  };
}

export async function getStudentTopic(userId, programId, moduleId, topicId) {
  const currentModule = await LearningModule.findOne({
    _id: moduleId,
    programId,
    status: "PUBLISHED",
    deletedAt: null,
  })
    .select("_id programId currentPublishedVersion prerequisites");
  if (!currentModule) throw requestError("Learning module not found.", 404);
  await requirePublishedProgram(currentModule.programId);
  await requireModulePurchase(userId, currentModule);
  const progress = await loadProgress(userId, currentModule);
  const module = await getModuleVersion(
    currentModule,
    progress.moduleVersion || currentModule.currentPublishedVersion || 1,
  );
  await requireModulePrerequisites(userId, module);
  const topic = await getVersionedTopic(module, topicId);
  if (!topic) throw requestError("Topic not found in this module.", 404);
  requireTopicPrerequisites(topic, progress);
  const topicProgress = await LearningProgress.findOne({ userId, moduleId: module._id })
    .select("moduleVersion completedObjectiveKeys objectiveEvidence objectiveProfiles taskAttempts")
    .lean();
  const objectives = getTopicObjectives(topic);
  const firstAvailable = objectives.find((objective) =>
    getObjectiveProgress(topic, topicProgress).find((state) =>
      state.objectiveKey === objective.key && state.state !== "MASTERED",
    ),
  );
  const activeObjective = firstAvailable && getObjectiveProgress(topic, topicProgress)
    .find((state) => state.objectiveKey === firstAvailable.key && state.prerequisitesMet);
  return {
    topic: studentTopic(topic),
    objectiveProgress: getObjectiveProgress(
      topic,
      topicProgress,
      activeObjective?.objectiveKey || "",
    ).map(({ objectiveKey, state }) => ({ objectiveKey, state })),
    taskResults: (topicProgress?.taskAttempts || [])
      .filter((attempt) =>
        sameId(attempt.topicId, topic._id) &&
        Number(attempt.moduleVersion) === Number(topicProgress?.moduleVersion),
      )
      .map((attempt) => ({
        taskId: attempt.taskId,
        accepted: attempt.accepted,
        status: attempt.status,
        feedback: attempt.feedback,
        createdAt: attempt.createdAt,
      })),
  };
}

export async function requestLearningSession(userId, moduleId, topicId, language) {
  language = normalizeTutorLanguage(language);
  const { module, progress } = await getEntitledModuleForStudent(userId, moduleId);
  const topic = getTopic(module, topicId);
  if (!topic) throw requestError("Topic not found in this module.", 404);
  requireTopicPrerequisites(topic, progress);
  const topicStates = getObjectiveProgress(topic, progress);
  if (topicStates.length && topicStates.every((state) => state.state === "MASTERED")) {
    throw requestError("All required objectives for this topic are already mastered.", 409);
  }
  let session = await LearningSession.findOne({
    userId,
    moduleId,
    topicId,
    moduleVersion: progress.moduleVersion || module.currentPublishedVersion || 1,
  })
    .sort({ updatedAt: -1 });
  if (!session) {
    session = new LearningSession({
      userId,
      moduleId,
      topicId,
      moduleVersion: progress.moduleVersion || module.currentPublishedVersion || 1,
      language,
    });
  } else {
    session.language = language;
  }
  await session.save();
  return session;
}

export async function getLearningSession(userId, sessionId) {
  const session = await LearningSession.findOne({ _id: sessionId, userId });
  if (!session) throw requestError("Learning session not found.", 404);
  const currentModule = await LearningModule.findOne({
    _id: session.moduleId,
    status: "PUBLISHED",
    deletedAt: null,
  })
    .select("_id programId currentPublishedVersion prerequisites");
  if (!currentModule) throw requestError("Learning module not found.", 404);
  await requirePublishedProgram(currentModule.programId);
  await requireModulePurchase(userId, currentModule);
  const module = await getModuleVersion(currentModule, session.moduleVersion);
  await requireModulePrerequisites(userId, module);
  const topic = await getVersionedTopic(module, session.topicId);
  if (!topic) throw requestError("The topic for this learning session is no longer available.", 404);
  const progress = await loadProgress(userId, module._id);
  requireTopicPrerequisites(topic, progress);
  return { session, module, topic };
}

export async function askLearningTutor(
  userId,
  sessionId,
  message,
  language,
  inputTranscribedFromSpeech = false,
  studentName = "",
) {
  const prompt = String(message || "").trim();
  if (!prompt || prompt.length > 2000) {
    throw requestError("Your message must contain between 1 and 2000 characters.");
  }
  language = normalizeTutorLanguage(language);
  const displayName = String(studentName || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  const { session, module, topic } = await getLearningSession(userId, sessionId);
  const progress = await LearningProgress.findOne({ userId, moduleId: module._id })
    .select("moduleVersion completedTopicIds completedObjectiveKeys completedExerciseIds assessmentPassed objectiveEvidence objectiveProfiles")
    .lean();
  const objectives = getTopicObjectives(topic);
  const topicStates = getObjectiveProgress(topic, progress);
  const activeObjective = objectives.find((objective) =>
    topicStates.some((state) =>
      state.objectiveKey === objective.key &&
      state.state !== "MASTERED" &&
      state.prerequisitesMet,
    ),
  );
  const activeProfile = progress?.objectiveProfiles?.find(
    (profile) =>
      profile.objectiveKey === activeObjective?.key &&
      Number(profile.moduleVersion) === Number(progress.moduleVersion),
  );
  if (!activeObjective) {
    throw requestError("All required objectives for this topic are already mastered.", 409);
  }
  const priorMessages = session.messages.slice(-MAX_SESSION_MESSAGES);
  const startedAt = Date.now();
  const providerName = String(config.AI_PROVIDER || "ollama").trim().toLowerCase();
  const model = String(config.AI_MODEL || "").trim();
  try {
    const provider = createTutorProvider(config);
    const reply = await provider.generateReply({
      topic,
      studentName: displayName,
      approvedContent: approvedTopicContext(topic, activeObjective?.key),
      progressContext: {
        completedTopics: progress?.completedTopicIds?.length || 0,
        totalTopics: module.topics.length,
        completedExercises: progress?.completedExerciseIds?.length || 0,
        assessmentPassed: progress?.assessmentPassed === true,
      },
      objectiveProgress: {
        total: objectives.length,
        currentObjective: activeObjective
          ? {
              key: activeObjective.key,
              title: activeObjective.title,
              expectedOutcome: activeObjective.expectedOutcome,
              masteryCriteria: activeObjective.masteryCriteria,
              commonMisconceptions: activeObjective.commonMisconceptions,
              priorUnderstanding: activeProfile
                ? {
                    demonstratedCount: activeProfile.demonstratedCount,
                    missingConcepts: activeProfile.missingConcepts,
                    misconceptions: activeProfile.misconceptions,
                    teachingSignals: activeProfile.teachingSignals,
                  }
                : null,
            }
          : null,
        states: topicStates.map(({ objectiveKey, state }) => ({ objectiveKey, state })),
      },
      advancedSettings: module.aiConfiguration?.advancedSettings || {},
      history: [
        ...priorMessages,
        { role: "user", content: prompt },
      ].map(({ role, content }) => ({ role, content })),
      language,
      inputTranscribedFromSpeech,
    });
    const messageIndex = Math.min(session.messages.length, MAX_SESSION_MESSAGES - 2);
    session.language = language;
    session.messages.push(
      { role: "user", content: prompt },
      { role: "assistant", content: reply.content },
    );
    session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
    await session.save();
    const submittedMessage = session.messages.at(-2);
    const objectiveProgress = await loadProgress(userId, module._id);
    const evidenceDecision = evaluateObjectiveEvidence({
      topic,
      moduleVersion: session.moduleVersion,
      completedObjectiveKeys: objectiveProgress.completedObjectiveKeys || [],
      existingEvidence: objectiveProgress.objectiveEvidence || [],
      proposals: reply.objectiveEvidence || [],
      studentResponse: prompt,
      evidenceId: createHash("sha256")
        .update(`${session._id}:${session.moduleVersion}:${activeObjective.key}:${prompt.trim().toLocaleLowerCase().replace(/\s+/g, " ")}`)
        .digest("hex")
        .slice(0, 40),
      sessionId: session._id,
      messageId: submittedMessage?.messageId || randomUUID(),
      messageIndex,
    });
    let progressUpdate = null;
    if (applyEvidenceDecision(objectiveProgress, evidenceDecision, topic)) {
      progressUpdate = await updateProgressAndCertificate(
        userId,
        module,
        objectiveProgress,
      );
    }
    await LearningAiUsage.create({
      userId,
      sessionId: session._id,
      provider: reply.provider,
      model: reply.model,
      ...aiUsageFields(reply, activeObjective.key),
      responseTimeMs: Date.now() - startedAt,
      succeeded: true,
    });
    const evaluationSummary = objectiveEvaluationSummary(
      activeObjective,
      evidenceDecision,
      progressUpdate?.progress || objectiveProgress,
      topic,
      reply.content,
    );
    return {
      session,
      reply: reply.content,
      replyLanguage: "en",
      evaluation: {
        correctness: evaluationSummary.correctness,
        feedback: evaluationSummary.feedback,
        recommendedNextAction: evaluationSummary.recommendedNextAction,
      },
      objectiveProgress: getObjectiveProgress(
        topic,
        progressUpdate?.progress || objectiveProgress,
        activeObjective.key,
      )
        .map(({ objectiveKey, state }) => ({ objectiveKey, state })),
      progress: progressUpdate
        ? {
            progressPercentage: progressUpdate.progress.progressPercentage,
            completedTopicIds: progressUpdate.progress.completedTopicIds,
            completedObjectiveKeys: progressUpdate.progress.completedObjectiveKeys,
            completedExerciseIds: progressUpdate.progress.completedExerciseIds,
            assessmentPassed: progressUpdate.progress.assessmentPassed,
            completedAt: progressUpdate.progress.completedAt,
          }
        : null,
      certificate: progressUpdate?.certificate,
      certificateEmailSent: progressUpdate?.certificateEmailSent,
    };
  } catch (error) {
    await LearningAiUsage.create({
      userId,
      sessionId: session._id,
      provider: providerName || "unknown",
      model: model || "unconfigured",
      responseTimeMs: Date.now() - startedAt,
      succeeded: false,
    });
    throw error;
  }
}

async function updateProgressAndCertificate(userId, module, progress) {
  const exerciseCount = module.$locals.topicExerciseCount ?? module.topics.reduce(
    (total, topic) => total + topic.exercises.length +
      topic.subtopics.reduce((subtopicTotal, subtopic) => subtopicTotal + subtopic.exercises.length, 0),
    0,
  );
  const objectiveKeys = new Set((progress.completedObjectiveKeys || []).map(String));
  const completedObjectives = module.topics.reduce(
    (total, topic) =>
      total +
      getObjectiveProgress(topic, progress)
        .filter((objective) => objective.state === "MASTERED").length,
    0,
  );
  const objectiveCount = module.topics.reduce(
    (total, topic) => total + getTopicObjectives(topic).length,
    0,
  );
  const totalItems = objectiveCount + exerciseCount + (module.assessment?.questions?.length ? 1 : 0);
  const completedItems = completedObjectives +
    progress.completedExerciseIds.length +
    (module.assessment?.questions?.length && progress.assessmentPassed ? 1 : 0);
  progress.progressPercentage = totalItems
    ? Math.min(100, Math.round((completedItems / totalItems) * 100))
    : 0;
  await progress.save();
  const certificate = await createCertificateIfComplete(module, progress);
  const certificateEmailSent = certificate
    ? await dispatchLearningCertificateEmail(certificate._id)
    : false;
  return { progress, certificate, certificateEmailSent };
}

export async function completeLearningTopic(userId, moduleId, topicId) {
  const { module, progress } = await getEntitledModuleForStudent(userId, moduleId);
  const topic = await getVersionedTopic(module, topicId);
  if (!topic) throw requestError("Topic not found in this module.", 404);
  const objectives = getTopicObjectives(topic);
  const objectiveStates = getObjectiveProgress(topic, progress);
  const results = objectives.map((objective) => ({
    objective: objective.title,
    completed: objectiveStates.some(
      (state) => state.objectiveKey === objective.key && state.state === "MASTERED",
    ),
  }));
  const validation = {
    passed: objectives.length > 0 && results.every((result) => result.completed),
    scorePercent:     objectives.length
      ? Math.round((results.filter((result) => result.completed).length / objectives.length) * 100)
      : 0,
    results,
  };
  if (!validation.passed) {
    return {
      progress: studentProgressSummary(progress),
      certificate: null,
      passed: false,
      scorePercent: validation.scorePercent,
      results: validation.results,
    };
  }
  if (!progress.completedTopicIds.some((currentId) => sameId(currentId, topicId))) {
    progress.completedTopicIds.push(new mongoose.Types.ObjectId(topicId));
  }
  const completion = await updateProgressAndCertificate(userId, module, progress);
  return {
    ...completion,
    progress: studentProgressSummary(completion.progress),
    passed: true,
    scorePercent: validation.scorePercent,
    results: validation.results,
  };
}

export async function submitLearningAssessment(userId, moduleId, answers) {
  const { module, progress } = await getEntitledModuleForStudent(userId, moduleId);
  const assessment = module.assessment || {};
  const result = evaluateLearningAssessment(
    assessment.questions,
    answers,
    assessment.passingScorePercent,
  );
  const attemptNumber = await LearningAssessmentAttempt.countDocuments({ userId, moduleId }) + 1;
  const savedAnswers = answers && typeof answers === "object" && !Array.isArray(answers)
    ? Object.fromEntries(
        Object.entries(answers)
          .slice(0, 100)
          .map(([questionId, answer]) => [questionId, String(answer || "").slice(0, 5000)]),
      )
    : {};
  await LearningAssessmentAttempt.create({
    userId,
    moduleId,
    moduleVersion: progress.moduleVersion || module.currentPublishedVersion || 1,
    assessmentId: `${moduleId}:${progress.moduleVersion || module.currentPublishedVersion || 1}`,
    attemptNumber,
    answers: savedAnswers,
    scorePercent: result.scorePercent,
    passed: result.passed,
  });
  progress.assessmentPassed = progress.assessmentPassed || result.passed;
  progress.assessmentScorePercent = Math.max(
    progress.assessmentScorePercent || 0,
    result.scorePercent,
  );
  const completion = await updateProgressAndCertificate(userId, module, progress);
  return {
    ...completion,
    progress: studentProgressSummary(completion.progress),
    passed: progress.assessmentPassed,
    attemptPassed: result.passed,
    scorePercent: result.scorePercent,
    results: result.results,
  };
}

function normalizeTaskSubmission(type, submission) {
  if (type === "CODE") {
    const code = typeof submission === "string" ? submission : submission?.code;
    if (typeof code !== "string" || !code.trim() || code.length > 20000) {
      throw requestError("Provide Java code of no more than 20000 characters.");
    }
    return code;
  }
  if (type === "MATH") {
    const result = typeof submission === "string" ? { answer: submission } : submission;
    if (
      !result ||
      typeof result !== "object" ||
      typeof result.answer !== "string" ||
      result.answer.length > 1000 ||
      typeof (result.reasoning || "") !== "string" ||
      String(result.reasoning || "").length > 5000
    ) {
      throw requestError("Provide a mathematical answer and, when requested, calculation steps.");
    }
    return { answer: result.answer.trim(), reasoning: String(result.reasoning || "").trim() };
  }
  const response = typeof submission === "string" ? submission : submission?.response;
  if (typeof response !== "string" || !response.trim() || response.length > 5000) {
    throw requestError("Provide a written response of no more than 5000 characters.");
  }
  return response.trim();
}

function taskResponseText(type, submission) {
  if (type === "MATH") {
    return [submission.answer, submission.reasoning].filter(Boolean).join("\n");
  }
  return String(submission);
}

function taskEvaluationReply(type, result) {
  if (type === "CODE") {
    if (result.status === "ACCEPTED") return "All available tests passed.";
    if (result.status === "COMPILATION_ERROR") return "The code did not compile. Review its syntax and types, then try again.";
    if (result.status === "RUNTIME_ERROR") return "The program stopped with a runtime error. Check how it handles this input.";
    if (result.status === "TIME_LIMIT_EXCEEDED") return "The program took too long. Review its control flow and efficiency.";
    if (result.status === "MEMORY_LIMIT_EXCEEDED") return "The program exceeded the memory limit. Review its data usage.";
    if (result.status === "SYSTEM_ERROR") return "The secure code runner is temporarily unavailable. Your progress was not changed.";
    return "Some tests did not pass. Use the visible examples to find the issue.";
  }
  return result.feedback;
}

function safeTaskEvaluation(decision, topic, objective, progress, feedback, taskCriteria, type, deterministicResult) {
  const summary = objective
    ? objectiveEvaluationSummary(objective, decision, progress, topic, feedback)
    : {
        correctness: deterministicResult?.correctness || "ambiguous",
        demonstratedKnowledge: [],
        missingKnowledge: [],
        identifiedMisconceptions: [],
        evidence: [],
        masteryCriteriaResults: [],
        confidence: 0,
        feedback,
        recommendedNextAction: "CONTINUE",
      };
  const latest = new Map(
    decision.evidence.flatMap((item) => item.criteria || [])
      .map((item) => [item.criterionKey, item]),
  );
  const criteriaDemonstrated = taskCriteria
    .filter((criterion) => latest.get(criterion.key)?.demonstrated)
    .map((criterion) => criterion.key);
  const criteriaMissing = taskCriteria
    .filter((criterion) => !latest.get(criterion.key)?.demonstrated)
    .map((criterion) => criterion.key);
  let correctness = summary.correctness;
  if (type === "CODE") {
    correctness = deterministicResult?.accepted ? "correct" : "incorrect";
  } else if (type === "MATH" && deterministicResult?.correctness !== "correct") {
    correctness = deterministicResult?.correctness || "incorrect";
  }
  return {
    ...summary,
    correctness,
    criteriaDemonstrated,
    criteriaMissing,
    feedback,
  };
}

function taskSubmissionResponse(attempt, progress, module, topic) {
  const topicProgress = getObjectiveProgress(topic, progress);
  return {
    accepted: attempt.accepted,
    status: attempt.status,
    feedback: attempt.feedback,
    evaluation: {
      correctness: attempt.evaluation?.correctness || (attempt.accepted ? "correct" : "incorrect"),
      feedback: attempt.feedback,
      recommendedNextAction: attempt.evaluation?.recommendedNextAction || "CONTINUE",
    },
    objectiveProgress: topicProgress.map(({ objectiveKey, state }) => ({ objectiveKey, state })),
    progress: {
      progressPercentage: progress.progressPercentage,
      completedTopicIds: progress.completedTopicIds || [],
      completedObjectiveKeys: progress.completedObjectiveKeys || [],
      completedExerciseIds: progress.completedExerciseIds || [],
      assessmentPassed: progress.assessmentPassed === true,
      completedAt: progress.completedAt || null,
    },
    passed: Number(attempt.evaluation?.passed) || (attempt.accepted ? 1 : 0),
    total: Number(attempt.evaluation?.total) || 1,
    visibleResults: attempt.evaluation?.visibleResults || [],
    certificate: null,
    moduleId: String(module._id),
  };
}

export async function submitLearningExercise(
  userId,
  moduleId,
  topicId,
  exerciseId,
  submission,
  subtopicId = null,
  options = {},
) {
  const requestedKey = String(options.idempotencyKey || "");
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify(submission))
    .digest("hex");
  const inFlightKey = [
    id(userId),
    id(moduleId),
    id(topicId),
    id(exerciseId),
    requestedKey || requestFingerprint,
  ].join(":");
  const inFlightSubmission = taskSubmissionsInFlight.get(inFlightKey);
  if (inFlightSubmission) {
    if (inFlightSubmission.requestFingerprint !== requestFingerprint) {
      throw requestError("This task submission key was already used for a different response.", 409);
    }
    inFlightSubmission.duplicateCount += 1;
    return inFlightSubmission.promise;
  }
  const inFlightSubmissionState = {
    requestFingerprint,
    duplicateCount: 0,
    progress: null,
    idempotencyKey: "",
    promise: null,
  };
  const taskPromise = submitLearningExerciseOnce(
    userId,
    moduleId,
    topicId,
    exerciseId,
    submission,
    subtopicId,
    {
      ...options,
      requestedKey,
      registerSubmission: (progress, idempotencyKey) => {
        inFlightSubmissionState.progress = progress;
        inFlightSubmissionState.idempotencyKey = idempotencyKey;
      },
    },
  );
  inFlightSubmissionState.promise = taskPromise;
  taskSubmissionsInFlight.set(inFlightKey, inFlightSubmissionState);
  try {
    return await taskPromise;
  } finally {
    try {
      const attempt = inFlightSubmissionState.progress?.taskAttempts?.find(
        (item) => item.idempotencyKey === inFlightSubmissionState.idempotencyKey,
      );
      if (attempt && inFlightSubmissionState.duplicateCount) {
        attempt.duplicateCount = (Number(attempt.duplicateCount) || 0) +
          inFlightSubmissionState.duplicateCount;
        await inFlightSubmissionState.progress.save();
      }
    } finally {
      taskSubmissionsInFlight.delete(inFlightKey);
    }
  }
}

async function submitLearningExerciseOnce(
  userId,
  moduleId,
  topicId,
  exerciseId,
  rawSubmission,
  subtopicId,
  { sessionId = "", requestedKey = "", registerSubmission = () => {} } = {},
) {
  const { module, progress } = await getEntitledModuleForStudent(userId, moduleId);
  const topic = await getVersionedTopic(module, topicId);
  if (!topic) throw requestError("Topic not found in this module.", 404);
  requireTopicPrerequisites(topic, progress);
  const subtopic = subtopicId ? topic.subtopics.id(subtopicId) : null;
  if (subtopicId && !subtopic) throw requestError("Subtopic not found in this topic.", 404);
  const exercise = subtopic
    ? subtopic.exercises.id(exerciseId)
    : topic.exercises.id(exerciseId);
  if (!exercise) throw requestError("Exercise not found in this topic.", 404);
  const type = exercise.type || "CODE";
  if (!["ACTIVITY", "MATH", "CODE"].includes(type)) {
    throw requestError("This task type is not supported.", 400);
  }
  const normalizedSubmission = normalizeTaskSubmission(type, rawSubmission);
  const responseText = taskResponseText(type, normalizedSubmission);
  const responseHash = createHash("sha256").update(responseText).digest("hex");
  const idempotencyKey = requestedKey || createHash("sha256")
    .update(`${exerciseId}:${responseHash}`)
    .digest("hex");
  if (!/^[\w.:-]{1,100}$/.test(idempotencyKey)) {
    throw requestError("The task submission key is invalid.");
  }
  registerSubmission(progress, idempotencyKey);
  const previousAttempt = (progress.taskAttempts || []).find(
    (attempt) => attempt.idempotencyKey === idempotencyKey,
  );
  if (previousAttempt) {
    if (
      String(previousAttempt.taskId) !== String(exerciseId) ||
      previousAttempt.responseHash !== responseHash
    ) {
      throw requestError("This task submission key was already used for a different response.", 409);
    }
    previousAttempt.duplicateCount = (Number(previousAttempt.duplicateCount) || 0) + 1;
    await progress.save();
    return taskSubmissionResponse(previousAttempt, progress, module, topic);
  }
  const sessionResult = sessionId
    ? await getLearningSession(userId, sessionId)
    : { session: await requestLearningSession(userId, moduleId, topicId, "en") };
  const session = sessionResult.session;
  if (
    String(session.moduleId) !== String(moduleId) ||
    String(session.topicId) !== String(topicId) ||
    Number(session.moduleVersion) !== Number(progress.moduleVersion)
  ) {
    throw requestError("The learning session does not match this topic version.", 403);
  }
  const objectives = getTopicObjectives(topic);
  const states = getObjectiveProgress(topic, progress);
  const activeObjective = objectives.find((objective) =>
    states.some((state) =>
      state.objectiveKey === objective.key &&
      state.state !== "MASTERED" &&
      state.prerequisitesMet,
    ),
  );
  if (!activeObjective) throw requestError("All required objectives for this topic are already mastered.", 409);
  if (
    exercise.objectiveKeys?.length &&
    !exercise.objectiveKeys.map(String).includes(activeObjective.key)
  ) {
    throw requestError("This task is not available for the current learning objective.", 409);
  }
  const explicitlyLinked = (exercise.objectiveKeys || []).map(String).includes(activeObjective.key);
  const mayRecordEvidence = explicitlyLinked ||
    (type === "ACTIVITY" && !(exercise.objectiveKeys || []).length);
  const activeCriteria = activeObjective.masteryCriteria.filter((criterion) =>
    !(exercise.criterionKeys || []).length ||
    exercise.criterionKeys.map(String).includes(criterion.key),
  );
  const sourceType = type === "CODE"
    ? "CODE_TASK"
    : type === "MATH"
      ? "MATH_TASK"
      : "THEORY_TASK";
  let execution = null;
  let mathResult = null;
  let reply = null;
  let proposals = [];
  let verifiedCriteria = [];
  let taskAccepted = false;
  let taskStatus = "NEEDS_REVIEW";
  let feedback = "";
  let providerSucceeded = false;
  const startedAt = Date.now();
  const providerName = String(config.AI_PROVIDER || "ollama").trim().toLowerCase();
  const modelName = String(config.AI_MODEL || "").trim();

  if (type === "CODE") {
    if (String(exercise.language || "java").toLowerCase() !== "java") {
      throw requestError("The current secure execution engine supports Java exercises only.", 400);
    }
    if (!exercise.tests.length || exercise.tests.length > 50) {
      throw requestError("This exercise does not have a valid test set.", 409);
    }
    execution = await executionService.execute(
      normalizedSubmission,
      exercise.tests.map(({ input, expectedOutput }) => ({ input, expectedOutput })),
      "java",
      { timeLimit: 2000, memoryLimit: 65536 },
    );
    if (execution.status === "SYSTEM_ERROR") {
      throw requestError("The secure code execution service is temporarily unavailable. Your progress was not changed.", 503);
    }
    taskAccepted = execution.accepted;
    taskStatus = execution.status;
    feedback = taskEvaluationReply(type, execution);
  } else {
    if (type === "MATH") {
      mathResult = evaluateMathematicsTask(exercise, normalizedSubmission);
      taskStatus = mathResult.status;
    }
    const shouldEvaluateReasoning = type === "ACTIVITY" ||
      (type === "MATH" && Boolean(exercise.requireReasoning) && Boolean(normalizedSubmission.reasoning));
    if (shouldEvaluateReasoning) {
      const currentProfile = (progress.objectiveProfiles || []).find(
        (profile) =>
          profile.objectiveKey === activeObjective.key &&
          Number(profile.moduleVersion) === Number(progress.moduleVersion),
      );
      try {
        const provider = createTutorProvider(config);
        reply = await provider.generateReply({
          topic,
          approvedContent: approvedTopicContext(topic, activeObjective.key),
          objectiveProgress: {
            currentObjective: {
              key: activeObjective.key,
              title: activeObjective.title,
              expectedOutcome: activeObjective.expectedOutcome,
              masteryCriteria: activeCriteria,
              commonMisconceptions: activeObjective.commonMisconceptions,
              priorUnderstanding: currentProfile || null,
            },
            states: states.map(({ objectiveKey, state }) => ({ objectiveKey, state })),
          },
          evaluationTask: {
            type,
            title: exercise.title,
            instructions: exercise.instructions,
            evaluationMethod: exercise.evaluationMethod,
            expectedAnswer: type === "MATH" ? exercise.expectedAnswer : undefined,
            unit: type === "MATH" ? exercise.unit : undefined,
            requireReasoning: type === "MATH" ? exercise.requireReasoning : undefined,
          },
          progressContext: {
            completedTopics: progress.completedTopicIds?.length || 0,
            totalTopics: module.topics.length,
          },
          history: [
            ...session.messages.slice(-MAX_SESSION_MESSAGES),
            { role: "user", content: responseText },
          ].map(({ role, content }) => ({ role, content })),
          advancedSettings: module.aiConfiguration?.advancedSettings || {},
          language: "en",
        });
        proposals = mayRecordEvidence ? reply.objectiveEvidence || [] : [];
        providerSucceeded = true;
      } catch (error) {
        await LearningAiUsage.create({
          userId,
          sessionId: session._id,
          operation: "TASK_EVALUATION",
          provider: providerName || "unknown",
          model: modelName || "unconfigured",
          responseTimeMs: Date.now() - startedAt,
          succeeded: false,
        });
        throw error;
      }
    }
    verifiedCriteria = type === "MATH" &&
      mathResult.accepted &&
      !exercise.requireReasoning
      ? activeCriteria
          .filter((criterion) => criterion.evaluationMethod === "CALCULATION")
          .map((criterion) => ({
            criterionKey: criterion.key,
            sourceType,
            verificationReference: "Numerical expression validated by the deterministic evaluator.",
          }))
      : [];
    if (
      type === "MATH" &&
      !mathResult.accepted &&
      proposals.length
    ) {
      proposals = proposals.map((proposal) => ({
        ...proposal,
        criteria: proposal.criteria.filter((criterion) =>
          activeCriteria.some((approved) =>
            approved.key === criterion.criterionKey &&
            approved.evaluationMethod !== "CALCULATION",
          ),
        ),
      }));
    }
  }

  const attemptKey = idempotencyKey;
  const evidenceDecision = evaluateObjectiveEvidence({
    topic,
    moduleVersion: progress.moduleVersion,
    completedObjectiveKeys: progress.completedObjectiveKeys || [],
    existingEvidence: progress.objectiveEvidence || [],
    proposals,
    verifiedCriteria: type === "CODE" && execution.accepted && mayRecordEvidence
      ? activeCriteria
          .filter((criterion) => ["CODE", "DEBUGGING", "PRACTICAL"].includes(criterion.evaluationMethod))
          .map((criterion) => ({
            criterionKey: criterion.key,
            sourceType,
            verificationReference: `Secure Java runner accepted ${execution.passed} of ${execution.total} test cases.`,
          }))
      : mayRecordEvidence ? verifiedCriteria : [],
    studentResponse: responseText,
    sourceType,
    taskId: exerciseId,
    taskAttemptKey: attemptKey,
    evidenceId: createHash("sha256")
      .update(`${session._id}:${progress.moduleVersion}:${exerciseId}:${responseText.trim().toLocaleLowerCase().replace(/\s+/g, " ")}`)
      .digest("hex")
      .slice(0, 40),
    sessionId: session._id,
    messageId: "",
    messageIndex: Math.max(0, session.messages.length),
  });
  const matchingTaskCriteria = activeCriteria.map((criterion) => criterion.key);
  const validTaskCriteria = new Set(
    evidenceDecision.evidence.flatMap((item) => item.criteria || [])
      .filter((result) => result.demonstrated === true)
      .map((result) => result.criterionKey),
  );
  if (type === "ACTIVITY") {
    taskAccepted = matchingTaskCriteria.length > 0 &&
      matchingTaskCriteria.every((key) => validTaskCriteria.has(key));
    taskStatus = taskAccepted
      ? "CORRECT"
      : validTaskCriteria.size
        ? "PARTIALLY_CORRECT"
        : proposals.some((proposal) =>
            proposal.criteria.some((criterion) => criterion.misconceptions?.length),
          )
          ? "MISCONCEPTION_DETECTED"
          : "NEEDS_CLARIFICATION";
    feedback = reply?.content || "Please add one specific detail so I can check your understanding.";
  } else if (type === "MATH") {
    taskAccepted = mathResult.accepted && (
      !exercise.requireReasoning ||
      matchingTaskCriteria
        .filter((key) => activeCriteria.some((criterion) =>
          criterion.key === key && criterion.evaluationMethod === "CALCULATION",
        ))
        .every((key) => validTaskCriteria.has(key))
    );
    taskStatus = taskAccepted
      ? "CORRECT"
      : mathResult.status === "CORRECT"
        ? "REASONING_REQUIRED"
        : mathResult.status;
    feedback = taskAccepted
      ? reply?.content || mathResult.feedback
      : mathResult.status === "CORRECT"
        ? reply?.content || "Add the calculation reasoning before submitting again."
        : mathResult.feedback;
  }
  const visibleResults = execution
    ? execution.results
        .filter((_result, index) => exercise.tests[index]?.visible)
        .map(({ testCase, status, output, executionTime }) => ({
          testCase,
          status,
          output,
          executionTime,
        }))
    : [];
  applyEvidenceDecision(progress, evidenceDecision, topic);
  const updatedObjectiveProgress = getObjectiveProgress(topic, progress)
    .find((state) => state.objectiveKey === activeObjective.key);
  if (type === "ACTIVITY") {
    taskAccepted = matchingTaskCriteria.length > 0 &&
      matchingTaskCriteria.every((key) => {
        const criterion = updatedObjectiveProgress?.criteria.find(
          (item) => item.criterionKey === key,
        );
        return criterion &&
          criterion.demonstratedCount >= criterion.requiredEvidenceCount;
      });
    if (taskAccepted) taskStatus = "CORRECT";
  }
  const fullEvaluation = safeTaskEvaluation(
    evidenceDecision,
    topic,
    activeObjective,
    progress,
    feedback,
    activeCriteria,
    type,
    execution || mathResult,
  );
  if (type === "MATH" && mathResult.accepted && exercise.requireReasoning) {
    const calculationKeys = activeCriteria
      .filter((criterion) => criterion.evaluationMethod === "CALCULATION")
      .map((criterion) => criterion.key);
    taskAccepted = calculationKeys.length > 0 &&
      calculationKeys.every((key) => {
        const criterion = updatedObjectiveProgress?.criteria.find(
          (item) => item.criterionKey === key,
        );
        return criterion &&
          criterion.demonstratedCount >= criterion.requiredEvidenceCount;
      });
    if (!taskAccepted && taskStatus === "CORRECT") taskStatus = "REASONING_REQUIRED";
  }
  if (execution?.accepted) taskAccepted = true;
  if (
    taskAccepted &&
    !progress.completedExerciseIds.some((currentId) => sameId(currentId, exerciseId))
  ) {
    progress.completedExerciseIds.push(new mongoose.Types.ObjectId(exerciseId));
  }
  const attempt = {
    idempotencyKey,
    taskId: exercise._id,
    topicId: topic._id,
    moduleVersion: progress.moduleVersion,
    sessionId: session._id,
    responseHash,
    taskType: type,
    status: taskStatus,
    accepted: taskAccepted,
    duplicateCount: 0,
    evaluationTimeMs: Date.now() - startedAt,
    feedback: feedback.slice(0, 3000),
    evaluation: {
      ...fullEvaluation,
      passed: execution?.passed ?? (taskAccepted ? 1 : 0),
      total: execution?.total ?? 1,
      visibleResults,
    },
    createdAt: new Date(),
  };
  progress.taskAttempts ||= [];
  progress.taskAttempts.push(attempt);
  progress.taskAttempts = progress.taskAttempts.slice(-MAX_TASK_ATTEMPTS);
  let completion;
  try {
    completion = await updateProgressAndCertificate(userId, module, progress);
  } catch (error) {
    if (error?.name !== "VersionError") throw error;
    const latestProgress = await LearningProgress.findOne({ userId, moduleId: module._id });
    const concurrentAttempt = latestProgress?.taskAttempts?.find(
      (item) => item.idempotencyKey === idempotencyKey,
    );
    if (
      concurrentAttempt &&
      concurrentAttempt.responseHash === responseHash &&
      String(concurrentAttempt.taskId) === String(exerciseId)
    ) {
      return taskSubmissionResponse(concurrentAttempt, latestProgress, module, topic);
    }
    throw requestError("Learning progress changed while this response was being evaluated. Retry the submission.", 409);
  }
  if (providerSucceeded) {
    await LearningAiUsage.create({
      userId,
      sessionId: session._id,
      operation: "TASK_EVALUATION",
      provider: reply.provider,
      model: reply.model,
      ...aiUsageFields(reply, activeObjective.key),
      responseTimeMs: Date.now() - startedAt,
      succeeded: true,
    });
  }
  return {
    ...taskSubmissionResponse(attempt, completion.progress, module, topic),
    certificate: completion.certificate,
    certificateEmailSent: completion.certificateEmailSent,
  };
}

export async function getLearningDashboard(userId, pageInput, limitInput) {
  const page = normalizePage(pageInput, 1);
  const limit = Math.min(MAX_PAGE_SIZE, normalizePage(limitInput, 20));
  const skip = (page - 1) * limit;
  const [progress, purchases, certificates, progressCount, completedModules, purchaseCount, certificateCount] =
    await Promise.all([
      LearningProgress.find({ userId })
        .populate("moduleId", "title programId sequence")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LearningPurchase.find({ userId })
        .populate("programId", "title")
        .populate("moduleId", "title sequence")
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LearningCertificate.find({ userId })
        .populate("programId", "title")
        .populate("moduleId", "title sequence")
        .sort({ earnedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LearningProgress.countDocuments({ userId }),
      LearningProgress.countDocuments({ userId, completedAt: { $ne: null } }),
      LearningPurchase.countDocuments({ userId }),
      LearningCertificate.countDocuments({ userId }),
    ]);
  return {
    progress: progress.map(studentProgressSummary),
    purchases,
    certificates,
    page,
    limit,
    totals: { progress: progressCount, completedModules, purchases: purchaseCount, certificates: certificateCount },
  };
}
