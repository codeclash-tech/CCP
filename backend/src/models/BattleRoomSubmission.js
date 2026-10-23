import mongoose from "mongoose";
import {
  getVisibleExecutionOutput,
  sanitizeParticipantExecutionError,
  sanitizeParticipantTestResult,
} from "../services/participantExecutionSerialization.js";

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
    revision: {
      type: Number,
      default: 0,
      min: 0,
    },
    executionGrantNonce: {
      type: String,
      default: null,
      select: false,
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
        "SECURITY_VIOLATION",
        "INTERNAL_ENGINE_ERROR",
        "OUTPUT_LIMIT_EXCEEDED",
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
            "SECURITY_VIOLATION",
            "INTERNAL_ENGINE_ERROR",
            "OUTPUT_LIMIT_EXCEEDED",
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

battleRoomSubmissionSchema.methods.toPublicJSON = function ({
  visibleTestCaseCounts = {},
} = {}) {
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
    questionResults: this.questionResults.map((qr) => {
      const visibleTestCaseCount =
        visibleTestCaseCounts[qr.questionId?.toString()];
      const results = (qr.results || []).map((result, index) => {
        const resultData =
          typeof result.toObject === "function" ? result.toObject() : result;
        return sanitizeParticipantTestResult({
          ...resultData,
          isHidden: Number.isInteger(visibleTestCaseCount)
            ? index >= visibleTestCaseCount
            : true,
        });
      });
      return {
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
        output: getVisibleExecutionOutput(results),
        error: sanitizeParticipantExecutionError(qr.status, qr.error),
        results,
      };
    }),
    codingBehavior: this.codingBehavior,
  };
};

export default mongoose.model("BattleRoomSubmission", battleRoomSubmissionSchema);
