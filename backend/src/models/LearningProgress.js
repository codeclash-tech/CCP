import mongoose from "mongoose";

const learningProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", required: true },
    moduleVersion: { type: Number, min: 1, default: null },
    completedTopicIds: [{ type: mongoose.Schema.Types.ObjectId }],
    completedObjectiveKeys: [{ type: String }],
    completedExerciseIds: [{ type: mongoose.Schema.Types.ObjectId }],
    progressPercentage: { type: Number, min: 0, max: 100, default: 0 },
    assessmentPassed: { type: Boolean, default: false },
    assessmentScorePercent: { type: Number, min: 0, max: 100, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

learningProgressSchema.index({ userId: 1, moduleId: 1 }, { unique: true });
learningProgressSchema.index({ userId: 1, completedAt: 1 });

export default mongoose.model("LearningProgress", learningProgressSchema);
