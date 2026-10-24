import mongoose from "mongoose";

const globalChallengeSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "global",
      immutable: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    timezone: {
      type: String,
      required: true,
      enum: ["Asia/Kolkata"],
      default: "Asia/Kolkata",
    },
    startAt: { type: Date, required: true },
    questionIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Challenge" }],
      required: true,
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
