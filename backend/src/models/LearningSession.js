import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

const messageSchema = new mongoose.Schema(
  {
    messageId: { type: String, default: randomUUID, maxlength: 100 },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const learningSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", required: true },
    moduleVersion: { type: Number, min: 1, default: 1 },
    topicId: { type: mongoose.Schema.Types.ObjectId, required: true },
    language: { type: String, enum: ["en", "ta"], default: "en" },
    learningStage: {
      type: String,
      enum: [
        "TEACHING",
        "TEACHING_CLARIFICATION",
        "OBJECTIVE_VERIFICATION",
        "VERIFICATION_HINT",
        "OBJECTIVE_MASTERED",
        "TOPIC_COMPLETED",
      ],
      default: "TEACHING",
    },
    currentObjectiveKey: { type: String, maxlength: 100, default: "" },
    awaitingTeachingIntroduction: { type: Boolean, default: true },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true },
);

learningSessionSchema.index({ userId: 1, moduleId: 1, topicId: 1, updatedAt: -1 });

export default mongoose.model("LearningSession", learningSessionSchema);
