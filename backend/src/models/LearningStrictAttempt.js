import mongoose from "mongoose";

const strictQuestionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, maxlength: 100 },
    objectiveKey: { type: String, maxlength: 100, default: "" },
    prompt: { type: String, required: true, maxlength: 4000 },
    difficulty: {
      type: String,
      enum: ["EASY", "MEDIUM", "HARD"],
      default: "MEDIUM",
    },
    // MCQ shape
    options: { type: [String], default: [] },
    correctOptionIndex: { type: Number, default: -1 },
    marks: { type: Number, min: 0, default: 1 },
    // Concepts shape (open question, AI-evaluated)
    expectedAnswerPoints: { type: [String], default: [] },
  },
  { _id: false },
);

const objectiveResultSchema = new mongoose.Schema(
  {
    objectiveKey: { type: String, required: true, maxlength: 100 },
    objectiveTitle: { type: String, maxlength: 200, default: "" },
    level: {
      type: String,
      enum: ["BEGINNER", "DEVELOPING", "INTERMEDIATE", "ADVANCED", "EXPERT"],
      default: "BEGINNER",
    },
    scorePercent: { type: Number, min: 0, max: 100, default: 0 },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    knowledgeGaps: { type: [String], default: [] },
    misconceptions: { type: [String], default: [] },
  },
  { _id: false },
);

const strictResultSchema = new mongoose.Schema(
  {
    overallLevel: {
      type: String,
      enum: ["BEGINNER", "DEVELOPING", "INTERMEDIATE", "ADVANCED", "EXPERT"],
      default: "BEGINNER",
    },
    scorePercent: { type: Number, min: 0, max: 100, default: 0 },
    passed: { type: Boolean, default: false },
    objectiveResults: { type: [objectiveResultSchema], default: [] },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    knowledgeGaps: { type: [String], default: [] },
    misconceptions: { type: [String], default: [] },
    improvementSuggestions: { type: [String], default: [] },
    appreciation: { type: String, maxlength: 2000, default: "" },
    generatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * One Strict Evaluation attempt for one student on one published module
 * version. Question sets are generated at session start from the published
 * version snapshot and saved here so results survive refreshes and are
 * comparable across students (same blueprint).
 */
const learningStrictAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningModule",
      required: true,
      index: true,
    },
    moduleVersion: { type: Number, min: 1, required: true },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    contentType: { type: String, enum: ["CONCEPTS", "MCQS"], required: true },
    status: {
      type: String,
      enum: ["IN_PROGRESS", "COMPLETED", "EXPIRED"],
      default: "IN_PROGRESS",
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    questions: { type: [strictQuestionSchema], default: [] },
    // student answers keyed by question key — answers only, never exposed back
    answers: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    result: { type: strictResultSchema, default: null },
    reportEmailStatus: {
      type: String,
      enum: ["PENDING", "SENT", "FAILED"],
      default: "PENDING",
    },
  },
  { timestamps: true },
);

learningStrictAttemptSchema.index({
  userId: 1,
  moduleId: 1,
  moduleVersion: 1,
  topicId: 1,
  status: 1,
});
learningStrictAttemptSchema.index({ moduleId: 1, status: 1, createdAt: -1 });

export default mongoose.model(
  "LearningStrictAttempt",
  learningStrictAttemptSchema,
);
