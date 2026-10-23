import mongoose from "mongoose";

const weeklySubmissionSchema = new mongoose.Schema(
  {
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: "WeeklyCycle", required: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rosterEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "WeeklyRosterEntry", required: true },
    dayIndex: { type: Number, required: true, min: 0, max: 0 },
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true },
    sourceHash: { type: String, required: true, select: false },
    status: { type: String, enum: ["JUDGING", "RETRYABLE", "FINALIZED"], required: true, default: "JUDGING" },
    resultStatus: { type: String, default: "" },
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
