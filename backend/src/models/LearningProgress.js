import mongoose from "mongoose";

const criterionEvidenceSchema = new mongoose.Schema(
  {
    criterionKey: { type: String, required: true, maxlength: 100 },
    demonstrated: { type: Boolean, required: true },
    evaluationMethod: { type: String, maxlength: 40, default: "EXPLANATION" },
    evidenceQuote: { type: String, maxlength: 500, default: "" },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    rationale: { type: String, maxlength: 500, default: "" },
    demonstratedConcepts: { type: [String], default: [] },
    missingConcepts: { type: [String], default: [] },
    misconceptions: { type: [String], default: [] },
  },
  { _id: false },
);

const objectiveEvidenceSchema = new mongoose.Schema(
  {
    evidenceId: { type: String, required: true, maxlength: 100 },
    topicId: { type: mongoose.Schema.Types.ObjectId, required: true },
    moduleVersion: { type: Number, min: 1, required: true },
    objectiveKey: { type: String, required: true, maxlength: 100 },
    sourceType: {
      type: String,
      enum: ["TUTOR", "THEORY_TASK", "MATH_TASK", "CODE_TASK"],
      default: "TUTOR",
    },
    taskId: { type: mongoose.Schema.Types.ObjectId, default: null },
    taskAttemptKey: { type: String, maxlength: 100, default: "" },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningSession", required: true },
    messageId: { type: String, maxlength: 100, default: "" },
    messageIndex: { type: Number, min: 0, required: true },
    criteria: { type: [criterionEvidenceSchema], required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const objectiveProfileSchema = new mongoose.Schema(
  {
    objectiveKey: { type: String, required: true, maxlength: 100 },
    moduleVersion: { type: Number, min: 1, required: true },
    demonstratedCount: { type: Number, min: 0, default: 0 },
    missingConcepts: { type: [String], default: [] },
    misconceptions: { type: [String], default: [] },
    teachingSignals: { type: [String], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const learningTaskAttemptSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true, maxlength: 100 },
    taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, required: true },
    moduleVersion: { type: Number, min: 1, required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningSession", required: true },
    responseHash: { type: String, required: true, maxlength: 64 },
    taskType: { type: String, enum: ["ACTIVITY", "MATH", "CODE"], required: true },
    status: { type: String, maxlength: 40, required: true },
    accepted: { type: Boolean, required: true },
    duplicateCount: { type: Number, min: 0, default: 0 },
    evaluationTimeMs: { type: Number, min: 0, default: 0 },
    feedback: { type: String, maxlength: 3000, default: "" },
    evaluation: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const learningProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", required: true },
    moduleVersion: { type: Number, min: 1, default: null },
    completedTopicIds: [{ type: mongoose.Schema.Types.ObjectId }],
    completedObjectiveKeys: [{ type: String }],
    completedExerciseIds: [{ type: mongoose.Schema.Types.ObjectId }],
    objectiveEvidence: { type: [objectiveEvidenceSchema], default: [] },
    objectiveProfiles: { type: [objectiveProfileSchema], default: [] },
    taskAttempts: { type: [learningTaskAttemptSchema], default: [] },
    progressPercentage: { type: Number, min: 0, max: 100, default: 0 },
    assessmentPassed: { type: Boolean, default: false },
    assessmentScorePercent: { type: Number, min: 0, max: 100, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

learningProgressSchema.index({ userId: 1, moduleId: 1 }, { unique: true });
learningProgressSchema.index({ userId: 1, completedAt: 1 });

export default mongoose.model("LearningProgress", learningProgressSchema);
