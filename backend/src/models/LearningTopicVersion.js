import mongoose from "mongoose";

const learningTopicVersionSchema = new mongoose.Schema(
  {
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", required: true },
    moduleVersion: { type: Number, required: true, min: 1 },
    topicId: { type: mongoose.Schema.Types.ObjectId, required: true },
    topicSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

learningTopicVersionSchema.index(
  { moduleId: 1, moduleVersion: 1, topicId: 1 },
  { unique: true },
);

export default mongoose.model("LearningTopicVersion", learningTopicVersionSchema);
