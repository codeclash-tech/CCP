import mongoose from "mongoose";

function toPlainObjectMap(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value));
  return {};
}

const testCaseSchema = new mongoose.Schema(
  {
    input: {
      type: String,
      required: true,
    },
    expectedOutput: {
      type: String,
      required: true,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const challengeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["EASY", "MEDIUM", "HARD"],
      default: "MEDIUM",
    },
    category: {
      type: String,
      default: "Custom",
    },
    examples: [
      {
        input: String,
        output: String,
        explanation: String,
        _id: false,
      },
    ],
    constraints: {
      type: String,
      default: "",
    },
    // Structured signature metadata (single source of truth).
    // { name: string, returnType: string, params: [{name, type}] }
    signature: {
      type: Object,
      default: null,
    },
    functionSignatures: {
      type: Map,
      of: String,
      default: {},
    },
    starterCodes: {
      type: Map,
      of: String,
      default: {},
    },
    referenceSolutions: {
      type: Map,
      of: String,
      default: {},
    },
    visibleTestCases: [testCaseSchema],
    hiddenTestCases: [testCaseSchema],
    testCases: [testCaseSchema],
    activeDate: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    totalSubmissions: {
      type: Number,
      default: 0,
    },
    totalAccepted: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

challengeSchema.index({ activeDate: -1, isActive: 1 });

challengeSchema.methods.toAdminJSON = function () {
  return {
    id: this._id,
    title: this.title,
    slug: this.slug,
    description: this.description,
    difficulty: this.difficulty,
    category: this.category,
    examples: this.examples,
    constraints: this.constraints,
    signature: this.signature,
    functionSignatures: toPlainObjectMap(this.functionSignatures),
    starterCodes: toPlainObjectMap(this.starterCodes),
    referenceSolutions: toPlainObjectMap(this.referenceSolutions),
    visibleTestCases: this.visibleTestCases?.length
      ? this.visibleTestCases
      : this.testCases || [],
    hiddenTestCases: this.hiddenTestCases || [],
    testCases: this.testCases?.length
      ? this.testCases
      : this.visibleTestCases || [],
    activeDate: this.activeDate,
    isActive: this.isActive,
    totalSubmissions: this.totalSubmissions,
    totalAccepted: this.totalAccepted,
    createdAt: this.createdAt,
  };
};

challengeSchema.methods.toUserJSON = function () {
  return {
    id: this._id,
    title: this.title,
    description: this.description,
    difficulty: this.difficulty,
    category: this.category,
    examples: this.examples,
    constraints: this.constraints,
    signature: this.signature,
    functionSignatures: toPlainObjectMap(this.functionSignatures),
    starterCodes: toPlainObjectMap(this.starterCodes),
    visibleTestCases: (
      this.visibleTestCases?.length
        ? this.visibleTestCases
        : this.testCases || []
    ).filter((testCase) => !testCase.isHidden),
    activeDate: this.activeDate,
    totalSubmissions: this.totalSubmissions,
    totalAccepted: this.totalAccepted,
  };
};

export default mongoose.model("Challenge", challengeSchema);
