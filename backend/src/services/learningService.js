import { randomUUID } from "node:crypto";
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

const MAX_PAGE_SIZE = 50;
const MAX_SESSION_MESSAGES = 40;
const supportedTutorLanguages = new Set([
  "en",
  "ta",
  "hi",
  "ml",
  "te",
  "bn",
  "kn",
  "mr",
  "gu",
  "pa",
]);

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
  result.tests = (result.tests || [])
    .filter((testCase) => testCase.visible)
    .map(({ expectedOutput, ...testCase }) => testCase);
  return result;
}

function studentTopic(topic) {
  const result = topic.toObject ? topic.toObject() : { ...topic };
  delete result.tutorInstructions;
  delete result.validationInstructions;
  result.questions = (result.questions || []).map(studentQuestion);
  result.exercises = (result.exercises || []).map(studentExercise);
  result.subtopics = (result.subtopics || []).map((subtopic) => ({
    ...subtopic,
    questions: (subtopic.questions || []).map(studentQuestion),
    exercises: (subtopic.exercises || []).map(studentExercise),
  }));
  return result;
}

export function serializeStudentModule(module) {
  const result = module.toObject ? module.toObject() : { ...module };
  delete result.aiConfiguration;
  delete result.currentPublishedVersion;
  result.topics = (result.topics || []).map(({ _id, title, description, objectives }) => ({
    _id,
    title,
    description,
    objectives,
  }));
  result.assessment ||= { questions: [] };
  result.assessment.questions = (result.assessment?.questions || []).map(studentQuestion);
  return result;
}

function approvedTopicContext(topic) {
  const plain = topic.toObject ? topic.toObject() : topic;
  return JSON.stringify({
    title: plain.title,
    description: plain.description,
    explanation: plain.explanation,
    tutorInstructions: plain.tutorInstructions,
    validationInstructions: plain.validationInstructions,
    objectives: plain.objectives,
    examples: plain.examples,
    questions: (plain.questions || []).map(({ prompt, question }) => ({ prompt, question })),
    exercises: (plain.exercises || []).map(({ type, title, instructions, starterCode, language }) => ({
      type,
      title,
      instructions,
      starterCode,
      language,
    })),
    subtopics: (plain.subtopics || []).map(({
      title,
      explanation,
      objectives,
      examples,
      exercises,
    }) => ({
      title,
      explanation,
      objectives,
      examples,
      exercises: (exercises || []).map(({ type, title: exerciseTitle, instructions, starterCode, language }) => ({
        type,
        title: exerciseTitle,
        instructions,
        starterCode,
        language,
      })),
    })),
  }).slice(0, 16000);
}

function validateModuleCompletionConfiguration(module) {
  const topics = (module.topics || []).filter((topic) => String(topic.title || "").trim());
  if (!topics.length) {
    throw requestError(`Module "${module.title}" needs at least one topic before it can be published.`);
  }
  if (topics.some((topic) => !String(topic.explanation || "").trim())) {
    throw requestError(`Every topic in "${module.title}" needs lesson content before publishing.`);
  }
  if (topics.some((topic) => !(topic.questions || []).some((question) =>
    String(question.prompt || "").trim() && String(question.expectedAnswer || "").trim()
  ))) {
    throw requestError(`Every topic in "${module.title}" needs at least one validation question with an expected answer before publishing.`);
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
  const topicSummaries = topics.map(({ _id, title, description, objectives }) => ({
    _id,
    title,
    description,
    objectives,
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
  "examples",
  "questions",
  "exercises",
  "subtopics",
];

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
  const [purchases, progress] = await Promise.all([
    LearningPurchase.find({
      userId,
      status: { $in: ["PENDING", "ACTIVE", "EXPIRED"] },
      moduleId: { $in: moduleIds },
    }).select("programId moduleId status accessExpiresAt").lean(),
    LearningProgress.find({ userId, moduleId: { $in: moduleIds } })
      .select("moduleId completedTopicIds completedAt assessmentPassed")
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
            progress: moduleProgress
              ? {
                  completedTopics: moduleProgress.completedTopicIds.length,
                  completed: Boolean(moduleProgress.completedAt),
                  assessmentPassed: moduleProgress.assessmentPassed,
                }
              : { completedTopics: 0, completed: false, assessmentPassed: false },
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
    status: "PUBLISHED",
    createdBy: userId,
    updatedBy: userId,
    publishedAt: new Date(),
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
    if (input.status === "PUBLISHED" && program.status !== "PUBLISHED") {
      program.publishedAt = new Date();
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
    progress: progress || {
      completedTopicIds: [],
      completedExerciseIds: [],
      assessmentPassed: false,
      assessmentScorePercent: 0,
      completedAt: null,
    },
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
  return { topic: studentTopic(topic) };
}

export async function requestLearningSession(userId, moduleId, topicId, language) {
  if (!supportedTutorLanguages.has(language)) {
    throw requestError("Tutor language must be English or Tamil.");
  }
  const { module, progress } = await getEntitledModuleForStudent(userId, moduleId);
  const topic = getTopic(module, topicId);
  if (!topic) throw requestError("Topic not found in this module.", 404);
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
  return { session, module, topic };
}

export async function askLearningTutor(
  userId,
  sessionId,
  message,
  language,
  inputTranscribedFromSpeech = false,
) {
  const prompt = String(message || "").trim();
  if (!prompt || prompt.length > 2000) {
    throw requestError("Your message must contain between 1 and 2000 characters.");
  }
  if (!supportedTutorLanguages.has(language)) {
    throw requestError("Tutor language must be English or Tamil.");
  }
  const { session, module, topic } = await getLearningSession(userId, sessionId);
  const progress = await LearningProgress.findOne({ userId, moduleId: module._id })
    .select("completedTopicIds completedExerciseIds assessmentPassed")
    .lean();
  const priorMessages = session.messages.slice(-MAX_SESSION_MESSAGES);
  const startedAt = Date.now();
  const providerName = String(config.AI_PROVIDER || "ollama").trim().toLowerCase();
  const model = String(config.AI_MODEL || "").trim();
  try {
    const provider = createTutorProvider(config);
    const reply = await provider.generateReply({
      topic,
      approvedContent: approvedTopicContext(topic),
      progressContext: {
        completedTopics: progress?.completedTopicIds?.length || 0,
        totalTopics: module.topics.length,
        completedExercises: progress?.completedExerciseIds?.length || 0,
        assessmentPassed: progress?.assessmentPassed === true,
      },
      moduleBehavior: module.aiConfiguration?.behaviorPrompt || "",
      topicBehavior: topic.tutorInstructions || "",
      validationInstructions: topic.validationInstructions || "",
      advancedSettings: module.aiConfiguration?.advancedSettings || {},
      history: [
        ...priorMessages,
        { role: "user", content: prompt },
      ].map(({ role, content }) => ({ role, content })),
      language,
      inputTranscribedFromSpeech,
    });
    session.language = language;
    session.messages.push(
      { role: "user", content: prompt },
      { role: "assistant", content: reply.content },
    );
    session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
    await session.save();
    await LearningAiUsage.create({
      userId,
      sessionId: session._id,
      provider: reply.provider,
      model: reply.model,
      responseTimeMs: Date.now() - startedAt,
      succeeded: true,
    });
    return { session, reply: reply.content };
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
  const totalItems = module.topics.length + exerciseCount + (module.assessment?.questions?.length ? 1 : 0);
  const completedItems = progress.completedTopicIds.length +
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

export async function completeLearningTopic(userId, moduleId, topicId, answers = {}) {
  const { module, progress } = await getEntitledModuleForStudent(userId, moduleId);
  const topic = await getVersionedTopic(module, topicId);
  if (!topic) throw requestError("Topic not found in this module.", 404);
  const validation = topic.questions?.length
    ? evaluateLearningAssessment(topic.questions, answers, 100)
    : { passed: true, scorePercent: 100, results: [] };
  if (!validation.passed) {
    return {
      progress,
      certificate: null,
      passed: false,
      scorePercent: validation.scorePercent,
      results: validation.results,
    };
  }
  if (!progress.completedTopicIds.some((currentId) => sameId(currentId, topicId))) {
    progress.completedTopicIds.push(new mongoose.Types.ObjectId(topicId));
  }
  return {
    ...(await updateProgressAndCertificate(userId, module, progress)),
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
    passed: progress.assessmentPassed,
    attemptPassed: result.passed,
    scorePercent: result.scorePercent,
    results: result.results,
  };
}

export async function submitLearningExercise(
  userId,
  moduleId,
  topicId,
  exerciseId,
  code,
  subtopicId = null,
) {
  if (typeof code !== "string" || !code.trim() || code.length > 20000) {
    throw requestError("Provide a response of no more than 20000 characters.");
  }
  const { module, progress } = await getEntitledModuleForStudent(userId, moduleId);
  const topic = await getVersionedTopic(module, topicId);
  if (!topic) throw requestError("Topic not found in this module.", 404);
  const subtopic = subtopicId ? topic.subtopics.id(subtopicId) : null;
  if (subtopicId && !subtopic) throw requestError("Subtopic not found in this topic.", 404);
  const exercise = subtopic
    ? subtopic.exercises.id(exerciseId)
    : topic.exercises.id(exerciseId);
  if (!exercise) throw requestError("Exercise not found in this topic.", 404);
  if (exercise.type === "ACTIVITY") {
    if (!progress.completedExerciseIds.some((currentId) => sameId(currentId, exerciseId))) {
      progress.completedExerciseIds.push(new mongoose.Types.ObjectId(exerciseId));
    }
    const completion = await updateProgressAndCertificate(userId, module, progress);
    return {
      ...completion,
      accepted: true,
      status: "COMPLETED",
      passed: 1,
      total: 1,
      visibleResults: [],
    };
  }
  if (String(exercise.language || "java").toLowerCase() !== "java") {
    throw requestError("The current secure execution engine supports Java exercises only.", 400);
  }
  if (!exercise.tests.length || exercise.tests.length > 50) {
    throw requestError("This exercise does not have a valid test set.", 409);
  }
  const execution = await executionService.execute(
    code,
    exercise.tests.map(({ input, expectedOutput }) => ({ input, expectedOutput })),
    "java",
    { timeLimit: 2000, memoryLimit: 65536 },
  );
  if (execution.status === "SYSTEM_ERROR") {
    throw requestError("The secure code execution service is temporarily unavailable.", 503);
  }
  if (execution.accepted && !progress.completedExerciseIds.some((currentId) => sameId(currentId, exerciseId))) {
    progress.completedExerciseIds.push(new mongoose.Types.ObjectId(exerciseId));
  }
  const completion = await updateProgressAndCertificate(userId, module, progress);
  return {
    ...completion,
    accepted: execution.accepted,
    status: execution.status,
    passed: execution.passed,
    total: execution.total,
    visibleResults: execution.results
      .filter((_result, index) => exercise.tests[index]?.visible)
      .map(({ testCase, status, output, executionTime }) => ({
        testCase,
        status,
        output,
        executionTime,
      })),
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
    progress,
    purchases,
    certificates,
    page,
    limit,
    totals: { progress: progressCount, completedModules, purchases: purchaseCount, certificates: certificateCount },
  };
}
