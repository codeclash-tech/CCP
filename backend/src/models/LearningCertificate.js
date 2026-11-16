import mongoose from "mongoose";

const learningCertificateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningProgram", required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", required: true },
    earnedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

learningCertificateSchema.index({ userId: 1, moduleId: 1 }, { unique: true });

export default mongoose.model("LearningCertificate", learningCertificateSchema);
