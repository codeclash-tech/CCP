import mongoose from "mongoose";

const certificateEmailSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ["PENDING", "SENDING", "SENT", "FAILED"], default: "PENDING" },
    attemptedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    attempts: { type: Number, min: 0, default: 0 },
    error: { type: String, maxlength: 500, default: "" },
  },
  { _id: false },
);

const learningCertificateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningProgram", required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", required: true },
    moduleVersion: { type: Number, min: 1, default: 1 },
    earnedAt: { type: Date, default: Date.now },
    completionEmail: { type: certificateEmailSchema, default: () => ({}) },
  },
  { timestamps: true },
);

learningCertificateSchema.index({ userId: 1, moduleId: 1 }, { unique: true });

export default mongoose.model("LearningCertificate", learningCertificateSchema);
