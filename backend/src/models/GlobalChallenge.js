import mongoose from "mongoose";

const draftConfigurationSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 160, default: "" },
    timezone: {
      type: String,
      enum: ["Asia/Kolkata"],
      default: "Asia/Kolkata",
    },
    startAt: { type: Date, default: null },
    questionIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Challenge" }],
      default: [],
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const globalChallengeSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "global",
      immutable: true,
    },
    name: { type: String, trim: true, maxlength: 160 },
    timezone: {
      type: String,
      required: true,
      enum: ["Asia/Kolkata"],
      default: "Asia/Kolkata",
    },
    startAt: { type: Date, default: null },
    questionIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Challenge" }],
      default: [],
    },
    draft: { type: draftConfigurationSchema, default: null },
    status: {
      type: String,
      enum: ["DRAFT", "SCHEDULED", "ACTIVE", "COMPLETED"],
      default: null,
    },
    lastScheduledCycleKey: { type: String, default: null },
    activeQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challenge",
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("GlobalChallenge", globalChallengeSchema);
