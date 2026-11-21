function plain(value) {
  return value?.toObject ? value.toObject() : value;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function getTopicObjectives(topic) {
  const definitions = list(plain(topic)?.objectiveDefinitions).map(plain);
  if (definitions.length) {
    return definitions.map((objective, index) => {
      const key = String(objective.key || objective._id || `objective-${index + 1}`);
      const prerequisites = new Set(
        list(objective.prerequisites).map(String).filter(Boolean),
      );
      for (let previous = 0; previous < index; previous += 1) {
        prerequisites.add(String(definitions[previous].key || definitions[previous]._id || `objective-${previous + 1}`));
      }
      return {
        key,
        title: String(objective.title || objective.description || `Objective ${index + 1}`),
        description: String(objective.description || objective.expectedOutcome || objective.title || ""),
        requiredKnowledge: list(objective.requiredKnowledge).map(String),
        expectedOutcome: String(objective.expectedOutcome || objective.description || ""),
        masteryCriteria: list(objective.masteryCriteria).map((criterion, criterionIndex) => ({
          key: String(criterion.key || `criterion-${criterionIndex + 1}`),
          description: String(criterion.description || ""),
          evaluationMethod: String(criterion.evaluationMethod || "EXPLANATION"),
          requiredEvidenceCount: Math.max(1, Number(criterion.requiredEvidenceCount) || 1),
        })),
        commonMisconceptions: list(objective.commonMisconceptions).map(String),
        prerequisites: [...prerequisites],
        legacyIndex: index,
      };
    });
  }

  return list(plain(topic)?.objectives).flatMap((value, index) => {
    const objective = String(value || "").trim();
    return objective
      ? [{
          key: String(index),
          title: objective,
          description: objective,
          requiredKnowledge: [],
          expectedOutcome: objective,
          masteryCriteria: [{
            key: "understanding",
            description: objective,
            evaluationMethod: "EXPLANATION",
            requiredEvidenceCount: 1,
          }],
          commonMisconceptions: [],
          prerequisites: [],
          legacyIndex: index,
          legacy: true,
        }]
      : [];
  });
}

export function objectiveProgressKey(topicId, objectiveKey) {
  return `${String(topicId?._id || topicId)}:${String(objectiveKey)}`;
}

function hasMastery(completedKeys, topicId, objective, evidence = [], moduleVersion = null) {
  const completed = completedKeys.has(objectiveProgressKey(topicId, objective.key)) ||
    (objective.legacyIndex >= 0 &&
      completedKeys.has(objectiveProgressKey(topicId, objective.legacyIndex)));
  if (!completed) return false;
  const objectiveEvidence = evidence.filter((item) =>
    String(item.topicId) === String(topicId) &&
    String(item.objectiveKey) === objective.key &&
    (moduleVersion === null || Number(item.moduleVersion) === Number(moduleVersion)),
  );
  if (objective.legacy && !objectiveEvidence.length) return true;
  const independentEvidence = objectiveEvidence.filter((item) => item.sourceType !== "TUTOR");
  return objective.masteryCriteria.length > 0 &&
    objective.masteryCriteria.every((criterion) =>
      criterionEvidenceCount(independentEvidence, topicId, moduleVersion, objective, criterion) >=
        criterion.requiredEvidenceCount,
    );
}

function prerequisiteObjectivesMet(objective, objectives, completedKeys, topicId, evidence, moduleVersion) {
  return objective.prerequisites.every((key) => {
    const prerequisite = objectives.find((item) => item.key === key);
    return prerequisite && hasMastery(
      completedKeys,
      topicId,
      prerequisite,
      evidence,
      moduleVersion,
    );
  });
}

function criterionEvidenceCount(evidence, topicId, moduleVersion, objective, criterion) {
  return evidence
    .filter((item) =>
      String(item.topicId) === String(topicId) &&
      (moduleVersion === null ||
        moduleVersion === undefined ||
        Number(item.moduleVersion) === Number(moduleVersion)) &&
      String(item.objectiveKey) === objective.key,
    )
    .reduce(
      (count, item) => count + list(item.criteria).filter(
        (result) => result.demonstrated === true && result.criterionKey === criterion.key,
      ).length,
      0,
    );
}

export function getObjectiveProgress(topic, progress = {}, activeObjectiveKey = "") {
  const objectives = getTopicObjectives(topic);
  const completedKeys = new Set((progress.completedObjectiveKeys || []).map(String));
  const evidence = progress.objectiveEvidence || [];
  const independentEvidence = evidence.filter((item) => item.sourceType !== "TUTOR");
  return objectives.map((objective) => {
    const mastered = hasMastery(
      completedKeys,
      topic._id,
      objective,
      evidence,
      progress.moduleVersion,
    );
    const prerequisitesMet = prerequisiteObjectivesMet(
      objective,
      objectives,
      completedKeys,
      topic._id,
      evidence,
      progress.moduleVersion,
    );
    const profile = (progress.objectiveProfiles || []).find(
      (item) =>
        item.objectiveKey === objective.key &&
        Number(item.moduleVersion) === Number(progress.moduleVersion),
    );
    const hasEvidence = evidence.some(
      (item) =>
        item.objectiveKey === objective.key &&
        String(item.topicId) === String(topic._id) &&
        Number(item.moduleVersion) === Number(progress.moduleVersion),
    );
    return {
      objectiveKey: objective.key,
      state: mastered
        ? "MASTERED"
        : hasEvidence
          ? "EVIDENCE_REQUIRED"
          : activeObjectiveKey === objective.key && prerequisitesMet
            ? "IN_PROGRESS"
            : "NOT_STARTED",
      prerequisitesMet,
      criteria: objective.masteryCriteria.map((criterion) => ({
        criterionKey: criterion.key,
        requiredEvidenceCount: criterion.requiredEvidenceCount,
        demonstratedCount: criterionEvidenceCount(
          independentEvidence,
          topic._id,
          progress.moduleVersion,
          objective,
          criterion,
        ),
      })),
      teachingSignals: profile?.teachingSignals || [],
    };
  });
}

export function evaluateObjectiveEvidence({
  topic,
  moduleVersion,
  completedObjectiveKeys = [],
  existingEvidence = [],
  proposals = [],
  verifiedCriteria = [],
  studentResponse = "",
  sourceType = "TUTOR",
  taskId = null,
  taskAttemptKey = "",
  evidenceId,
  sessionId,
  messageId,
  messageIndex,
  recordedAt = new Date(),
}) {
  const objectives = getTopicObjectives(topic);
  const completed = new Set(completedObjectiveKeys.map(String));
  const target = objectives.find((objective) =>
    !hasMastery(completed, topic._id, objective, existingEvidence, moduleVersion) &&
    prerequisiteObjectivesMet(
      objective,
      objectives,
      completed,
      topic._id,
      existingEvidence,
      moduleVersion,
    ),
  );
  if (!target || !Array.isArray(proposals)) {
    return { evidence: [], masteredObjectiveKeys: [], targetObjectiveKey: target?.key || null };
  }

  const proposal = proposals.find((item) =>
    item && String(item.objectiveKey || "") === target.key,
  );
  if ((!proposal || !Array.isArray(proposal.criteria)) && !verifiedCriteria.length) {
    return { evidence: [], masteredObjectiveKeys: [], targetObjectiveKey: target.key };
  }

  const existingForMessage = existingEvidence.some(
    (item) => item.evidenceId === evidenceId,
  );
  const criteriaByKey = new Map(target.masteryCriteria.map((item) => [item.key, item]));
  const acceptedKeys = new Set();
  const acceptedCriteria = [];
  if (!existingForMessage) {
    for (const result of proposal?.criteria || []) {
      const key = String(result?.criterionKey || "");
      if (
        typeof result?.demonstrated !== "boolean" ||
        !criteriaByKey.has(key) ||
        acceptedKeys.has(key)
      ) continue;
      acceptedKeys.add(key);
      const evidenceQuote = cleanEvidenceQuote(result.evidenceQuote);
      const confidence = Number(result.confidence);
      const citedInResponse = containsEvidenceQuote(studentResponse, evidenceQuote);
      const demonstrated =
        result.demonstrated === true &&
        citedInResponse &&
        Number.isFinite(confidence) &&
        confidence >= 0.7;
      acceptedCriteria.push({
        criterionKey: key,
        demonstrated,
        evaluationMethod: criteriaByKey.get(key).evaluationMethod,
        evidenceQuote: citedInResponse ? evidenceQuote : "",
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
        rationale: cleanSignal(result.rationale),
        demonstratedConcepts: cleanSignals(result.demonstratedConcepts),
        missingConcepts: cleanSignals(result.missingConcepts),
        misconceptions: cleanSignals(result.misconceptions),
      });
    }
    for (const result of verifiedCriteria) {
      const key = String(result?.criterionKey || "");
      const criterion = criteriaByKey.get(key);
      const expectedMethod = result?.sourceType === "CODE_TASK"
        ? ["CODE", "DEBUGGING", "PRACTICAL"]
        : result?.sourceType === "MATH_TASK"
          ? ["CALCULATION"]
          : [];
      if (
        !criterion ||
        !expectedMethod.includes(criterion.evaluationMethod) ||
        acceptedKeys.has(key)
      ) continue;
      acceptedKeys.add(key);
      acceptedCriteria.push({
        criterionKey: key,
        demonstrated: true,
        evaluationMethod: criterion.evaluationMethod,
        evidenceQuote: "",
        confidence: 1,
        rationale: cleanSignal(result.verificationReference),
        demonstratedConcepts: [],
        missingConcepts: [],
        misconceptions: [],
      });
    }
  }

  const accepted = acceptedCriteria.length
    ? [{
        evidenceId,
        topicId: topic._id,
        moduleVersion,
        objectiveKey: target.key,
        sourceType,
        taskId,
        taskAttemptKey,
        sessionId,
        messageId,
        messageIndex,
        criteria: acceptedCriteria,
        recordedAt,
      }]
    : [];
  const evidence = [...existingEvidence, ...accepted];
  const independentEvidence = evidence.filter((item) => item.sourceType !== "TUTOR");
  const mastered = target.masteryCriteria.length > 0 &&
    target.masteryCriteria.every((criterion) =>
      criterionEvidenceCount(
        independentEvidence,
        topic._id,
        moduleVersion,
        target,
        criterion,
      ) >= criterion.requiredEvidenceCount,
    );
  return {
    evidence: accepted,
    masteredObjectiveKeys: mastered ? [target.key] : [],
    targetObjectiveKey: target.key,
  };
}

function cleanSignals(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
      .slice(0, 5)
      .map((item) => item.slice(0, 120))
    : [];
}

function cleanEvidenceQuote(value) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function cleanSignal(value) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function containsEvidenceQuote(response, quote) {
  const normalize = (value) => String(value || "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const normalizedQuote = normalize(quote);
  return normalizedQuote.length >= 3 && normalize(response).includes(normalizedQuote);
}
