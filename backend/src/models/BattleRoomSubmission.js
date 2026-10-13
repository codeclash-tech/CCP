import mongoose from "mongoose";

const questionResultSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    questionTitle: {
      type: String,
      default: "",
    },
    code: {
      type: String,
      default: "",
    },
    language: {
      type: String,
      default: "java",
      enum: ["java"],
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "ACCEPTED",
        "WRONG_ANSWER",
        "COMPILATION_ERROR",
        "RUNTIME_ERROR",
        "TIME_LIMIT_EXCEEDED",
        "MEMORY_LIMIT_EXCEEDED",
        "SYSTEM_ERROR",
        "REJECTED",
        "ERROR",
      ],
      default: "PENDING",
    },
    score: {
      type: Number,
      default: 0,
    },
    passed: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
    executionTime: {
      type: Number,
      default: 0,
    },
    memoryUsed: {
      type: Number,
      default: 0,
    },
    timeToSolve: {
      type: Number,
      default: 0,
    },
    output: {
      type: String,
      default: "",
    },
    error: {
      type: String,
      default: "",
    },
    results: [
      {
        testCaseId: { type: String },
        testCase: { type: Number },
        status: {
          type: String,
          enum: [
            "PASSED", "ACCEPTED",
            "FAILED",
            "ERROR",
            "PENDING",
            "SYSTEM_ERROR",
            "WRONG_ANSWER",
            "COMPILE_ERROR",
            "COMPILATION_ERROR",
            "RUNTIME_ERROR",
            "TIME_LIMIT_EXCEEDED",
            "MEMORY_LIMIT_EXCEEDED",
          ],
        },
        executionTime: { type: Number, default: 0 },
        memoryUsed: { type: Number, default: 0 },
        input: { type: String, default: "" },
        output: { type: String, default: "" },
        expectedOutput: { type: String, default: "" },
        error: { type: String, default: "" },
        isHidden: { type: Boolean, default: false },
        _id: false,
      },
    ],
  },
  { _id: false }
);

const battleRoomSubmissionSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BattleRoom",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    participantEmail: { type: String, trim: true, lowercase: true, default: "" },
    participantName: { type: String, default: "Participant", trim: true },
    participantOrganization: { type: String, default: "Unspecified", trim: true },
    questionResults: [questionResultSchema],
    totalScore: {
      type: Number,
      default: 0,
    },
    totalPassed: {
      type: Number,
      default: 0,
    },
    totalFailed: {
      type: Number,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "DISQUALIFIED"],
      default: "PENDING",
    },
    resultDelivery: {
      status: {
        type: String,
        enum: ["PENDING", "SENDING", "SENT", "FAILED", "SKIPPED"],
        default: "PENDING",
      },
      attempts: { type: Number, default: 0 },
      attemptedAt: { type: Date, default: null },
      sentAt: { type: Date, default: null },
      error: { type: String, default: "" },
    },
    certificateSnapshot: {
      roomCode: { type: String, default: "" },
      roomTitle: { type: String, default: "" },
      rank: { type: Number, default: 0 },
      totalParticipants: { type: Number, default: 0 },
      completedAt: { type: Date, default: null },
    },
    disqualifyReason: {
      type: String,
      default: null,
    },
    moderationFlags: {
      type: [{ reason: String, code: String, language: String, createdAt: Date }],
      default: [],
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    // Coding behavior analytics
    codingBehavior: {
      totalLinesWritten: { type: Number, default: 0 },
      totalEdits: { type: Number, default: 0 },
      timePerQuestion: { type: Number, default: 0 }, // avg seconds per question
      editFrequency: { type: Number, default: 0 }, // edits per minute
      completedEarly: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

battleRoomSubmissionSchema.index({ roomId: 1, userId: 1 }, { unique: true });
battleRoomSubmissionSchema.index({ roomId: 1, totalScore: -1 });
battleRoomSubmissionSchema.index({ userId: 1 });
battleRoomSubmissionSchema.index({ userId: 1, "certificateSnapshot.roomCode": 1 });

battleRoomSubmissionSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    roomId: this.roomId,
    userId: this.userId,
    participantName: this.participantName,
    participantOrganization: this.participantOrganization,
    totalScore: this.totalScore,
    totalPassed: this.totalPassed,
    totalFailed: this.totalFailed,
    totalQuestions: this.totalQuestions,
    status: this.status,
    disqualifyReason: this.disqualifyReason,
    moderationFlags: this.moderationFlags || [],
    startTime: this.startTime,
    submittedAt: this.submittedAt,
    questionResults: this.questionResults.map((qr) => ({
      questionId: qr.questionId,
      questionTitle: qr.questionTitle,
      code: qr.code || "",
      status: qr.status,
      score: qr.score,
      passed: qr.passed,
      failed: qr.failed,
      total: qr.total,
      executionTime: qr.executionTime,
      memoryUsed: qr.memoryUsed,
      timeToSolve: qr.timeToSolve,
      output: qr.output,
      error: qr.error,
      results: qr.results || [],
    })),
    codingBehavior: this.codingBehavior,
  };
};

export default mongoose.model("BattleRoomSubmission", battleRoomSubmissionSchema);
