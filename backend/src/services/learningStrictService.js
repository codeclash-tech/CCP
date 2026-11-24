import crypto from "crypto";
import LearningModule from "../models/LearningModule.js";
import LearningModuleVersion from "../models/LearningModuleVersion.js";
import LearningStrictAttempt from "../models/LearningStrictAttempt.js";
import LearningProgress from "../models/LearningProgress.js";
import config from "../config/env.js";
import { getTopicObjectives } from "./learningObjectiveEngine.js";
import { AiProviderError, createTutorProvider } from "./learningAiProvider.js";
import { dispatchStrictEvaluationReportEmail } from "./strictEvaluationReportService.js";
import { updateCourseCertificateProgress } from "./courseCertificationService.js";

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function id(value) {
  return value?._id ? String(value._id) : String(value);
}

function sameId(left, right) {
  return id(left) === id(right);
}

function normalizeDifficultyRange(range) {
  switch (String(range || "EASY_TO_MEDIUM")) {
    case "EASY_TO_HARD":
      return ["EASY", "MEDIUM", "HARD"];
    case "MEDIUM_TO_HARD":
      return ["MEDIUM", "HARD"];
    case "EASY_TO_MEDIUM":
    default:
      return ["EASY", "MEDIUM"];
  }
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function parseJsonCandidate(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw requestError(
      "The evaluation service returned an unreadable result.",
      502,
    );
  }
}

/** Load the published module with the pinned version snapshot merged in. */
async function loadPublishedStrictModule(moduleId) {
  const current = await LearningModule.findOne({
    _id: moduleId,
    status: "PUBLISHED",
    deletedAt: null,
    evaluationMode: "STRICT_EVALUATION",
  }).select("_id programId title description currentPublishedVersion");
  if (!current) throw requestError("Strict Evaluation module not found.", 404);
  const version = Math.max(1, Number(current.currentPublishedVersion) || 1);
  const snapshot = await LearningModuleVersion.findOne({
    moduleId: current._id,
    version,
  }).lean();
  const plain = current.toObject();
  plain.currentPublishedVersion = version;
  plain.topics = snapshot?.topicSummaries?.length
    ? snapshot.topicSummaries.map((summary) => ({
        ...summary,
        // full topic bodies come from the versioned topic documents
      }))
    : [];
  return { module: plain, version, snapshotModuleId: current._id };
}

async function loadVersionedTopic(moduleId, version, topicId) {
  const { default: LearningTopicVersion } =
    await import("../models/LearningTopicVersion.js");
  const record = await LearningTopicVersion.findOne({
    moduleId,
    moduleVersion: version,
    topicId,
  }).lean();
  if (!record?.topicSnapshot) {
    throw requestError(
      "Evaluation topic not found in this module version.",
      404,
    );
  }
  return record.topicSnapshot;
}

function studentQuestionView(question) {
  return {
    key: question.key,
    objectiveKey: question.objectiveKey || "",
    prompt: question.prompt,
    difficulty: question.difficulty,
    options: question.options || [],
    marks: question.marks ?? 1,
  };
}

/**
 * Generate a Strict MCQ set from the published topic configuration.
 * Uses the admin's objectives, reference content and blueprint so that
 * different students receive different but comparable question sets.
 */
async function generateStrictMcqSet(topic, moduleTitle) {
  const mcqConfig = topic.strictMcqConfig || {};
  const total = Math.max(1, Number(mcqConfig.questionCount) || 10);
  const difficulties = normalizeDifficultyRange(
    mcqConfig.difficultyDistribution,
  );
  const objectives = getTopicObjectives(topic);
  const objectiveKeys = objectives.length
    ? objectives.map((objective) => objective.key)
    : [""];
  const allocation = mcqConfig.objectiveAllocation || {};
  const provider = createTutorProvider(config);
  const approvedContent = JSON.stringify({
    moduleTitle,
    topicTitle: topic.title,
    topicDescription: topic.description,
    referenceContent: topic.explanation || "",
    coreKnowledge: topic.coreKnowledge || [],
    examples: topic.examples || [],
    objectives: objectives.map((objective) => ({
      key: objective.key,
      title: objective.title,
      description: objective.description,
      expectedOutcome: objective.expectedOutcome,
    })),
    questionCoverage: mcqConfig.questionCoverage || "",
  });
  const reply = await provider.generateReply({
    topic: { title: topic.title, strictMcqGeneration: true },
    approvedContent,
    progressContext: {
      blueprint: {
        totalQuestions: total,
        difficulties,
        objectiveKeys,
        allocation,
        negativeMarkingPercent: Number(mcqConfig.negativeMarkingPercent) || 0,
      },
    },
    objectiveProgress: {},
    history: [],
    language: "en",
    advancedSettings: {},
  });
  const parsed = parseJsonCandidate(reply.content);
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions = rawQuestions
    .slice(0, total)
    .map((question, index) => {
      const options = (Array.isArray(question.options) ? question.options : [])
        .map((option) => String(option || "").slice(0, 500))
        .filter(Boolean);
      const correctIndex = Number(question.correctOptionIndex);
      if (
        options.length < 2 ||
        !Number.isInteger(correctIndex) ||
        correctIndex < 0 ||
        correctIndex >= options.length
      ) {
        return null;
      }
      const prompt = String(question.prompt || "").trim();
      if (!prompt || prompt.length > 4000) return null;
      const objectiveKey = objectiveKeys.includes(
        String(question.objectiveKey || ""),
      )
        ? String(question.objectiveKey)
        : objectiveKeys[index % objectiveKeys.length];
      const difficulty = difficulties.includes(
        String(question.difficulty || ""),
      )
        ? String(question.difficulty)
        : difficulties[index % difficulties.length];
      return {
        key: `q${index + 1}`,
        objectiveKey,
        prompt,
        difficulty,
        options,
        correctOptionIndex: correctIndex,
        marks: Math.max(1, Number(question.marks) || 1),
        expectedAnswerPoints: [],
      };
    })
    .filter(Boolean);
  if (!questions.length) {
    throw requestError(
      "The generated question set could not be validated. Please try again.",
      502,
    );
  }
  // Shuffle so equivalent sets differ between students.
  return shuffle(questions);
}

/**
 * Generate open-ended strict concept questions (AI asks; never teaches).
 */
async function generateStrictConceptQuestions(topic, moduleTitle) {
  const conceptConfig = topic.strictConceptConfig || {};
  const count = Math.max(1, Number(conceptConfig.questionCount) || 5);
  const objectives = getTopicObjectives(topic);
  const provider = createTutorProvider(config);
  const approvedContent = JSON.stringify({
    moduleTitle,
    topicTitle: topic.title,
    topicDescription: topic.description,
    referenceContent: topic.explanation || "",
    coreKnowledge: topic.coreKnowledge || [],
    examples: topic.examples || [],
    objectives: objectives.map((objective) => ({
      key: objective.key,
      title: objective.title,
      description: objective.description,
      expectedOutcome: objective.expectedOutcome,
      requiredKnowledge: objective.requiredKnowledge,
    })),
    expectedKnowledgeIndicators:
      conceptConfig.expectedKnowledgeIndicators || [],
    evaluationCriteria: conceptConfig.evaluationCriteria || [],
  });
  const reply = await provider.generateReply({
    topic: { title: topic.title, strictConceptGeneration: true },
    approvedContent,
    progressContext: {
      blueprint: {
        questionCount: count,
        instruction:
          "Generate open-ended evaluation questions. Never include answers, hints or teaching.",
      },
    },
    objectiveProgress: {},
    history: [],
    language: "en",
    advancedSettings: {},
  });
  const parsed = parseJsonCandidate(reply.content);
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions = rawQuestions
    .slice(0, count)
    .map((question, index) => {
      const prompt = String(question.prompt || "").trim();
      if (!prompt || prompt.length > 4000) return null;
      const objectiveKey = String(question.objectiveKey || "");
      return {
        key: `q${index + 1}`,
        objectiveKey: objectives.some(
          (objective) => objective.key === objectiveKey,
        )
          ? objectiveKey
          : objectives[index % Math.max(1, objectives.length)]?.key || "",
        prompt,
        difficulty: difficulties_default(question, count),
        options: [],
        correctOptionIndex: -1,
        marks: 1,
        expectedAnswerPoints: (question.expectedAnswerPoints || [])
          .map((point) => String(point || "").slice(0, 500))
          .slice(0, 10),
      };
    })
    .filter(Boolean);
  if (!questions.length) {
    throw requestError(
      "The generated question set could not be validated. Please try again.",
      502,
    );
  }
  return questions;
}

function difficulties_default(question, fallbackIndex) {
  const value = String(question.difficulty || "").toUpperCase();
  return ["EASY", "MEDIUM", "HARD"].includes(value) ? value : "MEDIUM";
}

function isWithinSchedule(module) {
  const now = new Date();
  if (module.scheduleStartAt && new Date(module.scheduleStartAt) > now) {
    throw requestError("This assessment is not open yet.", 403);
  }
  if (module.scheduleEndAt && new Date(module.scheduleEndAt) < now) {
    throw requestError("This assessment has closed.", 403);
  }
}

/**
 * Start (or resume) a Strict Evaluation attempt on a topic.
 * The generated question set is persisted, so refreshes and
 * reconnections resume the same set.
 */
export async function startStrictAssessment(
  userId,
  moduleId,
  requestedTopicId,
) {
  const { module, version, snapshotModuleId } =
    await loadPublishedStrictModule(moduleId);
  isWithinSchedule(module);
  const summaries = module.topics || [];
  let topicId = requestedTopicId;
  if (!topicId) {
    topicId = summaries[0]?._id;
    if (!topicId) {
      throw requestError(
        "This assessment module has no configured topics yet.",
      );
    }
  }
  const topic = await loadVersionedTopic(snapshotModuleId, version, topicId);
  const contentType = topic.contentType === "MCQS" ? "MCQS" : "CONCEPTS";

  let attempt = await LearningStrictAttempt.findOne({
    userId,
    moduleId: snapshotModuleId,
    moduleVersion: version,
    topicId,
    status: "IN_PROGRESS",
  });
  const timeLimitMinutes =
    contentType === "MCQS"
      ? Number(topic.strictMcqConfig?.timeLimitMinutes) || null
      : Number(topic.strictConceptConfig?.timeLimitMinutes) || null;
  if (!attempt) {
    const questions =
      contentType === "MCQS"
        ? await generateStrictMcqSet(topic, module.title)
        : await generateStrictConceptQuestions(topic, module.title);
    attempt = await LearningStrictAttempt.create({
      userId,
      moduleId: snapshotModuleId,
      moduleVersion: version,
      topicId,
      contentType,
      questions,
      expiresAt: timeLimitMinutes
        ? new Date(Date.now() + timeLimitMinutes * 60 * 1000)
        : null,
    });
  } else if (attempt.expiresAt && attempt.expiresAt.getTime() <= Date.now()) {
    attempt.status = "EXPIRED";
    await attempt.save();
    throw requestError(
      "The time limit for this assessment has expired. Start a new attempt.",
      410,
    );
  }
  return {
    attemptId: attempt._id,
    module: {
      id: module._id,
      title: module.title,
      description: module.description,
      evaluationMode: "STRICT_EVALUATION",
    },
    topic: {
      id: topicId,
      title: topic.title,
      description: topic.description,
      contentType,
      timeLimitMinutes,
    },
    questions: attempt.questions.map(studentQuestionView),
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    savedAnswers: attempt.answers || {},
  };
}

function evaluateMcqAnswers(questions, answers) {
  const negativePercent = 0; // configured at topic level, kept for parity
  let marks = 0;
  let total = 0;
  const perQuestion = questions.map((question) => {
    total += question.marks || 1;
    const submitted = answers?.[question.key];
    const correct =
      Number.isInteger(question.correctOptionIndex) &&
      submitted === question.correctOptionIndex;
    if (correct) marks += question.marks || 1;
    return {
      key: question.key,
      correct,
      objectiveKey: question.objectiveKey || "",
    };
  });
  const scorePercent = total ? Math.round((marks / total) * 100) : 0;
  return { scorePercent, perQuestion, negativePercent };
}

function classifyLevel(scorePercent) {
  if (scorePercent >= 90) return "EXPERT";
  if (scorePercent >= 75) return "ADVANCED";
  if (scorePercent >= 60) return "INTERMEDIATE";
  if (scorePercent >= 40) return "DEVELOPING";
  return "BEGINNER";
}

function buildObjectiveSummary(questions, answers, topic) {
  const objectives = getTopicObjectives(topic);
  const byObjective = new Map();
  for (const question of questions) {
    const key = question.objectiveKey || "";
    if (!byObjective.has(key)) byObjective.set(key, { correct: 0, total: 0 });
    const entry = byObjective.get(key);
    entry.total += 1;
    const submitted = answers?.[question.key];
    if (
      Number.isInteger(question.correctOptionIndex) &&
      submitted === question.correctOptionIndex
    ) {
      entry.correct += 1;
    }
  }
  return objectives
    .filter((objective) => byObjective.has(objective.key))
    .map((objective) => {
      const entry = byObjective.get(objective.key);
      const scorePercent = entry.total
        ? Math.round((entry.correct / entry.total) * 100)
        : 0;
      return {
        objectiveKey: objective.key,
        objectiveTitle: objective.title,
        level: classifyLevel(scorePercent),
        scorePercent,
        strengths: scorePercent >= 60 ? [objective.title] : [],
        weaknesses: scorePercent < 60 ? [objective.title] : [],
        knowledgeGaps:
          scorePercent < 60
            ? [objective.expectedOutcome || objective.title]
            : [],
        misconceptions: [],
      };
    });
}

async function evaluateStrictConceptAnswers(attempt, topic, moduleTitle) {
  const provider = createTutorProvider(config);
  const objectives = getTopicObjectives(topic);
  const conceptConfig = topic.strictConceptConfig || {};
  const evaluationRequest = JSON.stringify({
    moduleTitle,
    topicTitle: topic.title,
    levelClassificationCriteria:
      conceptConfig.levelClassificationCriteria || "",
    evaluationCriteria: conceptConfig.evaluationCriteria || [],
    expectedKnowledgeIndicators:
      conceptConfig.expectedKnowledgeIndicators || [],
    objectives: objectives.map((objective) => ({
      key: objective.key,
      title: objective.title,
      expectedOutcome: objective.expectedOutcome,
    })),
    questions: attempt.questions.map((question) => ({
      key: question.key,
      objectiveKey: question.objectiveKey,
      prompt: question.prompt,
      expectedAnswerPoints: question.expectedAnswerPoints,
      studentAnswer: String(attempt.answers?.[question.key] || "").slice(
        0,
        5000,
      ),
    })),
  });
  const reply = await provider.generateReply({
    topic: { title: topic.title, strictConceptEvaluation: true },
    approvedContent: evaluationRequest,
    progressContext: {},
    objectiveProgress: {},
    history: [],
    language: "en",
    advancedSettings: {},
  });
  const parsed = parseJsonCandidate(reply.content);
  const objectiveResults = (
    Array.isArray(parsed.objectiveResults) ? parsed.objectiveResults : []
  )
    .slice(0, 50)
    .map((entry, index) => ({
      objectiveKey: String(
        entry.objectiveKey || objectives[index]?.key || "",
      ).slice(0, 100),
      objectiveTitle: String(
        entry.objectiveTitle || objectives[index]?.title || "",
      ).slice(0, 200),
      level: [
        "BEGINNER",
        "DEVELOPING",
        "INTERMEDIATE",
        "ADVANCED",
        "EXPERT",
      ].includes(String(entry.level || ""))
        ? String(entry.level)
        : "BEGINNER",
      scorePercent: Math.max(0, Math.min(100, Number(entry.scorePercent) || 0)),
      strengths: (entry.strengths || []).map(String).slice(0, 10),
      weaknesses: (entry.weaknesses || []).map(String).slice(0, 10),
      knowledgeGaps: (entry.knowledgeGaps || []).map(String).slice(0, 10),
      misconceptions: (entry.misconceptions || []).map(String).slice(0, 10),
    }))
    .filter((entry) => entry.objectiveKey);
  const scorePercent = Math.max(
    0,
    Math.min(100, Number(parsed.scorePercent) || 0),
  );
  const overallLevel = [
    "BEGINNER",
    "DEVELOPING",
    "INTERMEDIATE",
    "ADVANCED",
    "EXPERT",
  ].includes(String(parsed.overallLevel || ""))
    ? String(parsed.overallLevel)
    : classifyLevel(scorePercent);
  return {
    result: {
      overallLevel,
      scorePercent,
      passed: scorePercent >= 40,
      objectiveResults,
      strengths: (parsed.strengths || []).map(String).slice(0, 12),
      weaknesses: (parsed.weaknesses || []).map(String).slice(0, 12),
      knowledgeGaps: (parsed.knowledgeGaps || []).map(String).slice(0, 12),
      misconceptions: (parsed.misconceptions || []).map(String).slice(0, 12),
      improvementSuggestions: (parsed.improvementSuggestions || [])
        .map(String)
        .slice(0, 12),
      appreciation: String(parsed.appreciation || "").slice(0, 2000),
      generatedAt: new Date(),
    },
    provider,
    reply,
  };
}

/**
 * Submit answers for an attempt and produce the final evaluation.
 * MCQ scoring is deterministic (no AI). Concept scoring uses one AI call.
 */
export async function submitStrictAssessment(userId, attemptId, answers) {
  const attempt = await LearningStrictAttempt.findOne({
    _id: attemptId,
    userId,
    status: "IN_PROGRESS",
  });
  if (!attempt) throw requestError("Assessment attempt not found.", 404);
  if (attempt.expiresAt && attempt.expiresAt.getTime() <= Date.now()) {
    attempt.status = "EXPIRED";
    await attempt.save();
    throw requestError("The time limit for this assessment has expired.", 410);
  }
  const cleanAnswers =
    answers && typeof answers === "object" && !Array.isArray(answers)
      ? Object.fromEntries(
          Object.entries(answers)
            .slice(0, 200)
            .map(([key, value]) => [String(key).slice(0, 100), value]),
        )
      : {};
  attempt.answers = cleanAnswers;
  await attempt.save();

  const topic = await loadVersionedTopic(
    attempt.moduleId,
    attempt.moduleVersion,
    attempt.topicId,
  );
  const moduleDoc = await LearningModule.findById(attempt.moduleId)
    .select("title programId")
    .lean();

  let result;
  if (attempt.contentType === "MCQS") {
    const evaluation = evaluateMcqAnswers(attempt.questions, cleanAnswers);
    const objectiveResults = buildObjectiveSummary(
      attempt.questions,
      cleanAnswers,
      topic,
    );
    result = {
      overallLevel: classifyLevel(evaluation.scorePercent),
      scorePercent: evaluation.scorePercent,
      passed: evaluation.scorePercent >= 40,
      objectiveResults,
      strengths: objectiveResults
        .filter((r) => r.scorePercent >= 60)
        .map((r) => r.objectiveTitle),
      weaknesses: objectiveResults
        .filter((r) => r.scorePercent < 60)
        .map((r) => r.objectiveTitle),
      knowledgeGaps: objectiveResults
        .filter((r) => r.scorePercent < 60)
        .flatMap((r) => r.knowledgeGaps),
      misconceptions: [],
      improvementSuggestions: objectiveResults
        .filter((r) => r.scorePercent < 60)
        .map(
          (r) =>
            `Revise ${r.objectiveTitle} — currently at ${r.scorePercent}%.`,
        ),
      appreciation:
        evaluation.scorePercent >= 75
          ? "Strong performance across the assessed objectives."
          : evaluation.scorePercent >= 40
            ? "A reasonable foundation is visible; targeted revision will lift the weaker objectives."
            : "This attempt shows the objectives that need the most attention. Review the reference material and try again.",
      generatedAt: new Date(),
    };
  } else {
    const evaluated = await evaluateStrictConceptAnswers(
      attempt,
      topic,
      moduleDoc?.title || "",
    );
    result = evaluated.result;
  }

  attempt.result = result;
  attempt.status = "COMPLETED";
  attempt.completedAt = new Date();
  await attempt.save();

  // Mark LearningProgress complete so strict modules count toward course
  // certification when configured as required.
  const progress = await LearningProgress.findOne({
    userId,
    moduleId: attempt.moduleId,
  });
  if (!progress) {
    await LearningProgress.create({
      userId,
      moduleId: attempt.moduleId,
      moduleVersion: attempt.moduleVersion,
      completedTopicIds: [attempt.topicId],
      assessmentPassed: result.passed,
      assessmentScorePercent: result.scorePercent,
      completedAt: new Date(),
    });
  } else if (!progress.completedAt) {
    if (
      !progress.completedTopicIds.some((current) =>
        sameId(current, attempt.topicId),
      )
    ) {
      progress.completedTopicIds.push(attempt.topicId);
    }
    progress.assessmentPassed = progress.assessmentPassed || result.passed;
    progress.assessmentScorePercent = Math.max(
      progress.assessmentScorePercent || 0,
      result.scorePercent,
    );
    progress.completedAt = new Date();
    await progress.save();
  }

  await updateCourseCertificateProgress(userId, attempt.moduleId).catch(
    (error) =>
      console.error(
        "[StrictAssessment] Course certificate check failed:",
        error.message,
      ),
  );

  // Report email is fire-and-forget; it must never block the submission.
  dispatchStrictEvaluationReportEmail(attempt._id).catch((error) =>
    console.error("[StrictAssessment] Report email failed:", error.message),
  );

  return {
    attemptId: attempt._id,
    result: {
      overallLevel: result.overallLevel,
      scorePercent: result.scorePercent,
      passed: result.passed,
      objectiveResults: result.objectiveResults,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      knowledgeGaps: result.knowledgeGaps,
      misconceptions: result.misconceptions,
      improvementSuggestions: result.improvementSuggestions,
      appreciation: result.appreciation,
    },
  };
}

export async function getStrictAttempt(userId, attemptId) {
  const attempt = await LearningStrictAttempt.findOne({
    _id: attemptId,
    userId,
  });
  if (!attempt) throw requestError("Assessment attempt not found.", 404);
  return {
    attemptId: attempt._id,
    status: attempt.status,
    contentType: attempt.contentType,
    questions:
      attempt.status === "IN_PROGRESS"
        ? attempt.questions.map(studentQuestionView)
        : [],
    answers:
      attempt.status === "IN_PROGRESS" ? attempt.answers || {} : undefined,
    result: attempt.result,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    completedAt: attempt.completedAt,
  };
}

/**
 * Student assessment history (completed strict attempts only).
 */
export async function listStrictAttempts(userId, limit = 50) {
  const attempts = await LearningStrictAttempt.find({
    userId,
    status: "COMPLETED",
  })
    .sort({ completedAt: -1 })
    .limit(Math.min(100, Number(limit) || 50))
    .populate("moduleId", "title programId")
    .lean();
  return attempts.map((attempt) => ({
    id: attempt._id,
    moduleTitle: attempt.moduleId?.title || "",
    moduleVersion: attempt.moduleVersion,
    contentType: attempt.contentType,
    scorePercent: attempt.result?.scorePercent ?? 0,
    overallLevel: attempt.result?.overallLevel || "",
    completedAt: attempt.completedAt,
    reportEmailStatus: attempt.reportEmailStatus,
  }));
}

/**
 * Admin results dashboard for one strict module.
 */
export async function getStrictModuleResults(adminId, moduleId) {
  const moduleDoc = await LearningModule.findOne({
    _id: moduleId,
    evaluationMode: "STRICT_EVALUATION",
    deletedAt: null,
  }).lean();
  if (!moduleDoc)
    throw requestError("Strict Evaluation module not found.", 404);
  const attempts = await LearningStrictAttempt.find({ moduleId })
    .sort({ createdAt: -1 })
    .limit(1000)
    .populate("userId", "name email")
    .lean();
  const started = attempts.filter((attempt) => attempt.status !== "EXPIRED");
  const completed = attempts.filter(
    (attempt) => attempt.status === "COMPLETED",
  );
  const uniqueParticipants = new Set(
    attempts.map((attempt) => id(attempt.userId?._id || attempt.userId)),
  );
  const levelDistribution = completed.reduce((distribution, attempt) => {
    const level = attempt.result?.overallLevel || "UNKNOWN";
    distribution[level] = (distribution[level] || 0) + 1;
    return distribution;
  }, {});
  const objectiveTally = new Map();
  for (const attempt of completed) {
    for (const entry of attempt.result?.objectiveResults || []) {
      const key = entry.objectiveKey;
      if (!objectiveTally.has(key)) {
        objectiveTally.set(key, {
          objectiveKey: key,
          objectiveTitle: entry.objectiveTitle,
          averagePercent: 0,
          samples: 0,
          weakCount: 0,
        });
      }
      const tally = objectiveTally.get(key);
      tally.averagePercent += entry.scorePercent;
      tally.samples += 1;
      if (entry.scorePercent < 60) tally.weakCount += 1;
    }
  }
  const objectiveAnalysis = [...objectiveTally.values()].map((tally) => ({
    ...tally,
    averagePercent: tally.samples
      ? Math.round(tally.averagePercent / tally.samples)
      : 0,
  }));
  const gapCount = new Map();
  for (const attempt of completed) {
    for (const gap of attempt.result?.knowledgeGaps || []) {
      gapCount.set(gap, (gapCount.get(gap) || 0) + 1);
    }
  }
  const knowledgeGaps = [...gapCount.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 30)
    .map(([gap, count]) => ({ gap, count }));
  return {
    module: {
      id: moduleDoc._id,
      title: moduleDoc.title,
      programId: moduleDoc.programId,
    },
    stats: {
      eligibleParticipants: uniqueParticipants.size,
      startedAssessments: started.length,
      completedAssessments: completed.length,
      levelDistribution,
    },
    objectiveAnalysis,
    knowledgeGaps,
    students: attempts
      .filter((attempt) => attempt.userId)
      .map((attempt) => ({
        userId: id(attempt.userId?._id || attempt.userId),
        name: attempt.userId?.name || "",
        email: attempt.userId?.email || "",
        status: attempt.status,
        scorePercent: attempt.result?.scorePercent ?? null,
        overallLevel: attempt.result?.overallLevel || null,
        strengths: attempt.result?.strengths || [],
        weaknesses: attempt.result?.weaknesses || [],
        completedAt: attempt.completedAt,
        attemptId: attempt._id,
      })),
  };
}
