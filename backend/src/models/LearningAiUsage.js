import mongoose from "mongoose";

const learningAiUsageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningSession", required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    responseTimeMs: { type: Number, min: 0, default: 0 },
    succeeded: { type: Boolean, required: true },
  },
  { timestamps: true },
);

learningAiUsageSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("LearningAiUsage", learningAiUsageSchema);
