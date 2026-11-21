import assert from "node:assert/strict";
import test from "node:test";
import LearningAiUsage from "../src/models/LearningAiUsage.js";
import LearningModule from "../src/models/LearningModule.js";
import config from "../src/config/env.js";
import { generateLearningTopicProposal } from "../src/services/learningService.js";

const proposal = {
  description: "Learn how addresses support packet delivery.",
  estimatedDurationMinutes: 25,
  objectiveDefinitions: [
    {
      key: "address-purpose",
      title: "Explain logical addressing",
      description: "Describe how a logical address identifies a network endpoint.",
      requiredKnowledge: ["Logical address"],
      expectedOutcome: "Explain how a logical address helps route packets.",
      masteryCriteria: [{
        key: "routing-role",
        description: "Relate logical addressing to packet routing.",
        evaluationMethod: "APPLICATION",
        requiredEvidenceCount: 1,
      }],
      commonMisconceptions: ["A logical address is the same as a physical address."],
      prerequisites: [],
    },
    {
      key: "apply-address",
      title: "Apply logical addressing",
      description: "Use logical addressing to reason about a new network scenario.",
      requiredKnowledge: [],
      expectedOutcome: "Identify the relevant logical address in a scenario.",
      masteryCriteria: [{
        key: "scenario",
        description: "Identify how a router uses the destination logical address.",
        evaluationMethod: "ANALYSIS",
        requiredEvidenceCount: 1,
      }],
      commonMisconceptions: [],
      prerequisites: ["address-purpose"],
    },
  ],
  coreKnowledge: [{
    key: "approved-explanation",
    type: "EXPLANATION",
    schemaVersion: 1,
    title: "Addressing",
    content: "Logical addresses identify endpoints for routing.",
    objectiveKeys: ["address-purpose", "apply-address"],
    order: 0,
    metadata: {},
  }],
  practiceTasks: [{
    title: "Inspect a routing scenario",
    instructions: "Identify the destination logical address and explain its role.",
    objectiveKeys: ["apply-address"],
  }],
};

async function withStubs(rawContent, callback) {
  const originalFetch = globalThis.fetch;
  const originalModuleFindOne = LearningModule.findOne;
  const originalUsageCreate = LearningAiUsage.create;
  const originalConfig = {
    AI_PROVIDER: config.AI_PROVIDER,
    AI_MODEL: config.AI_MODEL,
    AI_BASE_URL: config.AI_BASE_URL,
    AI_API_KEY: config.AI_API_KEY,
    AI_TIMEOUT_MS: config.AI_TIMEOUT_MS,
  };
  const usage = [];
  LearningModule.findOne = () => ({
    select: async () => ({ title: "Network foundations" }),
  });
  LearningAiUsage.create = async (entry) => {
    usage.push(entry);
    return entry;
  };
  config.AI_PROVIDER = "groq";
  config.AI_MODEL = "openai/gpt-oss-20b";
  config.AI_BASE_URL = "https://api.groq.com/openai/v1";
  config.AI_API_KEY = "test-key";
  config.AI_TIMEOUT_MS = "1000";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: rawContent } }],
    }),
  });
  try {
    await callback(usage);
  } finally {
    globalThis.fetch = originalFetch;
    LearningModule.findOne = originalModuleFindOne;
    LearningAiUsage.create = originalUsageCreate;
    Object.assign(config, originalConfig);
  }
}

test("AI topic proposals are validated, linked to objectives, and returned without publishing", async () => {
  await withStubs(JSON.stringify(proposal), async (usage) => {
    let response;
    await assert.doesNotReject(async () => {
      response = await generateLearningTopicProposal(
        "507f1f77bcf86cd799439001",
        "507f1f77bcf86cd799439002",
        {
          title: "Logical addressing",
          subject: "Computer Networks",
          description: "How a network routes packets.",
          referenceContent: "Approved reference material.",
        },
      );
    });
    assert.equal(response.proposal.title, "Logical addressing");
    assert.equal(response.proposal.objectiveDefinitions.length, 2);
    assert.equal(response.proposal.objectiveDefinitions[1].prerequisites[0], "address-purpose");
    assert.equal(response.proposal.coreKnowledge[0].objectiveKeys.length, 2);
    assert.equal(response.proposal.practiceTasks[0].objectiveKeys[0], "apply-address");
    assert.equal(usage.length, 1);
    assert.equal(usage[0].operation, "TOPIC_PROPOSAL");
    assert.equal(usage[0].succeeded, true);
  });
});

test("malformed AI curriculum is rejected and recorded as a failed proposal", async () => {
  const incomplete = {
    ...proposal,
    objectiveDefinitions: [{
      key: "missing-rubric",
      title: "Incomplete objective",
      expectedOutcome: "Demonstrate the objective.",
      masteryCriteria: [],
    }],
  };
  await withStubs(JSON.stringify(incomplete), async (usage) => {
    await assert.rejects(
      generateLearningTopicProposal(
        "507f1f77bcf86cd799439001",
        "507f1f77bcf86cd799439002",
        { title: "Topic", subject: "Theory", referenceContent: "Notes." },
      ),
      (error) => error.statusCode === 502 && /incomplete objective/.test(error.message),
    );
    assert.equal(usage.length, 1);
    assert.equal(usage[0].succeeded, false);
  });
});

test("source-based curriculum previews preserve pasted objectives and flag partial coverage", async () => {
  const sourceContent = "A logical address identifies a network endpoint and helps a router forward packets.";
  const objectivesText = [
    "- Explain how a logical address identifies a network endpoint.",
    "- Apply logical addressing to packet routing.",
  ].join("\n");
  const sourceProposal = {
    objectiveDefinitions: [
      {
        key: "logical-address-purpose",
        title: "Explain how a logical address identifies a network endpoint.",
        description: "Explain how a logical address identifies a network endpoint.",
        requiredKnowledge: ["A logical address identifies a network endpoint."],
        expectedOutcome: "Explain the role of a logical address.",
        masteryCriteria: [{
          key: "purpose",
          description: "Explain what a logical address identifies.",
          evaluationMethod: "EXPLANATION",
          requiredEvidenceCount: 1,
        }],
        commonMisconceptions: [],
        prerequisites: [],
      },
      {
        key: "apply-logical-address",
        title: "Apply logical addressing to packet routing.",
        description: "Apply logical addressing to packet routing.",
        requiredKnowledge: ["A router forwards packets."],
        expectedOutcome: "Apply logical addressing in a routing scenario.",
        masteryCriteria: [{
          key: "application",
          description: "Apply the concept to a routing scenario.",
          evaluationMethod: "APPLICATION",
          requiredEvidenceCount: 1,
        }],
        commonMisconceptions: [],
        prerequisites: ["logical-address-purpose"],
      },
    ],
    coverageReport: [
      {
        objectiveKey: "logical-address-purpose",
        status: "COVERED",
        sourceExcerpt: "A logical address identifies a network endpoint",
        notes: "The source directly states the identification role.",
      },
      {
        objectiveKey: "apply-logical-address",
        status: "PARTIAL",
        sourceExcerpt: "helps a router forward packets",
        notes: "The source does not describe a complete routing scenario.",
      },
    ],
    practiceTasks: [
      {
        type: "ACTIVITY",
        title: "Explain addressing",
        instructions: "Explain what a logical address identifies.",
        objectiveKeys: ["logical-address-purpose"],
      },
      {
        type: "ACTIVITY",
        title: "Apply addressing",
        instructions: "Reason about a new packet-routing scenario.",
        objectiveKeys: ["apply-logical-address"],
      },
    ],
  };

  await withStubs(JSON.stringify(sourceProposal), async () => {
    const result = await generateLearningTopicProposal(
      "507f1f77bcf86cd799439001",
      "507f1f77bcf86cd799439002",
      {
        title: "Logical addressing",
        description: "Understand network addressing.",
        objectivesText,
        referenceContent: sourceContent,
      },
    );

    assert.deepEqual(result.proposal.objectives, [
      "Explain how a logical address identifies a network endpoint.",
      "Apply logical addressing to packet routing.",
    ]);
    assert.equal(result.proposal.objectiveDefinitions[0].title, result.proposal.objectives[0]);
    assert.equal(result.proposal.coreKnowledge[0].content, sourceContent);
    assert.equal(result.proposal.coverageReport[0].status, "COVERED");
    assert.equal(result.proposal.coverageIssues.length, 1);
    assert.equal(result.proposal.coverageIssues[0].status, "PARTIAL");
    assert.equal(result.proposal.practiceTasks.length, 2);
  });
});
