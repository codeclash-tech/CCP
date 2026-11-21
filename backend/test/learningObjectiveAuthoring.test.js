import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import LearningModule from "../src/models/LearningModule.js";
import LearningModuleVersion from "../src/models/LearningModuleVersion.js";
import LearningTopicVersion from "../src/models/LearningTopicVersion.js";
import { setLearningModuleStatus } from "../src/services/learningService.js";

function structuredTopic() {
  return {
    title: "Logical addressing",
    description: "Understand how networks route packets.",
    objectives: ["Explain the role of logical addresses."],
    objectiveDefinitions: [{
      key: "logical-address-purpose",
      title: "Explain logical addressing",
      description: "Explain the role of logical addresses in routing.",
      expectedOutcome: "Explain why logical addresses are used for routing.",
      masteryCriteria: [{
        key: "purpose",
        description: "Relate a logical address to packet routing.",
        evaluationMethod: "APPLICATION",
        requiredEvidenceCount: 2,
      }],
    }],
    coreKnowledge: [{
      key: "definition",
      type: "DEFINITION",
      schemaVersion: 1,
      title: "Logical address",
      content: "An address used to identify a network endpoint.",
      objectiveKeys: ["logical-address-purpose"],
      order: 0,
    }],
  };
}

test("publishing structured objectives freezes objective rubrics and knowledge in version snapshots", async () => {
  const moduleId = new mongoose.Types.ObjectId();
  const programId = new mongoose.Types.ObjectId();
  const module = new LearningModule({
    _id: moduleId,
    programId,
    title: "Networking foundations",
    description: "Network concepts.",
    sequence: 1,
    estimatedDurationMinutes: 45,
    status: "DRAFT",
    topics: [structuredTopic()],
  });
  let savedModuleSnapshot;
  let savedTopicSnapshot;
  const originals = [
    [LearningModule, "findOne", LearningModule.findOne],
    [LearningModule.prototype, "save", LearningModule.prototype.save],
    [LearningModuleVersion, "findOneAndUpdate", LearningModuleVersion.findOneAndUpdate],
    [LearningTopicVersion, "bulkWrite", LearningTopicVersion.bulkWrite],
  ];
  LearningModule.findOne = async () => module;
  LearningModule.prototype.save = async function saveModule() { return this; };
  LearningModuleVersion.findOneAndUpdate = async (_filter, update) => {
    savedModuleSnapshot = update.$setOnInsert;
    return {};
  };
  LearningTopicVersion.bulkWrite = async (operations) => {
    savedTopicSnapshot = operations[0].updateOne.update.$setOnInsert.topicSnapshot;
    return {};
  };

  try {
    const published = await setLearningModuleStatus(moduleId, "PUBLISHED");
    assert.equal(published.currentPublishedVersion, 1);
    assert.equal(savedModuleSnapshot.topicSummaries[0].objectiveDefinitions[0].key, "logical-address-purpose");
    assert.equal(savedTopicSnapshot.objectiveDefinitions[0].masteryCriteria[0].requiredEvidenceCount, 2);
    assert.equal(savedTopicSnapshot.coreKnowledge[0].type, "DEFINITION");

    module.topics[0].objectiveDefinitions[0].title = "Edited later";
    assert.equal(savedTopicSnapshot.objectiveDefinitions[0].title, "Explain logical addressing");
  } finally {
    for (const [target, name, original] of originals) target[name] = original;
  }
});

test("publication rejects incomplete criteria and topic prerequisites that point forward", async () => {
  const moduleId = new mongoose.Types.ObjectId();
  const module = new LearningModule({
    _id: moduleId,
    programId: new mongoose.Types.ObjectId(),
    title: "Networking foundations",
    description: "Network concepts.",
    sequence: 1,
    estimatedDurationMinutes: 45,
    status: "DRAFT",
    topics: [structuredTopic()],
  });
  const originalFindOne = LearningModule.findOne;
  LearningModule.findOne = async () => module;
  try {
    module.topics[0].objectiveDefinitions[0].masteryCriteria = [];
    await assert.rejects(
      setLearningModuleStatus(moduleId, "PUBLISHED"),
      /specific mastery criteria/,
    );

    module.topics[0].objectiveDefinitions[0].masteryCriteria = [{
      key: "purpose",
      description: "Explain the role of logical addresses.",
    }];
    module.topics.push({
      ...structuredTopic(),
      prerequisiteTopicIds: [module.topics[0]._id],
    });
    module.topics[0].prerequisiteTopicIds = [module.topics[1]._id];
    await assert.rejects(
      setLearningModuleStatus(moduleId, "PUBLISHED"),
      /prerequisites.*earlier topics/,
    );
    assert.equal(module.status, "DRAFT");
  } finally {
    LearningModule.findOne = originalFindOne;
  }
});
