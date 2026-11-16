import mongoose from "mongoose";

const learningPurchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningProgram", default: null },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, default: "INR", maxlength: 3 },
    status: { type: String, enum: ["PENDING", "ACTIVE", "REJECTED", "REVOKED"], default: "PENDING", index: true },
    requestedAt: { type: Date, default: Date.now },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

learningPurchaseSchema.index({ userId: 1, status: 1, programId: 1, moduleId: 1 });
learningPurchaseSchema.index({ status: 1, requestedAt: -1 });

export default mongoose.model("LearningPurchase", learningPurchaseSchema);
