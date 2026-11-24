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
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningModule", default: null },
    // Course-level certificates carry courseId and a null moduleId.
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "LearningProgram", default: null, index: true },
    moduleVersion: { type: Number, min: 1, default: 1 },
    kind: { type: String, enum: ["MODULE", "COURSE"], default: "MODULE", index: true },
    earnedAt: { type: Date, default: Date.now },
    completionEmail: { type: certificateEmailSchema, default: () => ({}) },
  },
  { timestamps: true },
);

learningCertificateSchema.index(
  { userId: 1, moduleId: 1 },
  {
    unique: true,
    partialFilterExpression: { moduleId: { $type: "objectId" } },
  },
);
learningCertificateSchema.index(
  { userId: 1, courseId: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: "COURSE" },
  },
);

export default mongoose.model("LearningCertificate", learningCertificateSchema);
