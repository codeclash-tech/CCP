import mongoose from "mongoose";

const learningAssessmentAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", required: true },
    moduleVersion: { type: Number, min: 1, required: true },
    assessmentId: { type: String, required: true },
    attemptNumber: { type: Number, min: 1, required: true },
    answers: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    scorePercent: { type: Number, min: 0, max: 100, required: true },
    passed: { type: Boolean, required: true },
    evaluatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

learningAssessmentAttemptSchema.index({ userId: 1, moduleId: 1, createdAt: -1 });

export default mongoose.model("LearningAssessmentAttempt", learningAssessmentAttemptSchema);
