import mongoose from "mongoose";

const organizationMembershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "OrganizationProfile", required: true, index: true },
    status: { type: String, enum: ["ACTIVE", "ENDED"], required: true, default: "ACTIVE" },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, autoIndex: false },
);

organizationMembershipSchema.index(
  { userId: 1 },
  {
    name: "active_user_membership_unique",
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
  },
);
organizationMembershipSchema.index({ organizationId: 1, validFrom: 1, validTo: 1 });
organizationMembershipSchema.index({ userId: 1, validFrom: 1, validTo: 1 });
organizationMembershipSchema.index({ validFrom: 1, validTo: 1 });

export default mongoose.model("OrganizationMembership", organizationMembershipSchema);
