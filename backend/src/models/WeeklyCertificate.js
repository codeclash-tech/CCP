import mongoose from "mongoose";

const weeklyCertificateSchema = new mongoose.Schema(
  {
    certificateId: { type: String, required: true, unique: true },
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: "WeeklyCycle", required: true, index: true },
    type: { type: String, enum: ["INDIVIDUAL", "ORGANIZATION"], required: true },
    category: { type: String, enum: ["WINNER", "RUNNER_UP", "SECOND_RUNNER_UP", "PARTICIPATION", "ORGANIZATION_WINNER", "ORGANIZATION_RUNNER_UP", "ORGANIZATION_SECOND_RUNNER_UP"], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "OrganizationProfile", default: null, index: true },
    snapshot: {
      subjectName: { type: String, required: true },
      organizationName: { type: String, default: "" },
      assessmentName: { type: String, required: true },
      cycleKey: { type: String, required: true },
      score: { type: Number, required: true },
      rank: { type: Number, default: null },
      issuedAt: { type: Date, required: true },
    },
  },
  { timestamps: true },
);

weeklyCertificateSchema.index({ cycleId: 1, userId: 1, type: 1 }, { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } });
weeklyCertificateSchema.index({ cycleId: 1, organizationId: 1, type: 1 }, { unique: true, partialFilterExpression: { organizationId: { $type: "objectId" } } });
weeklyCertificateSchema.index({ userId: 1, "snapshot.issuedAt": -1 });
weeklyCertificateSchema.index({ organizationId: 1, "snapshot.issuedAt": -1 });

export default mongoose.model("WeeklyCertificate", weeklyCertificateSchema);
