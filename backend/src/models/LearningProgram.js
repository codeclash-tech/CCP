import mongoose from "mongoose";

const learningProgramSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    language: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
    price: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, enum: ["DRAFT", "PUBLISHED"], default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

learningProgramSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model("LearningProgram", learningProgramSchema);
