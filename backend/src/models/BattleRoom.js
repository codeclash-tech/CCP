import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    explanation: {
      type: String,
      default: "",
    },
    constraints: {
      type: String,
      default: "",
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
    tags: {
      type: [String],
      default: [],
    },
    examples: [
      {
        input: String,
        output: String,
        explanation: String,
        _id: false,
      },
    ],
    hints: {
      type: [String],
      default: [],
    },
    // Structured signature metadata (single source of truth).
    // { name: string, returnType: string, params: [{name, type}] }
    signature: {
      type: Object,
      default: null,
    },
    starterCode: {
      type: String,
      default: `function solution(input) {\n  // Write your code here\n  return input;\n}`,
    },
    starterCodeByLanguage: {
      type: Map,
      of: String,
      default: {},
    },
    visibleTestCases: [
      {
        input: { type: String, required: true },
        expectedOutput: { type: String, required: true },
        description: { type: String, default: "" },
        // Per-parameter values typed by the author in the parameter-based
        // workflow. Kept internally; never exposed to participants.
        parameterValues: { type: Object, default: null },
        _id: false,
      },
    ],
    hiddenTestCases: [
      {
        input: { type: String, required: true },
        expectedOutput: { type: String, required: true },
        parameterValues: { type: Object, default: null },
        _id: false,
      },
    ],
    points: {
      type: Number,
      default: 100,
    },
    // ---- Production authoring fields (all optional / backward compatible) ----
    problemType: {
      type: String,
      enum: [
        "array", "string", "linked-list", "tree", "graph", "matrix",
        "dynamic-programming", "greedy", "stack", "queue", "binary-search",
        "math", "bit-manipulation", "custom",
      ],
      default: "array",
    },
    functionSignature: {
      type: String,
      default: "",
    },
    functionName: {
      type: String,
      default: "",
    },
    expectedOutputSource: {
      type: String,
      enum: ["manual", "reference"],
      default: "manual",
    },
    referenceSolution: {
      type: String,
      default: "",
      private: true,
    },
    referenceSolutionLanguage: {
      type: String,
      default: "java",
      enum: ["java"],
    },
    wrapperByLanguage: {
      type: Map,
      of: String,
      default: {},
    },
  },
  { _id: true }
);

const battleRoomSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      length: 6,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    questions: [questionSchema],
    languages: {
      type: [String],
      enum: ["java"],
      default: ["java"],
    },
    timeLimit: {
      type: Number,
      required: true,
      min: 1,
      max: 2000,
      default: 60,
    },
    timeLimitUnit: {
      type: String,
      enum: ["minutes", "hours", "days", "weeks"],
      default: "minutes",
    },
    status: {
      type: String,
      enum: ["UPCOMING", "ACTIVE", "CLOSED"],
      default: "UPCOMING",
      index: true,
    },
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
      index: true,
    },
    isScheduled: {
      type: Boolean,
      default: false,
    },
    participants: {
      type: [String],
      default: [],
    },
    timezone: {
      type: String,
      default: "UTC",
    },
    scheduledDate: { type: String, default: "" },
    scheduledStartTime: { type: String, default: "" },
    scheduledEndTime: { type: String, default: "" },
    maxParticipants: {
      type: Number,
      default: 100,
    },
    moderationAction: {
      type: String,
      enum: ["FLAG", "DISQUALIFY"],
      default: "FLAG",
    },
    allowLeaderboard: {
      type: Boolean,
      default: true,
    },
    allowReuse: {
      type: Boolean,
      default: true,
    },
    participantCount: {
      type: Number,
      default: 0,
    },
    resultEmailsAttemptedAt: {
      type: Date,
      default: null,
    },
    resultEmailsCompletedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Soft delete support
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // Auto-expiry after 1 year of inactivity
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

battleRoomSchema.index({ roomCode: 1, isActive: 1, isDeleted: 1 });
battleRoomSchema.index({ status: 1, endTime: 1 });
battleRoomSchema.index({ startTime: 1, endTime: 1 });
battleRoomSchema.index({ status: 1, endDate: 1 });

battleRoomSchema.methods.computeCurrentStatus = function () {
  if (this.isDeleted) return "CLOSED";
  if (this.status === "CLOSED") return "CLOSED";
  const now = new Date();
  const start = this.startDate || this.startTime;
  const end = this.endDate || this.endTime;
  if (start && now < start) return "UPCOMING";
  if (end && now >= end) return "CLOSED";
  if (
    start &&
    now >= start &&
    (!end || now < end)
  ) {
    return "ACTIVE";
  }
  return this.status || "UPCOMING";
};

battleRoomSchema.methods.getDurationMinutes = function () {
  const unitMultiplier = {
    minutes: 1,
    hours: 60,
    days: 24 * 60,
    weeks: 7 * 24 * 60,
  };
  return (this.timeLimit || 60) * (unitMultiplier[this.timeLimitUnit] || 1);
};

function publicQuestionJSON(q) {
  return {
    _id: q._id,
    title: q.title,
    description: q.description,
    explanation: q.explanation,
    constraints: q.constraints,
    difficulty: q.difficulty,
    category: q.category || "Custom",
    tags: q.tags || [],
    examples: q.examples || [],
    hints: q.hints || [],
    signature: q.signature,
    starterCode: q.starterCode,
    starterCodeByLanguage: q.starterCodeByLanguage || {},
    hiddenTestCases: undefined,
    points: q.points,
  };
}

/**
 * Serializer used by the room creator. Includes hidden test cases and the
 * per-parameter authoring values so the creator can review/edit them.
 * Expected outputs are still internal (kept from edit UI but present for
 * judging).
 */
function creatorQuestionJSON(q) {
  return {
    _id: q._id,
    title: q.title,
    description: q.description,
    explanation: q.explanation,
    constraints: q.constraints,
    difficulty: q.difficulty,
    category: q.category || "Custom",
    tags: q.tags || [],
    examples: q.examples || [],
    hints: q.hints || [],
    signature: q.signature,
    starterCode: q.starterCode,
    starterCodeByLanguage: q.starterCodeByLanguage || {},
    visibleTestCases: q.visibleTestCases || [],
    hiddenTestCases: q.hiddenTestCases || [],
    points: q.points,
    problemType: q.problemType || "array",
    functionSignature: q.functionSignature || "",
    functionName: q.functionName || "",
    expectedOutputSource: q.expectedOutputSource || "reference",
    referenceSolution: q.referenceSolution || "",
    referenceSolutionLanguage: "java",
  };
}

/**
 * Serializer for the edit flow. Full authoring fidelity: the reference
 * solution, wrappers, parameter values and expected outputs are returned so
 * the creator can reload and re-validate before saving. Expected outputs are
 * still not surfaced in the UI — the edit form keeps them hidden but stores
 * them during re-save.
 */
battleRoomSchema.methods.toEditJSON = function () {
  return {
    id: this._id,
    roomCode: this.roomCode,
    title: this.title,
    description: this.description,
    createdBy: this.createdBy,
    questions: this.questions.map((q) => ({
      _id: q._id,
      title: q.title,
      description: q.description,
      explanation: q.explanation,
      constraints: q.constraints,
      difficulty: q.difficulty,
      category: q.category || "Custom",
      tags: q.tags || [],
      examples: q.examples || [],
      hints: q.hints || [],
      signature: q.signature,
      signatureInput: q.signature
        ? {
            name: q.signature.name,
            returnType: q.signature.returnType,
            parameters: (q.signature.params || []).map((p) => ({ name: p.name, type: p.type })),
          }
        : null,
      starterCode: q.starterCode,
      starterCodeByLanguage: q.starterCodeByLanguage || {},
      visibleTestCases: q.visibleTestCases || [],
      hiddenTestCases: q.hiddenTestCases || [],
      points: q.points,
      problemType: q.problemType || "array",
      functionSignature: q.functionSignature || "",
      functionName: q.functionName || "",
      expectedOutputSource: q.expectedOutputSource || "reference",
      referenceSolution: q.referenceSolution || "",
      referenceSolutionLanguage: "java",
      wrapperByLanguage: q.wrapperByLanguage || {},
    })),
    languages: ["java"],
    timeLimit: this.timeLimit,
    timeLimitUnit: this.timeLimitUnit,
    status: this.status,
    startDate: this.startDate || this.startTime,
    endDate: this.endDate || this.endTime,
    startTime: this.startTime,
    endTime: this.endTime,
    participantCount: this.participantCount,
    maxParticipants: this.maxParticipants,
    expiresAt: this.expiresAt,
    createdAt: this.createdAt,
  };
};

battleRoomSchema.methods.toPublicJSON = function () {
  const currentStatus = this.computeCurrentStatus ? this.computeCurrentStatus() : this.status;
  return {
    id: this._id,
    roomCode: this.roomCode,
    title: this.title,
    description: this.description,
    createdBy: this.createdBy,
    questions: this.questions.map(publicQuestionJSON),
    languages: ["java"],
    timeLimit: this.timeLimit,
    timeLimitUnit: this.timeLimitUnit,
    status: currentStatus,
    startDate: this.startDate || this.startTime,
    endDate: this.endDate || this.endTime,
    startTime: this.startTime,
    endTime: this.endTime,
    closedAt: this.closedAt,
    timezone: this.timezone || "UTC",
    scheduledDate: this.scheduledDate,
    scheduledStartTime: this.scheduledStartTime,
    scheduledEndTime: this.scheduledEndTime,
    participantCount: this.participantCount,
    maxParticipants: this.maxParticipants,
    createdAt: this.createdAt,
  };
};

battleRoomSchema.methods.toCreatorJSON = function () {
  return {
    ...this.toPublicJSON(),
    questions: this.questions.map(creatorQuestionJSON),
    expiresAt: this.expiresAt,
  };
};

battleRoomSchema.methods.toLeaderboardJSON = function () {
  const currentStatus = this.computeCurrentStatus ? this.computeCurrentStatus() : this.status;
  return {
    id: this._id,
    roomCode: this.roomCode,
    title: this.title,
    timeLimit: this.timeLimit,
    timeLimitUnit: this.timeLimitUnit,
    status: currentStatus,
    startDate: this.startDate || this.startTime,
    endDate: this.endDate || this.endTime,
    startTime: this.startTime,
    endTime: this.endTime,
    closedAt: this.closedAt,
    timezone: this.timezone || "UTC",
    participantCount: this.participantCount,
    questionCount: this.questions.length,
    languages: ["java"],
  };
};

export default mongoose.model("BattleRoom", battleRoomSchema);
