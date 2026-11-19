import mongoose from "mongoose";

const learningPurchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningProgram", default: null },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", default: null },
    moduleVersion: { type: Number, min: 1, default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, default: "INR", maxlength: 3 },
    status: { type: String, enum: ["PENDING", "ACTIVE", "EXPIRED", "FAILED", "REFUNDED", "REJECTED", "REVOKED"], default: "PENDING", index: true },
    paymentProvider: { type: String, enum: ["RAZORPAY", "MANUAL", "FREE"], default: "RAZORPAY" },
    paymentOrderId: { type: String, trim: true, default: null },
    paymentId: { type: String, trim: true, default: null },
    paymentStatus: { type: String, enum: ["CREATED", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "FREE"], default: "CREATED" },
    requestedAt: { type: Date, default: Date.now },
    accessDurationDays: { type: Number, min: 1, max: 36500, default: null },
    accessStartedAt: { type: Date, default: null },
    accessExpiresAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, autoIndex: false },
);

learningPurchaseSchema.index(
  { userId: 1, moduleId: 1 },
  {
    name: "unique_live_user_module_purchase",
    unique: true,
    partialFilterExpression: {
      moduleId: { $type: "objectId" },
      status: { $in: ["PENDING", "ACTIVE"] },
    },
  },
);
learningPurchaseSchema.index({ userId: 1, status: 1, programId: 1, moduleId: 1 });
learningPurchaseSchema.index({ status: 1, requestedAt: -1 });

export default mongoose.model("LearningPurchase", learningPurchaseSchema);
