import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema(
  {
    dayIndex: { type: Number, required: true, min: 0, max: 0 },
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true },
    questionTitleSnapshot: { type: String, required: true },
    questionSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const individualRankingSchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    candidateNameSnapshot: { type: String, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "OrganizationProfile", default: null },
    organizationNameSnapshot: { type: String, default: "" },
    score: { type: Number, required: true },
    completedQuestions: { type: Number, required: true },
    status: { type: String, enum: ["PARTICIPATED", "MISSED", "DISQUALIFIED"], required: true },
    lastSubmittedAt: { type: Date, default: null },
  },
  { _id: false },
);

const organizationRankingSchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "OrganizationProfile", required: true },
    organizationNameSnapshot: { type: String, required: true },
    eligibleCandidates: { type: Number, required: true },
    completedEligibleCandidates: { type: Number, required: true },
    participatingEligibleCandidates: { type: Number, required: true },
    organizationMean: { type: Number, required: true },
    cycleMean: { type: Number, required: true },
    shrinkageK: { type: Number, required: true, default: 5 },
    finalScore: { type: Number, required: true },
    completionRate: { type: Number, required: true },
  },
  { _id: false },
);

const weeklyCycleSchema = new mongoose.Schema(
  {
    cycleKey: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    isGlobalChallenge: { type: Boolean, default: false, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    timezone: { type: String, required: true, enum: ["Asia/Kolkata"], default: "Asia/Kolkata" },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    recoveryUntilAt: { type: Date, default: null },
    status: { type: String, enum: ["SCHEDULED", "ACTIVE", "ROSTER_MISSED", "FINALIZING", "FINALIZED"], default: "SCHEDULED", index: true },
    questionAssignments: {
      type: [assignmentSchema],
      validate: [(assignments) => assignments.length === 1, "Exactly one question is required for each daily challenge."],
      required: true,
    },
    shrinkageK: { type: Number, required: true, default: 5, immutable: true },
    rosterFrozenAt: { type: Date, default: null },
    finalizedAt: { type: Date, default: null },
    certificatesIssuedAt: { type: Date, default: null },
    individualRankings: { type: [individualRankingSchema], default: [] },
    organizationRankings: { type: [organizationRankingSchema], default: [] },
  },
  { timestamps: true },
);

weeklyCycleSchema.index({ startAt: 1, endAt: 1 });

export default mongoose.model("WeeklyCycle", weeklyCycleSchema);
