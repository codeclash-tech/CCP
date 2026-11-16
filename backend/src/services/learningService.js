import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import LearningAiUsage from "../models/LearningAiUsage.js";
import LearningCertificate from "../models/LearningCertificate.js";
import LearningModule from "../models/LearningModule.js";
import LearningProgress from "../models/LearningProgress.js";
import LearningProgram from "../models/LearningProgram.js";
import LearningPurchase from "../models/LearningPurchase.js";
import LearningSession from "../models/LearningSession.js";
import config from "../config/env.js";
import { executionService } from "./executionService.js";
import { createTutorProvider } from "./learningAiProvider.js";
import {
  evaluateLearningAssessment,
  meetsModuleCompletionRequirements,
} from "./learningProgress.js";

const MAX_PAGE_SIZE = 50;
const MAX_SESSION_MESSAGES = 40;
const supportedTutorLanguages = new Set(["en", "ta"]);

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
  result.topics = (result.topics || []).map(studentTopic);
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
    objectives: plain.objectives,
    examples: plain.examples,
    subtopics: (plain.subtopics || []).map(({ title, explanation, objectives, examples }) => ({
      title,
      explanation,
      objectives,
      examples,
    })),
  }).slice(0, 16000);
}

function validateModuleCompletionConfiguration(module) {
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

async function loadProgress(userId, moduleId) {
  return LearningProgress.findOneAndUpdate(
    { userId, moduleId },
    { $setOnInsert: { userId, moduleId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
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
        earnedAt: progress.completedAt,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

async function requireModuleAccess(userId, module) {
  const program = await LearningProgram.findById(module.programId).select("status title");
  if (!program || program.status !== "PUBLISHED") {
    throw requestError("This learning program is not currently available.", 404);
  }

  const purchase = await LearningPurchase.exists({
    userId,
    status: "ACTIVE",
    $or: [{ programId: module.programId }, { moduleId: module._id }],
  });
  if (!purchase) throw requestError("Purchase this program or module to continue.", 403);

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
  return program;
}

export async function listLearningPrograms(userId, pageInput, limitInput) {
  const page = normalizePage(pageInput, 1);
  const limit = Math.min(MAX_PAGE_SIZE, normalizePage(limitInput, 20));
  const filter = { status: "PUBLISHED" };
  const [programs, total] = await Promise.all([
    LearningProgram.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LearningProgram.countDocuments(filter),
  ]);
  if (!programs.length) return { programs: [], page, limit, total };

  const programIds = programs.map((program) => program._id);
  const modules = await LearningModule.find({ programId: { $in: programIds } })
    .select("programId title description price difficulty sequence estimatedDurationMinutes prerequisites")
    .sort({ programId: 1, sequence: 1 })
    .lean();
  const moduleIds = modules.map((module) => module._id);
  const [purchases, progress] = await Promise.all([
    LearningPurchase.find({
      userId,
      status: { $in: ["PENDING", "ACTIVE"] },
      $or: [{ programId: { $in: programIds } }, { moduleId: { $in: moduleIds } }],
    }).select("programId moduleId status").lean(),
    LearningProgress.find({ userId, moduleId: { $in: moduleIds } })
      .select("moduleId completedTopicIds completedAt assessmentPassed")
      .lean(),
  ]);
  const purchaseFor = (module) =>
    purchases.find((purchase) =>
      purchase.status === "ACTIVE" &&
      (sameId(purchase.programId, module.programId) ||
        sameId(purchase.moduleId, module._id)),
    ) ||
    purchases.find((purchase) =>
      sameId(purchase.programId, module.programId) ||
      sameId(purchase.moduleId, module._id),
    );
  const progressByModule = new Map(progress.map((entry) => [id(entry.moduleId), entry]));
  const programPurchase = (programId) =>
    purchases.find((purchase) =>
      sameId(purchase.programId, programId) && purchase.status === "ACTIVE",
    ) || purchases.find((purchase) => sameId(purchase.programId, programId));
  const activeCompleted = new Set(progress.filter((entry) => entry.completedAt).map((entry) => id(entry.moduleId)));

  return {
    programs: programs.map((program) => ({
      ...program,
      modules: modules
        .filter((module) => sameId(module.programId, program._id))
        .map((module) => {
          const purchase = purchaseFor(module);
          const moduleProgress = progressByModule.get(id(module._id));
          const prerequisitesMet = (module.prerequisites || []).every((prerequisite) =>
            activeCompleted.has(id(prerequisite)),
          );
          return {
            ...module,
            hasAccess: purchase?.status === "ACTIVE" && prerequisitesMet,
            purchaseStatus: purchase?.status || null,
            progress: moduleProgress
              ? {
                  completedTopics: moduleProgress.completedTopicIds.length,
                  completed: Boolean(moduleProgress.completedAt),
                  assessmentPassed: moduleProgress.assessmentPassed,
                }
              : { completedTopics: 0, completed: false, assessmentPassed: false },
          };
        }),
      purchaseStatus: programPurchase(program._id)?.status || null,
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
    LearningProgram.find()
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LearningProgram.countDocuments(),
  ]);
  const modules = programs.length
    ? await LearningModule.find({ programId: { $in: programs.map((program) => program._id) } })
        .select("programId title description price difficulty sequence estimatedDurationMinutes")
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
  const program = new LearningProgram({
    title: input.title,
    description: input.description,
    language: input.language,
    price: input.price,
    createdBy: userId,
    updatedBy: userId,
  });
  await program.save();
  return program;
}

export async function createJavaLearningProgramStructure(userId) {
  const existing = await LearningProgram.exists({ title: "Java", language: "java" });
  if (existing) throw requestError("A Java learning program already exists.", 409);

  const program = new LearningProgram({
    title: "Java",
    description: "Java learning program. Add official course content before publishing.",
    language: "java",
    price: 0,
    createdBy: userId,
    updatedBy: userId,
  });
  await program.save();
  try {
    await LearningModule.insertMany(
      Array.from({ length: 10 }, (_item, index) => ({
        programId: program._id,
        title: `Module ${index + 1}`,
        description: "Add Super Admin-authored content before publishing this module.",
        price: 0,
        difficulty: "BEGINNER",
        sequence: index + 1,
        estimatedDurationMinutes: 60,
        topics: [],
        completionRequirements: {
          minCompletedTopics: 1,
          requiredExercises: 0,
          requireAssessment: false,
        },
      })),
    );
  } catch (error) {
    try {
      await Promise.all([
        LearningModule.deleteMany({ programId: program._id }),
        LearningProgram.deleteOne({ _id: program._id }),
      ]);
    } catch (cleanupError) {
      console.error("[Learning] Failed to clean up an incomplete Java program template.", {
        programId: String(program._id),
        error: cleanupError.message,
      });
    }
    throw error;
  }
  return program;
}

export async function updateLearningProgram(userId, programId, input) {
  const program = await LearningProgram.findById(programId);
  if (!program) throw requestError("Learning program not found.", 404);
  for (const field of ["title", "description", "language", "price"]) {
    if (input[field] !== undefined) program[field] = input[field];
  }
  if (input.status !== undefined) {
    if (!["DRAFT", "PUBLISHED"].includes(input.status)) {
      throw requestError("Program status must be DRAFT or PUBLISHED.");
    }
    if (input.status === "PUBLISHED" && program.status !== "PUBLISHED") {
      const modules = await LearningModule.find({ programId: program._id });
      if (!modules.length || modules.some((module) => module.topics.length === 0)) {
        throw requestError("Add at least one topic to every module before publishing this program.");
      }
      modules.forEach(validateModuleCompletionConfiguration);
      program.publishedAt = new Date();
    }
    program.status = input.status;
  }
  program.updatedBy = userId;
  await program.save();
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

export async function createLearningModule(programId, input) {
  const program = await LearningProgram.findById(programId);
  if (!program) throw requestError("Learning program not found.", 404);
  const prerequisites = await validatePrerequisites(programId, input.prerequisites || []);
  const module = new LearningModule({
    ...input,
    programId,
    prerequisites,
  });
  if (program.status === "PUBLISHED") validateModuleCompletionConfiguration(module);
  await module.save();
  return module;
}

export async function getAdminLearningModule(moduleId) {
  const module = await LearningModule.findById(moduleId);
  if (!module) throw requestError("Learning module not found.", 404);
  return module;
}

export async function updateLearningModule(moduleId, input) {
  const module = await LearningModule.findById(moduleId);
  if (!module) throw requestError("Learning module not found.", 404);
  const fields = [
    "title",
    "description",
    "objectives",
    "price",
    "difficulty",
    "sequence",
    "estimatedDurationMinutes",
    "topics",
    "assessment",
    "completionRequirements",
  ];
  for (const field of fields) {
    if (input[field] !== undefined) module[field] = input[field];
  }
  if (input.prerequisites !== undefined) {
    module.prerequisites = await validatePrerequisites(
      module.programId,
      input.prerequisites,
      module._id,
    );
  }
  const program = await LearningProgram.findById(module.programId).select("status");
  if (program?.status === "PUBLISHED") validateModuleCompletionConfiguration(module);
  await module.save();
  return module;
}

export async function createLearningPurchase(userId, input) {
  const hasProgramId = Boolean(input.programId);
  const hasModuleId = Boolean(input.moduleId);
  if (hasProgramId === hasModuleId) {
    throw requestError("Choose exactly one program or module to purchase.");
  }
  let purchaseTarget;
  if (hasProgramId) {
    purchaseTarget = await LearningProgram.findOne({
      _id: input.programId,
      status: "PUBLISHED",
    }).select("_id price");
    if (!purchaseTarget) throw requestError("Learning program not found.", 404);
  } else {
    purchaseTarget = await LearningModule.findById(input.moduleId).select("programId price");
    if (!purchaseTarget) throw requestError("Learning module not found.", 404);
    const program = await LearningProgram.findOne({
      _id: purchaseTarget.programId,
      status: "PUBLISHED",
    }).select("_id");
    if (!program) throw requestError("Learning program not found.", 404);
  }
  const targetFilter = hasProgramId
    ? { programId: input.programId, moduleId: null }
    : { programId: null, moduleId: input.moduleId };
  const existing = await LearningPurchase.findOne({
    userId,
    ...targetFilter,
    status: { $in: ["PENDING", "ACTIVE"] },
  });
  if (existing) return existing;
  const purchase = new LearningPurchase({
    userId,
    ...targetFilter,
    amount: purchaseTarget.price,
    currency: "INR",
  });
  await purchase.save();
  return purchase;
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
  if (!["ACTIVE", "REJECTED", "REVOKED"].includes(status)) {
    throw requestError("Purchase status must be ACTIVE, REJECTED, or REVOKED.");
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
  const module = await LearningModule.findOne({ _id: moduleId, programId });
  if (!module) throw requestError("Learning module not found.", 404);
  const program = await requireModuleAccess(userId, module);
  const progress = await LearningProgress.findOne({ userId, moduleId });
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

export async function requestLearningSession(userId, moduleId, topicId, language) {
  if (!supportedTutorLanguages.has(language)) {
    throw requestError("Tutor language must be English or Tamil.");
  }
  const module = await LearningModule.findById(moduleId);
  if (!module) throw requestError("Learning module not found.", 404);
  await requireModuleAccess(userId, module);
  const topic = getTopic(module, topicId);
  if (!topic) throw requestError("Topic not found in this module.", 404);
  let session = await LearningSession.findOne({ userId, moduleId, topicId })
    .sort({ updatedAt: -1 });
  if (!session) {
    session = new LearningSession({ userId, moduleId, topicId, language });
  } else {
    session.language = language;
  }
  await session.save();
  return session;
}

export async function getLearningSession(userId, sessionId) {
  const session = await LearningSession.findOne({ _id: sessionId, userId });
  if (!session) throw requestError("Learning session not found.", 404);
  const module = await LearningModule.findById(session.moduleId);
  if (!module) throw requestError("Learning module not found.", 404);
  await requireModuleAccess(userId, module);
  const topic = getTopic(module, session.topicId);
  if (!topic) throw requestError("The topic for this learning session is no longer available.", 404);
  return { session, module, topic };
}

export async function askLearningTutor(userId, sessionId, message, language) {
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
      history: priorMessages.map(({ role, content }) => ({ role, content })),
      language,
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
  await progress.save();
  const certificate = await createCertificateIfComplete(module, progress);
  return { progress, certificate };
}

export async function completeLearningTopic(userId, moduleId, topicId) {
  const module = await LearningModule.findById(moduleId);
  if (!module) throw requestError("Learning module not found.", 404);
  await requireModuleAccess(userId, module);
  if (!getTopic(module, topicId)) throw requestError("Topic not found in this module.", 404);
  const progress = await loadProgress(userId, moduleId);
  if (!progress.completedTopicIds.some((currentId) => sameId(currentId, topicId))) {
    progress.completedTopicIds.push(new mongoose.Types.ObjectId(topicId));
  }
  return updateProgressAndCertificate(userId, module, progress);
}

export async function submitLearningAssessment(userId, moduleId, answers) {
  const module = await LearningModule.findById(moduleId);
  if (!module) throw requestError("Learning module not found.", 404);
  await requireModuleAccess(userId, module);
  const assessment = module.assessment || {};
  const result = evaluateLearningAssessment(
    assessment.questions,
    answers,
    assessment.passingScorePercent,
  );
  const progress = await loadProgress(userId, moduleId);
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
    throw requestError("Provide Java source code of no more than 20000 characters.");
  }
  const module = await LearningModule.findById(moduleId);
  if (!module) throw requestError("Learning module not found.", 404);
  await requireModuleAccess(userId, module);
  const topic = getTopic(module, topicId);
  if (!topic) throw requestError("Topic not found in this module.", 404);
  const subtopic = subtopicId ? topic.subtopics.id(subtopicId) : null;
  if (subtopicId && !subtopic) throw requestError("Subtopic not found in this topic.", 404);
  const exercise = subtopic
    ? subtopic.exercises.id(exerciseId)
    : topic.exercises.id(exerciseId);
  if (!exercise) throw requestError("Exercise not found in this topic.", 404);
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
  const progress = await loadProgress(userId, moduleId);
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
