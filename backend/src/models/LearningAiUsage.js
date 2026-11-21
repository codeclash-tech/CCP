import mongoose from "mongoose";

const learningAiUsageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningSession", default: null },
    operation: {
      type: String,
      enum: ["TUTOR", "TOPIC_PROPOSAL", "TASK_EVALUATION", "TUTOR_PREVIEW"],
      default: "TUTOR",
    },
    objectiveKey: { type: String, trim: true, maxlength: 100, default: "" },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    promptTokens: { type: Number, min: 0, default: null },
    completionTokens: { type: Number, min: 0, default: null },
    totalTokens: { type: Number, min: 0, default: null },
    responseTimeMs: { type: Number, min: 0, default: 0 },
    succeeded: { type: Boolean, required: true },
  },
  { timestamps: true },
);

learningAiUsageSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("LearningAiUsage", learningAiUsageSchema);
