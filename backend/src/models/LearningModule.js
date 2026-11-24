import mongoose from "mongoose";

const exampleSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 160, default: "" },
    explanation: { type: String, trim: true, maxlength: 5000, default: "" },
    code: { type: String, maxlength: 20000, default: "" },
    language: { type: String, trim: true, lowercase: true, maxlength: 40, default: "" },
  },
  { _id: true },
);

const questionSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true, trim: true, maxlength: 3000 },
    expectedAnswer: { type: String, required: true, trim: true, maxlength: 5000 },
    acceptedAnswers: { type: [String], default: [] },
  },
  { _id: true },
);

const exerciseTestSchema = new mongoose.Schema(
  {
    input: { type: String, maxlength: 4000, default: "" },
    expectedOutput: { type: String, required: true, maxlength: 4000 },
    visible: { type: Boolean, default: false },
  },
  { _id: false },
);

const exerciseSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["CODE", "ACTIVITY", "MATH"], default: "CODE" },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    instructions: { type: String, required: true, trim: true, maxlength: 5000 },
    starterCode: { type: String, maxlength: 20000, default: "" },
    language: { type: String, trim: true, lowercase: true, maxlength: 40, default: "java" },
    objectiveKeys: { type: [String], default: [] },
    criterionKeys: { type: [String], default: [] },
    evaluationMethod: {
      type: String,
      enum: ["EXPLANATION", "IDENTIFICATION", "PREDICTION", "COMPARISON", "APPLICATION", "ANALYSIS", "CALCULATION", "DIAGRAM", "PROCEDURE", "CODE", "DEBUGGING", "PRACTICAL"],
      default: "EXPLANATION",
    },
    expectedAnswer: { type: String, maxlength: 3000, default: "" },
    acceptedAnswers: { type: [String], default: [] },
    variables: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    unit: { type: String, trim: true, maxlength: 40, default: "" },
    numericTolerance: { type: Number, min: 0, max: 1000000000000, default: 0.000001 },
    requireReasoning: { type: Boolean, default: false },
    requireUnit: { type: Boolean, default: false },
    tests: { type: [exerciseTestSchema], default: [] },
  },
  { _id: true },
);

const subtopicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    explanation: { type: String, trim: true, maxlength: 12000, default: "" },
    objectives: { type: [String], default: [] },
    examples: { type: [exampleSchema], default: [] },
    questions: { type: [questionSchema], default: [] },
    exercises: { type: [exerciseSchema], default: [] },
  },
  { _id: true },
);

const objectiveCriterionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    evaluationMethod: {
      type: String,
      enum: ["EXPLANATION", "IDENTIFICATION", "PREDICTION", "COMPARISON", "APPLICATION", "ANALYSIS", "CALCULATION", "DIAGRAM", "PROCEDURE", "CODE", "DEBUGGING", "PRACTICAL"],
      default: "EXPLANATION",
    },
    requiredEvidenceCount: { type: Number, min: 1, max: 5, default: 1 },
  },
  { _id: false },
);

const learningObjectiveSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 100 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    requiredKnowledge: { type: [String], default: [] },
    expectedOutcome: { type: String, trim: true, maxlength: 2000, default: "" },
    masteryCriteria: { type: [objectiveCriterionSchema], default: [] },
    commonMisconceptions: { type: [String], default: [] },
    prerequisites: { type: [String], default: [] },
  },
  { _id: false },
);

const coreKnowledgeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 100 },
    type: {
      type: String,
      enum: ["CONCEPT", "DEFINITION", "EXPLANATION", "EXAMPLE", "ANALOGY", "PROCEDURE", "STEPS", "FORMULA", "DERIVATION", "CASE_STUDY", "SCENARIO", "DIAGRAM", "SIMULATION", "EXERCISE", "QUESTION", "COMPARISON", "REVISION_SUMMARY"],
      required: true,
    },
    schemaVersion: { type: Number, min: 1, default: 1 },
    title: { type: String, trim: true, maxlength: 160, default: "" },
    content: { type: mongoose.Schema.Types.Mixed, default: "" },
    objectiveKeys: { type: [String], default: [] },
    order: { type: Number, min: 0, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false },
);
/** Strict Evaluation (Concepts) configuration â€” set on topics. */
const strictConceptConfigSchema = new mongoose.Schema(
  {
    expectedKnowledgeIndicators: { type: [String], default: [] },
    evaluationCriteria: { type: [String], default: [] },
    levelClassificationCriteria: { type: String, trim: true, maxlength: 8000, default: "" },
    questionCount: { type: Number, min: 1, max: 60, default: 5 },
    timeLimitMinutes: { type: Number, min: 1, max: 600, default: null },
  },
  { _id: false },
);

/** Strict Evaluation (MCQ) configuration â€” set on topics. */
const strictMcqConfigSchema = new mongoose.Schema(
  {
    questionCount: { type: Number, min: 1, max: 200, default: 10 },
    objectiveAllocation: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    difficultyDistribution: {
      type: String,
      enum: ["EASY", "BALANCED", "CHALLENGING"],
      default: "BALANCED",
    },
    timeLimitMinutes: { type: Number, min: 1, max: 600, default: null },
    negativeMarkingPercent: { type: Number, min: 0, max: 100, default: 0 },
    evaluationCriteria: { type: [String], default: [] },
  },
  { _id: false },
);

/** Self Evaluation (MCQ) configuration â€” set on topics. */
const selfMcqConfigSchema = new mongoose.Schema(
  {
    questionCoverage: { type: String, trim: true, maxlength: 4000, default: "" },
    questionsPerSession: { type: Number, min: 1, max: 50, default: 5 },
    difficultyRange: {
      type: String,
      enum: ["EASY_TO_MEDIUM", "EASY_TO_HARD", "MEDIUM_TO_HARD"],
      default: "EASY_TO_MEDIUM",
    },
  },
  { _id: false },
);

/** Self Evaluation (Concepts) configuration â€” set on topics. */
const selfConceptConfigSchema = new mongoose.Schema(
  {
    keyConcepts: { type: [String], default: [] },
    expectedKnowledge: { type: [String], default: [] },
    importantDefinitions: { type: [String], default: [] },
    realLifeExamples: { type: [String], default: [] },
    commonMisconceptions: { type: [String], default: [] },
  },
  { _id: false },
);

const completionRequirementsSchema = new mongoose.Schema(
  {
    minCompletedTopics: { type: Number, min: 0, default: 1 },
    requiredExercises: { type: Number, min: 0, default: 0 },
    requireAssessment: { type: Boolean, default: false },
  },
  { _id: false },
);

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    contentType: {
      type: String,
      enum: ["CONCEPTS", "MCQS"],
      default: "CONCEPTS",
      index: true,
    },
    /**
     * Prompt-first authoring: the admin writes a natural-language prompt
     * describing what the topic must teach or assess. The AI derives the
     * objectives/teaching structure from this prompt; every other field is
     * optional enrichment. Cached derived structure lives in aiPlan.
     */
    aiPrompt: { type: String, trim: true, maxlength: 12000, default: "" },
    aiPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    selfConceptConfig: { type: selfConceptConfigSchema, default: null },
    selfMcqConfig: { type: selfMcqConfigSchema, default: null },
    strictConceptConfig: { type: strictConceptConfigSchema, default: null },
    strictMcqConfig: { type: strictMcqConfigSchema, default: null },
    subject: { type: String, trim: true, maxlength: 100, default: "" },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    estimatedDurationMinutes: { type: Number, min: 1, max: 100000, default: null },
    explanation: { type: String, trim: true, maxlength: 12000, default: "" },
    tutorInstructions: { type: String, trim: true, maxlength: 4000, default: "" },
    validationInstructions: { type: String, trim: true, maxlength: 4000, default: "" },
    objectives: { type: [String], default: [] },
    objectiveDefinitions: { type: [learningObjectiveSchema], default: [] },
    coreKnowledge: { type: [coreKnowledgeSchema], default: [] },
    prerequisiteTopicIds: [{ type: mongoose.Schema.Types.ObjectId }],
    examples: { type: [exampleSchema], default: [] },
    questions: { type: [questionSchema], default: [] },
    exercises: { type: [exerciseSchema], default: [] },
    subtopics: { type: [subtopicSchema], default: [] },
  },
  { _id: true },
);

const assessmentSchema = new mongoose.Schema(
  {
    questions: { type: [questionSchema], default: [] },
    passingScorePercent: { type: Number, min: 1, max: 100, default: 70 },
  },
  { _id: false },
);

const aiConfigurationSchema = new mongoose.Schema(
  {
    behaviorPrompt: { type: String, trim: true, maxlength: 8000, default: "" },
    advancedSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    version: { type: Number, min: 1, default: 1 },
    history: {
      type: [
        new mongoose.Schema(
          {
            version: { type: Number, required: true },
            behaviorPrompt: { type: String, maxlength: 8000, default: "" },
            advancedSettings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const learningModuleSchema = new mongoose.Schema(
  {
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningProgram",
      required: true,
      index: true,
    },
    evaluationMode: {
      type: String,
      enum: ["SELF_EVALUATION", "STRICT_EVALUATION"],
      default: "SELF_EVALUATION",
      index: true,
    },
    requiredForCompletion: { type: Boolean, default: true },
    scheduleStartAt: { type: Date, default: null },
    scheduleEndAt: { type: Date, default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    shortDescription: { type: String, trim: true, maxlength: 300, default: "" },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    objectives: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, uppercase: true, trim: true, minlength: 3, maxlength: 3, default: "INR" },
    accessDurationDays: { type: Number, min: 1, max: 36500, default: null },
    difficulty: { type: String, enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"], default: "BEGINNER" },
    sequence: { type: Number, required: true, min: 1 },
    estimatedDurationMinutes: { type: Number, required: true, min: 1, max: 100000 },
    prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: "LearningModule" }],
    topics: { type: [topicSchema], default: [] },
    assessment: { type: assessmentSchema, default: () => ({}) },
    completionRequirements: { type: completionRequirementsSchema, default: () => ({}) },
    status: { type: String, enum: ["DRAFT", "PUBLISHED"], default: "PUBLISHED", index: true },
    deletedAt: { type: Date, default: null },
    currentPublishedVersion: { type: Number, min: 0, default: 0 },
    aiConfiguration: { type: aiConfigurationSchema, default: () => ({}) },
  },
  { timestamps: true },
);

learningModuleSchema.index(
  { programId: 1, sequence: 1 },
  {
    name: "unique_active_learning_module_sequence",
    unique: true,
    partialFilterExpression: { deletedAt: null },
  },
);
learningModuleSchema.index({ programId: 1, status: 1, deletedAt: 1, sequence: 1 });

export default mongoose.model("LearningModule", learningModuleSchema);
