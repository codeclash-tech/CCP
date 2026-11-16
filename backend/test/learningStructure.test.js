import assert from "node:assert/strict";
import test from "node:test";
import LearningModule from "../src/models/LearningModule.js";
import LearningProgram from "../src/models/LearningProgram.js";
import { createJavaLearningProgramStructure } from "../src/services/learningService.js";

test("Super Admin Java template creates ten blank, editable module records", async () => {
  const originalExists = LearningProgram.exists;
  const originalSave = LearningProgram.prototype.save;
  const originalInsertMany = LearningModule.insertMany;
  let insertedModules = [];
  LearningProgram.exists = async () => null;
  LearningProgram.prototype.save = async function saveProgram() {
    return this;
  };
  LearningModule.insertMany = async (modules) => {
    insertedModules = modules;
    return modules;
  };

  try {
    const userId = "507f1f77bcf86cd799439011";
    const program = await createJavaLearningProgramStructure(userId);
    assert.equal(program.title, "Java");
    assert.equal(program.language, "java");
    assert.equal(program.status, "DRAFT");
    assert.equal(insertedModules.length, 10);
    assert.deepEqual(insertedModules.map((module) => module.sequence), [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    assert.equal(insertedModules.every((module) => module.topics.length === 0), true);
  } finally {
    LearningProgram.exists = originalExists;
    LearningProgram.prototype.save = originalSave;
    LearningModule.insertMany = originalInsertMany;
  }
});
