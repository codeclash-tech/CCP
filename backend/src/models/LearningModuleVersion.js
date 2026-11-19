import mongoose from "mongoose";

const learningModuleVersionSchema = new mongoose.Schema(
  {
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", required: true },
    version: { type: Number, required: true, min: 1 },
    moduleSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    contentSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    topicSummaries: { type: [mongoose.Schema.Types.Mixed], default: [] },
    topicExerciseCount: { type: Number, min: 0, default: 0 },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

learningModuleVersionSchema.index({ moduleId: 1, version: 1 }, { unique: true });

export default mongoose.model("LearningModuleVersion", learningModuleVersionSchema);
