import mongoose from "mongoose";

const weeklyRosterEntrySchema = new mongoose.Schema(
  {
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: "WeeklyCycle", required: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    candidateNameSnapshot: { type: String, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "OrganizationProfile", default: null },
    organizationNameSnapshot: { type: String, default: "" },
    eligibilityStatus: { type: String, enum: ["ELIGIBLE"], required: true, default: "ELIGIBLE" },
    participationStatus: { type: String, enum: ["NOT_STARTED", "PARTICIPATED", "DISQUALIFIED"], required: true, default: "NOT_STARTED" },
    score: { type: Number, required: true, default: 0 },
    executionTime: { type: Number, min: 0, default: 0 },
    memoryUsed: { type: Number, min: 0, default: 0 },
    completedDays: { type: [Number], default: [] },
    passedTestCases: { type: Number, min: 0, default: 0 },
    totalTestCases: { type: Number, min: 0, default: 0 },
    resultFinalizedAt: { type: Date, default: null },
    lastSubmittedAt: { type: Date, default: null },
    disqualifiedAt: { type: Date, default: null },
    disqualificationReason: { type: String, default: "" },
  },
  { timestamps: true },
);

weeklyRosterEntrySchema.index({ cycleId: 1, candidateId: 1 }, { unique: true });
weeklyRosterEntrySchema.index({ cycleId: 1, organizationId: 1 });

export default mongoose.model("WeeklyRosterEntry", weeklyRosterEntrySchema);
