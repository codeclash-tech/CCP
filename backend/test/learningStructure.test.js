import assert from "node:assert/strict";
import test from "node:test";
import LearningModule from "../src/models/LearningModule.js";
import LearningModuleVersion from "../src/models/LearningModuleVersion.js";
import LearningCertificate from "../src/models/LearningCertificate.js";
import LearningProgress from "../src/models/LearningProgress.js";
import LearningPurchase from "../src/models/LearningPurchase.js";
import LearningProgram from "../src/models/LearningProgram.js";
import LearningTopicVersion from "../src/models/LearningTopicVersion.js";
import {
  createLearningModule,
  createLearningProgram,
  getStudentModule,
  listLearningPrograms,
  serializeStudentModule,
  setLearningModuleStatus,
  updateLearningProgram,
} from "../src/services/learningService.js";

test("course creation accepts a name and description and remains unpublished until modules are added", async () => {
  const originalSave = LearningProgram.prototype.save;
  const originalInsertMany = LearningModule.insertMany;
  let insertedModules = false;
  LearningProgram.prototype.save = async function saveProgram() {
    return this;
  };
  LearningModule.insertMany = async () => {
    insertedModules = true;
    return [];
  };

  try {
    const course = await createLearningProgram("507f1f77bcf86cd799439011", {
      title: "Computer Networks",
      description: "An introduction to computer networks.",
    });

    assert.equal(course.title, "Computer Networks");
    assert.equal(course.status, "DRAFT");
    assert.equal(course.language, "");
    assert.equal(course.price, undefined);
    assert.equal(course.category, "");
    assert.equal(course.publishedAt, null);
    assert.equal(insertedModules, false);
  } finally {
    LearningProgram.prototype.save = originalSave;
    LearningModule.insertMany = originalInsertMany;
  }
});

test("course creation requires only the course name and description", async () => {
  await assert.rejects(
    createLearningProgram("507f1f77bcf86cd799439011", {
      title: "React",
      shortDescription: "Build interfaces.",
    }),
    /Full description is required/,
  );
});

test("a course cannot be published before at least one module exists", async () => {
  const originalFindById = LearningProgram.findById;
  const originalModuleFind = LearningModule.find;
  const program = {
    _id: "507f1f77bcf86cd799439011",
    status: "DRAFT",
    async save() {
      return this;
    },
  };
  LearningProgram.findById = async () => program;
  LearningModule.find = async () => [];

  try {
    await assert.rejects(
      updateLearningProgram("admin-1", program._id, { status: "PUBLISHED" }),
      /Add at least one module before publishing/,
    );
    assert.equal(program.status, "DRAFT");
  } finally {
    LearningProgram.findById = originalFindById;
    LearningModule.find = originalModuleFind;
  }
});

test("modules can be created one at a time with basic details and sensible defaults", async () => {
  const originalProgramFindOne = LearningProgram.findOne;
  const originalModuleFindOne = LearningModule.findOne;
  const originalSave = LearningModule.prototype.save;
  const created = [];
  let lastSequence = 0;
  LearningProgram.findOne = async () => ({ _id: "507f1f77bcf86cd799439011" });
  LearningModule.findOne = () => ({
    sort() {
      return this;
    },
    select() {
      return this;
    },
    async lean() {
      return lastSequence ? { sequence: lastSequence } : null;
    },
  });
  LearningModule.prototype.save = async function saveModule() {
    created.push(this);
    lastSequence = this.sequence;
    return this;
  };

  try {
    const courseId = "507f1f77bcf86cd799439011";
    const first = await createLearningModule(courseId, {
      title: "Components",
      description: "Learn reusable interface components.",
      price: 0,
      accessDurationDays: 30,
    });
    const second = await createLearningModule(courseId, {
      title: "Props",
      description: "Pass data between components.",
    });

    assert.equal(created.length, 2);
    assert.equal(first.status, "DRAFT");
    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
    assert.equal(first.estimatedDurationMinutes, 60);
    assert.equal(first.accessDurationDays, 30);
    assert.equal(first.shortDescription, first.description);
    assert.equal(second.accessDurationDays, null);
    assert.equal(first.topics.length, 0);
    await assert.rejects(
      createLearningModule(courseId, {
        title: "Invalid duration",
        description: "Duration must be a whole number.",
        accessDurationDays: 1.5,
      }),
      /whole number of days/,
    );
  } finally {
    LearningProgram.findOne = originalProgramFindOne;
    LearningModule.findOne = originalModuleFindOne;
    LearningModule.prototype.save = originalSave;
  }
});

test("module publication requires topics with learning objectives", async () => {
  const originalFindOne = LearningModule.findOne;
  const originalSave = LearningModule.prototype.save;
  const originalVersionUpsert = LearningModuleVersion.findOneAndUpdate;
  const originalTopicBulkWrite = LearningTopicVersion.bulkWrite;
  const module = new LearningModule({
    programId: "507f1f77bcf86cd799439011",
    title: "Intro",
    description: "Module description.",
    sequence: 1,
    estimatedDurationMinutes: 60,
    status: "DRAFT",
    topics: [],
  });
  LearningModule.findOne = async () => module;
  LearningModule.prototype.save = async function saveModule() {
    return this;
  };
  LearningModuleVersion.findOneAndUpdate = async () => ({});
  LearningTopicVersion.bulkWrite = async () => ({});

  try {
    await assert.rejects(
      setLearningModuleStatus(module._id, "PUBLISHED"),
      /needs at least one topic/,
    );
    module.topics.push({ title: "   " });
    await assert.rejects(
      setLearningModuleStatus(module._id, "PUBLISHED"),
      /needs at least one topic/,
    );
    module.topics.splice(0, module.topics.length);
    module.topics.push({
      title: "Introduction",
      description: "Learn network basics.",
      objectives: [],
    });
    await assert.rejects(
      setLearningModuleStatus(module._id, "PUBLISHED"),
      /needs at least one learning objective/,
    );
    module.topics[0].objectives = ["Explain how devices connect."];
    const published = await setLearningModuleStatus(module._id, "PUBLISHED");
    assert.equal(published.status, "PUBLISHED");
    assert.equal(published.currentPublishedVersion, 1);
  } finally {
    LearningModule.findOne = originalFindOne;
    LearningModule.prototype.save = originalSave;
    LearningModuleVersion.findOneAndUpdate = originalVersionUpsert;
    LearningTopicVersion.bulkWrite = originalTopicBulkWrite;
  }
});

test("student course catalog omits published courses without a published module", async () => {
  const originalDistinct = LearningModule.distinct;
  let filter;
  LearningModule.distinct = async (_field, query) => {
    filter = query;
    return [];
  };
  try {
    const result = await listLearningPrograms("student-1", 1, 20);
    assert.deepEqual(result.programs, []);
    assert.equal(result.total, 0);
    assert.equal(filter.deletedAt, null);
  } finally {
    LearningModule.distinct = originalDistinct;
  }
});

test("student module summaries include earned certificate download details", async () => {
  const originalDistinct = LearningModule.distinct;
  const originalProgramFind = LearningProgram.find;
  const originalProgramCount = LearningProgram.countDocuments;
  const originalModuleFind = LearningModule.find;
  const originalPurchaseFind = LearningPurchase.find;
  const originalProgressFind = LearningProgress.find;
  const originalCertificateFind = LearningCertificate.find;
  const programId = "507f1f77bcf86cd799439011";
  const moduleId = "507f1f77bcf86cd799439012";
  const certificateId = "507f1f77bcf86cd799439013";
  const chain = (result) => ({
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    select() { return this; },
    async lean() { return result; },
  });
  LearningModule.distinct = async () => [programId];
  LearningProgram.find = () => chain([{
    _id: programId,
    title: "Foundations",
    status: "PUBLISHED",
  }]);
  LearningProgram.countDocuments = async () => 1;
  LearningModule.find = () => chain([{
    _id: moduleId,
    programId,
    title: "Basics",
    status: "PUBLISHED",
    price: 0,
    sequence: 1,
    prerequisites: [],
  }]);
  LearningPurchase.find = () => chain([]);
  LearningProgress.find = () => chain([{
    moduleId,
    completedTopicIds: [],
    completedObjectiveKeys: [],
    completedAt: new Date(),
    assessmentPassed: true,
    progressPercentage: 100,
  }]);
  LearningCertificate.find = () => chain([{
    _id: certificateId,
    code: "THRIVE-001",
    moduleId,
  }]);

  try {
    const result = await listLearningPrograms("student-1", 1, 20);
    assert.deepEqual(result.programs[0].modules[0].certificate, {
      _id: certificateId,
      code: "THRIVE-001",
      moduleId,
    });
  } finally {
    LearningModule.distinct = originalDistinct;
    LearningProgram.find = originalProgramFind;
    LearningProgram.countDocuments = originalProgramCount;
    LearningModule.find = originalModuleFind;
    LearningPurchase.find = originalPurchaseFind;
    LearningProgress.find = originalProgressFind;
    LearningCertificate.find = originalCertificateFind;
  }
});

test("student module summaries omit topic learning content until a topic is opened", () => {
  const module = serializeStudentModule({
    _id: "module-1",
    topics: [{
      _id: "topic-1",
      title: "Variables",
      description: "Store values.",
      objectives: ["Declare a variable"],
      explanation: "Private full explanation",
      tutorInstructions: "Private tutor instruction",
      validationInstructions: "Private check instruction",
      examples: [{ title: "Example" }],
      questions: [{ prompt: "Question", expectedAnswer: "Answer" }],
      exercises: [{ title: "Exercise", tests: [{ expectedOutput: "secret" }] }],
    }],
  });

  assert.deepEqual(module.topics, [{
    _id: "topic-1",
    title: "Variables",
    description: "Store values.",
    objectives: ["Declare a variable"],
  }]);
});

test("student content lookups exclude draft and archived modules", async () => {
  const originalFindOne = LearningModule.findOne;
  let filter;
  LearningModule.findOne = (query) => {
    filter = query;
    return { select: async () => null };
  };
  try {
    await assert.rejects(
      getStudentModule("student-1", "course-1", "module-1"),
      (error) => error.statusCode === 404,
    );
    assert.equal(filter.status, "PUBLISHED");
    assert.equal(filter.deletedAt, null);
  } finally {
    LearningModule.findOne = originalFindOne;
  }
});
