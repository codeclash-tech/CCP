import mongoose from "mongoose";

const learningProgramSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    language: { type: String, trim: true, lowercase: true, maxlength: 40, default: "" },
    shortDescription: { type: String, trim: true, maxlength: 300, default: "" },
    category: { type: String, trim: true, maxlength: 100, default: "" },
    difficulty: { type: String, enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"], default: "BEGINNER" },
    technologies: { type: [String], default: [] },
    features: { type: [String], default: [] },
    prerequisites: { type: [String], default: [] },
    learningOutcomes: { type: [String], default: [] },
    thumbnailUrl: { type: String, trim: true, maxlength: 2000, default: "" },
    displayOrder: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["DRAFT", "PUBLISHED"], default: "DRAFT", index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

learningProgramSchema.index({ status: 1, deletedAt: 1, displayOrder: 1, updatedAt: -1 });

export default mongoose.model("LearningProgram", learningProgramSchema);
