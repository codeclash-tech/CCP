import mongoose from "mongoose";

const weeklySubmissionSchema = new mongoose.Schema(
  {
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: "WeeklyCycle", required: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rosterEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "WeeklyRosterEntry", required: true },
    dayIndex: { type: Number, required: true, min: 0, max: 0 },
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true },
    sourceHash: { type: String, required: true, select: false },
    sourceCode: { type: String, required: true, select: false },
    executionId: { type: String, default: "", index: true },
    executionMode: {
      type: String,
      enum: ["SERVER_VERIFIED", "DESKTOP_LOCAL"],
      default: "SERVER_VERIFIED",
    },
    transcriptHash: { type: String, default: "" },
    clientVersion: { type: String, default: "" },
    engineVersion: { type: String, default: "" },
    executionProtocolVersion: { type: Number, default: 0 },
    riskSignals: { type: [String], default: [] },
    riskScore: { type: Number, min: 0, max: 100, default: 0 },
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "LOW",
    },
    executionTranscript: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
    status: {
      type: String,
      enum: [
        "PENDING_VERIFICATION",
        "VERIFYING",
        "JUDGING",
        "AUTHORIZED",
        "RETRYABLE",
        "FINALIZED",
      ],
      required: true,
      default: "PENDING_VERIFICATION",
    },
    resultStatus: { type: String, default: "" },
    verificationAttempts: { type: Number, default: 0 },
    verificationStartedAt: { type: Date, default: null },
    verificationCompletedAt: { type: Date, default: null },
    verificationError: { type: String, default: "" },
    score: { type: Number, default: 0 },
    passed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    executionTime: { type: Number, default: 0 },
    finalizedAt: { type: Date, default: null },
    judgeLeaseAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

weeklySubmissionSchema.index(
  { cycleId: 1, candidateId: 1, dayIndex: 1 },
  { unique: true },
);
weeklySubmissionSchema.index({ cycleId: 1, candidateId: 1 });
weeklySubmissionSchema.index({ cycleId: 1, status: 1, judgeLeaseAt: 1 });

export default mongoose.model("WeeklySubmission", weeklySubmissionSchema);
