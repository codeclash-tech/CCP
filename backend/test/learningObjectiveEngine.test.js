import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateObjectiveEvidence,
  getObjectiveProgress,
  getTopicObjectives,
} from "../src/services/learningObjectiveEngine.js";

const topic = {
  _id: "topic-1",
  objectiveDefinitions: [
    {
      key: "explain-addressing",
      title: "Explain logical addressing",
      description: "Explain the role of logical addresses in routing.",
      masteryCriteria: [
        {
          key: "purpose",
          description: "Explain why logical addresses are used.",
          requiredEvidenceCount: 1,
        },
        {
          key: "routing",
          description: "Relate logical addresses to routing.",
          requiredEvidenceCount: 2,
        },
      ],
    },
    {
      key: "apply-addressing",
      title: "Apply logical addressing",
      description: "Apply logical addressing in a new scenario.",
      masteryCriteria: [{
        key: "application",
        description: "Apply the concept to an unfamiliar scenario.",
      }],
    },
  ],
};

test("objective order and prerequisites remain fixed for every learner", () => {
  const objectives = getTopicObjectives(topic);
  assert.deepEqual(objectives.map(({ key }) => key), [
    "explain-addressing",
    "apply-addressing",
  ]);
  assert.deepEqual(objectives[1].prerequisites, ["explain-addressing"]);
  const blocked = evaluateObjectiveEvidence({
    topic,
    moduleVersion: 1,
    proposals: [{
      objectiveKey: "apply-addressing",
      criteria: [{ criterionKey: "application", demonstrated: true }],
    }],
  });
  assert.equal(blocked.targetObjectiveKey, "explain-addressing");
  assert.deepEqual(blocked.evidence, []);
});

test("all approved criteria and their evidence thresholds are required for mastery", () => {
  const firstEvidence = evaluateObjectiveEvidence({
    topic,
    moduleVersion: 2,
    proposals: [{
      objectiveKey: "explain-addressing",
      criteria: [
        { criterionKey: "purpose", demonstrated: true, evidenceQuote: "logical address", confidence: 0.95 },
        { criterionKey: "routing", demonstrated: true, evidenceQuote: "route packets", confidence: 0.9 },
        { criterionKey: "unapproved", demonstrated: true },
      ],
    }],
    studentResponse: "A logical address helps route packets.",
    evidenceId: "attempt-1",
    sessionId: "session-1",
    messageIndex: 0,
  });
  assert.equal(firstEvidence.evidence.length, 1);
  assert.equal(firstEvidence.evidence[0].criteria.length, 2);
  assert.deepEqual(firstEvidence.masteredObjectiveKeys, []);

  const secondEvidence = evaluateObjectiveEvidence({
    topic,
    moduleVersion: 2,
    existingEvidence: firstEvidence.evidence,
    proposals: [{
      objectiveKey: "explain-addressing",
      criteria: [{
        criterionKey: "routing",
        demonstrated: true,
        evidenceQuote: "route packets",
        confidence: 0.92,
      }],
    }],
    studentResponse: "Logical addresses help route packets.",
    evidenceId: "attempt-2",
    sessionId: "session-1",
    messageIndex: 1,
  });
  assert.deepEqual(secondEvidence.masteredObjectiveKeys, ["explain-addressing"]);
  const progress = getObjectiveProgress(topic, {
    moduleVersion: 2,
    completedObjectiveKeys: ["topic-1:explain-addressing"],
    objectiveEvidence: [...firstEvidence.evidence, ...secondEvidence.evidence],
  });
  assert.deepEqual(progress.map(({ state }) => state), ["MASTERED", "NOT_STARTED"]);
});

test("misconception evidence does not count as demonstrated mastery and duplicate evidence is idempotent", () => {
  const response = {
    objectiveKey: "explain-addressing",
    criteria: [{
      criterionKey: "purpose",
      demonstrated: false,
      misconceptions: ["Confuses a name with a routable address."],
    }],
  };
  const first = evaluateObjectiveEvidence({
    topic,
    moduleVersion: 1,
    proposals: [response],
    studentResponse: "An address is just a name.",
    evidenceId: "same-answer",
    sessionId: "session-1",
    messageIndex: 0,
  });
  assert.equal(first.evidence.length, 1);
  assert.deepEqual(first.masteredObjectiveKeys, []);

  const duplicate = evaluateObjectiveEvidence({
    topic,
    moduleVersion: 1,
    existingEvidence: first.evidence,
    proposals: [response],
    evidenceId: "same-answer",
    sessionId: "session-1",
    messageIndex: 1,
  });
  assert.deepEqual(duplicate.evidence, []);
  const progress = getObjectiveProgress(topic, {
    moduleVersion: 1,
    objectiveEvidence: first.evidence,
  });
  assert.equal(progress[0].state, "EVIDENCE_REQUIRED");
});

test("AI evidence requires a verbatim response citation and sufficient confidence", () => {
  const evaluate = (criterion) => evaluateObjectiveEvidence({
    topic,
    moduleVersion: 1,
    proposals: [{
      objectiveKey: "explain-addressing",
      criteria: [{ criterionKey: "purpose", demonstrated: true, ...criterion }],
    }],
    studentResponse: "An address helps route a packet.",
    evidenceId: "citation-check",
    sessionId: "session-1",
    messageIndex: 0,
  });

  assert.deepEqual(evaluate({ evidenceQuote: "logical addresses", confidence: 0.99 }).masteredObjectiveKeys, []);
  assert.deepEqual(evaluate({ evidenceQuote: "helps route a packet", confidence: 0.69 }).masteredObjectiveKeys, []);
  assert.deepEqual(evaluate({ evidenceQuote: "helps route a packet", confidence: 0.9 }).masteredObjectiveKeys, []);
  assert.deepEqual(evaluate({ evidenceQuote: "An address helps route a packet.", confidence: 0.9 }).masteredObjectiveKeys, []);
});

test("verified task outcomes can prove only compatible approved criteria", () => {
  const codeTopic = {
    _id: "code-topic",
    objectiveDefinitions: [{
      key: "implement",
      title: "Implement a method",
      masteryCriteria: [
        { key: "implementation", description: "Write a correct method.", evaluationMethod: "CODE" },
        { key: "explanation", description: "Explain the method.", evaluationMethod: "EXPLANATION" },
      ],
    }],
  };
  const result = evaluateObjectiveEvidence({
    topic: codeTopic,
    moduleVersion: 1,
    verifiedCriteria: [
      { criterionKey: "implementation", sourceType: "CODE_TASK", verificationReference: "3/3 tests passed." },
      { criterionKey: "explanation", sourceType: "CODE_TASK", verificationReference: "3/3 tests passed." },
    ],
    sourceType: "CODE_TASK",
    taskId: "task-1",
    taskAttemptKey: "attempt-1",
    evidenceId: "attempt-1",
    sessionId: "session-1",
    messageId: "message-1",
    messageIndex: 0,
  });

  assert.deepEqual(result.masteredObjectiveKeys, []);
  assert.deepEqual(result.evidence[0].criteria.map((criterion) => criterion.criterionKey), ["implementation"]);
  assert.equal(result.evidence[0].sourceType, "CODE_TASK");
});

test("legacy string objectives keep their existing index-based progress keys", () => {
  const legacyTopic = { _id: "legacy-topic", objectives: ["Explain variables."] };
  const state = getObjectiveProgress(legacyTopic, {
    completedObjectiveKeys: ["legacy-topic:0"],
  });
  assert.equal(state[0].state, "MASTERED");
});
