import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import config from "../src/config/env.js";
import { createTutorProvider } from "../src/services/learningAiProvider.js";
import { evaluateObjectiveEvidence } from "../src/services/learningObjectiveEngine.js";
import dataset from "../test/fixtures/learningTheoryCalibration.json" with { type: "json" };

function normalizedText(value) {
  return String(value || "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function metricsFor(results) {
  const completed = results.filter((result) => result.status === "EVALUATED");
  const actualFalsePositiveMasteries = completed.filter((result) =>
    result.actualMastered && !result.expectedMastered,
  ).length;
  const actualFalseNegativeMasteries = completed.filter((result) =>
    !result.actualMastered && result.expectedMastered,
  ).length;
  const tokenRows = completed.filter((result) => result.totalTokens !== null);
  return {
    sampleCount: results.length,
    evaluatedCount: completed.length,
    criterionAccuracy: completed.length
      ? completed.filter((result) => result.criterionCorrect).length / completed.length
      : null,
    citationQuoteValidity: completed.length
      ? completed.filter((result) => result.evidenceQuoteValid).length / completed.length
      : null,
    falsePositiveMasteryCount: actualFalsePositiveMasteries,
    falseNegativeMasteryCount: actualFalseNegativeMasteries,
    averageProviderLatencyMs: completed.length
      ? Math.round(completed.reduce((sum, result) => sum + result.latencyMs, 0) / completed.length)
      : null,
    totalTokens: tokenRows.length
      ? tokenRows.reduce((sum, result) => sum + result.totalTokens, 0)
      : null,
    tokenReportedCount: tokenRows.length,
    costUsd: null,
  };
}

async function main() {
  const provider = createTutorProvider(config);
  const topicId = new mongoose.Types.ObjectId();
  const results = [];
  for (const objective of dataset.objectives) {
    for (const item of objective.cases) {
      const currentObjective = {
        ...objective,
        masteryCriteria: [objective.criterion],
        prerequisites: [],
        requiredKnowledge: [],
        commonMisconceptions: [],
      };
      const topic = {
        _id: topicId,
        title: dataset.topic.title,
        description: dataset.topic.description,
        objectiveDefinitions: [currentObjective],
      };
      const startedAt = Date.now();
      try {
        const reply = await provider.generateReply({
          topic,
          approvedContent: JSON.stringify({ objective: currentObjective }),
          objectiveProgress: {
            currentObjective,
            states: [{ objectiveKey: objective.key, state: "IN_PROGRESS" }],
          },
          progressContext: {},
          history: [{ role: "user", content: item.response }],
          language: "en",
          advancedSettings: {},
        });
        const decision = evaluateObjectiveEvidence({
          topic,
          moduleVersion: 1,
          proposals: reply.objectiveEvidence || [],
          studentResponse: item.response,
          evidenceId: randomUUID(),
          sessionId: new mongoose.Types.ObjectId(),
          messageId: randomUUID(),
          messageIndex: 0,
        });
        const criteria = decision.evidence.flatMap((evidence) => evidence.criteria || []);
        const criterion = criteria.find((result) => result.criterionKey === objective.criterion.key);
        const evidenceQuoteValid = Boolean(
          criterion?.evidenceQuote &&
          normalizedText(item.response).includes(normalizedText(criterion.evidenceQuote)),
        );
        const actualDemonstrated = criterion?.demonstrated === true;
        const actualMastered = decision.masteredObjectiveKeys.includes(objective.key);
        results.push({
          objectiveKey: objective.key,
          caseId: item.id,
          status: "EVALUATED",
          expectedDemonstrated: item.expectedDemonstrated,
          actualDemonstrated,
          expectedMastered: item.expectedDemonstrated,
          actualMastered,
          criterionCorrect: actualDemonstrated === item.expectedDemonstrated,
          evidenceQuoteValid,
          confidence: criterion?.confidence ?? null,
          latencyMs: Date.now() - startedAt,
          promptTokens: reply.usage?.promptTokens ?? null,
          completionTokens: reply.usage?.completionTokens ?? null,
          totalTokens: reply.usage?.totalTokens ?? null,
        });
      } catch (error) {
        results.push({
          objectiveKey: objective.key,
          caseId: item.id,
          status: "PROVIDER_ERROR",
          error: String(error?.message || "Provider request failed."),
          latencyMs: Date.now() - startedAt,
          expectedDemonstrated: item.expectedDemonstrated,
          expectedMastered: item.expectedDemonstrated,
        });
      }
    }
  }
  const evaluatedCount = results.filter((result) => result.status === "EVALUATED").length;
  const report = {
    datasetVersion: dataset.datasetVersion,
    provider: config.AI_PROVIDER,
    model: config.AI_MODEL,
    overall: {
      status: evaluatedCount === results.length
        ? "COMPLETED"
        : evaluatedCount === 0
          ? "BLOCKED"
          : "INCOMPLETE",
      ...metricsFor(results),
    },
    objectives: dataset.objectives.map((objective) => ({
      objectiveKey: objective.key,
      ...metricsFor(results.filter((result) => result.objectiveKey === objective.key)),
    })),
    results,
  };
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    await writeFile(resolve(process.argv[outputIndex + 1]), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.overall.status !== "COMPLETED") process.exitCode = 2;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
