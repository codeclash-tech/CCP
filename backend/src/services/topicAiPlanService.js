import crypto from "crypto";
import config from "../config/env.js";
import { createTutorProvider } from "./learningAiProvider.js";
import { getTopicObjectives } from "./learningObjectiveEngine.js";
import LearningAiUsage from "../models/LearningAiUsage.js";

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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
      "The AI returned an unreadable learning plan. Please retry.",
      502,
    );
  }
}

const LEVELS = ["BEGINNER", "DEVELOPING", "INTERMEDIATE", "ADVANCED", "EXPERT"];

/**
 * Derive the teaching/assessment structure for a prompt-first topic.
 *
 * The admin only writes a natural-language prompt. One AI call produces:
 *   - objectives (with mastery criteria for self-eval, or expected answer
 *     points for strict eval)
 *   - reference content the tutor may teach from
 *   - for MCQ topics: the question blueprint (count, difficulty, allocation)
 *   - for strict concepts: the level classification criteria
 *
 * The result is cached on the topic (aiPlan) so later student sessions and
 * question generation reuse it without extra AI calls. Manual objectives,
 * coreKnowledge or configs, when present, always win over derived values.
 */
export async function ensureTopicAiPlan(topic, module, options = {}) {
  const mode = module.evaluationMode || "SELF_EVALUATION";
  const contentType = topic.contentType === "MCQS" ? "MCQS" : "CONCEPTS";

  // Manual structure always wins — no AI needed.
  const manualObjectives = (topic.objectiveDefinitions || []).length
    ? topic.objectiveDefinitions
    : (topic.objectives || []).length
      ? topic.objectives
      : null;
  if (manualObjectives) {
    return {
      source: "MANUAL",
      objectives: getTopicObjectives(topic),
      referenceContent:
        topic.explanation ||
        (topic.coreKnowledge || [])
          .map((item) => item.content)
          .filter((item) => typeof item === "string")
          .join("\n\n") ||
        topic.aiPrompt,
    };
  }

  const prompt = String(topic.aiPrompt || "").trim();
  if (!prompt) {
    throw requestError(
      `Topic "${topic.title}" has no prompt or objectives. Add a prompt describing what it should teach or assess.`,
    );
  }

  const cached = topic.aiPlan;
  if (
    cached &&
    cached.source === "AI" &&
    cached.prompt === prompt &&
    cached.mode === mode &&
    cached.contentType === contentType
  ) {
    return cached;
  }

  const provider = createTutorProvider(config);
  const startedAt = Date.now();
  let reply;
  try {
    reply = await provider.generateReply({
      topic: {
        title: topic.title,
        learningPlanDerivation: true,
        mode,
        contentType,
      },
      approvedContent: JSON.stringify({
        moduleTitle: module.title,
        moduleDescription: module.description,
        topicTitle: topic.title,
        topicDescription: topic.description || "",
        adminPrompt: prompt,
        referenceContent: topic.explanation || "",
        enrichment: {
          keyConcepts: topic.selfConceptConfig?.keyConcepts || [],
          realLifeExamples: topic.selfConceptConfig?.realLifeExamples || [],
          commonMisconceptions: topic.selfConceptConfig?.commonMisconceptions || [],
          questionCoverage: topic.selfMcqConfig?.questionCoverage || "",
          evaluationCriteria:
            topic.strictConceptConfig?.evaluationCriteria ||
            topic.strictMcqConfig?.evaluationCriteria ||
            [],
          levelClassificationCriteria:
            topic.strictConceptConfig?.levelClassificationCriteria || "",
        },
        requestedQuestionCount:
          contentType === "MCQS"
            ? mode === "STRICT_EVALUATION"
              ? Number(topic.strictMcqConfig?.questionCount) || 10
              : Number(topic.selfMcqConfig?.questionsPerSession) || 5
            : Number(topic.strictConceptConfig?.questionCount) || 5,
        difficulty:
          mode === "STRICT_EVALUATION"
            ? topic.strictMcqConfig?.difficultyDistribution || "BALANCED"
            : topic.selfMcqConfig?.difficultyRange || "EASY_TO_MEDIUM",
      }),
      progressContext: {},
      objectiveProgress: {},
      history: [],
      language: "en",
      advancedSettings: {},
    });
  } catch (error) {
    await LearningAiUsage.create({
      userId: options.adminId || null,
      operation: "TOPIC_PLAN_DERIVATION",
      provider: String(config.AI_PROVIDER || "ollama"),
      model: String(config.AI_MODEL || "unconfigured"),
      responseTimeMs: Date.now() - startedAt,
      succeeded: false,
    }).catch(() => {});
    throw error;
  }

  await LearningAiUsage.create({
    userId: options.adminId || null,
    sessionId: options.sessionId || null,
    operation: "TOPIC_PLAN_DERIVATION",
    provider: reply.provider,
    model: reply.model,
    ...(() => {
      const usage = reply.usage || {};
      const fields = {};
      for (const key of [
        "promptTokens",
        "completionTokens",
        "totalTokens",
      ]) {
        if (Number.isFinite(Number(usage[key]))) fields[key] = Number(usage[key]);
      }
      return fields;
    })(),
    responseTimeMs: Date.now() - startedAt,
    succeeded: true,
  }).catch(() => {});

  const parsed = parseJsonCandidate(reply.content);
  const objectives = Array.isArray(parsed.objectives) ? parsed.objectives : [];
  if (!objectives.length) {
    throw requestError(
      `The AI could not derive learning objectives for "${topic.title}" from the prompt. Refine the prompt and retry.`,
      502,
    );
  }
  const normalizedObjectives = objectives.slice(0, 50).map((objective, index) => ({
    key: String(objective.key || `objective-${index + 1}`).slice(0, 100),
    title: String(objective.title || objective.description || `Objective ${index + 1}`).slice(0, 160),
    description: String(objective.description || objective.title || "").slice(0, 2000),
    requiredKnowledge: (Array.isArray(objective.requiredKnowledge) ? objective.requiredKnowledge : [])
      .map((item) => String(item || "").slice(0, 500))
      .slice(0, 20),
    expectedOutcome: String(objective.expectedOutcome || objective.description || objective.title || "").slice(0, 2000),
    masteryCriteria: (Array.isArray(objective.masteryCriteria) ? objective.masteryCriteria : [])
      .slice(0, 10)
      .map((criterion, criterionIndex) => ({
        key: String(criterion?.key || `criterion-${criterionIndex + 1}`).slice(0, 100),
        description: String(criterion?.description || "").slice(0, 1000),
        evaluationMethod: String(criterion?.evaluationMethod || "EXPLANATION").toUpperCase(),
        requiredEvidenceCount: Math.max(1, Math.min(5, Number(criterion?.requiredEvidenceCount) || 1)),
      })),
    expectedAnswerPoints: (Array.isArray(objective.expectedAnswerPoints) ? objective.expectedAnswerPoints : [])
      .map((point) => String(point || "").slice(0, 500))
      .slice(0, 10),
    commonMisconceptions: (Array.isArray(objective.commonMisconceptions) ? objective.commonMisconceptions : [])
      .map((item) => String(item || "").slice(0, 500))
      .slice(0, 20),
    prerequisites: [],
  }));

  const plan = {
    source: "AI",
    prompt,
    mode,
    contentType,
    derivedAt: new Date(),
    referenceContent: String(parsed.referenceContent || prompt).slice(0, 60000),
    teachingNotes: String(parsed.teachingNotes || "").slice(0, 8000),
    questionBlueprint: {
      count:
        Number(parsed.questionBlueprint?.count) ||
        (contentType === "MCQS"
          ? mode === "STRICT_EVALUATION"
            ? Number(topic.strictMcqConfig?.questionCount) || 10
            : Number(topic.selfMcqConfig?.questionsPerSession) || 5
          : Number(topic.strictConceptConfig?.questionCount) || 5),
      difficulties: Array.isArray(parsed.questionBlueprint?.difficulties)
        ? parsed.questionBlueprint.difficulties.filter((d) =>
            ["EASY", "MEDIUM", "HARD"].includes(String(d)),
          )
        : ["EASY", "MEDIUM"],
    },
    levelClassificationCriteria: String(
      parsed.levelClassificationCriteria ||
        topic.strictConceptConfig?.levelClassificationCriteria ||
        "",
    ).slice(0, 8000),
    objectives: normalizedObjectives,
  };
  return plan;
}

/**
 * Persist the derived plan back onto the topic document so later student
 * sessions reuse it without new AI calls. Call inside a module save.
 */
export function attachAiPlanToTopic(topic, plan) {
  if (!topic || plan?.source !== "AI") return topic;
  topic.aiPlan = {
    source: plan.source,
    prompt: plan.prompt,
    mode: plan.mode,
    contentType: plan.contentType,
    derivedAt: plan.derivedAt,
    referenceContent: plan.referenceContent,
    teachingNotes: plan.teachingNotes,
    questionBlueprint: plan.questionBlueprint,
    levelClassificationCriteria: plan.levelClassificationCriteria,
    objectiveDefinitions: plan.objectives.map((objective) => ({
      key: objective.key,
      title: objective.title,
      description: objective.description,
      requiredKnowledge: objective.requiredKnowledge,
      expectedOutcome: objective.expectedOutcome,
      masteryCriteria: objective.masteryCriteria,
      commonMisconceptions: objective.commonMisconceptions,
      prerequisites: objective.prerequisites,
    })),
  };
  return topic;
}

export function planObjectiveList(plan) {
  return plan?.objectives || getTopicObjectives(plan?.source === "AI" ? { objectiveDefinitions: plan.objectiveDefinitions } : {});
}

export { LEVELS };
