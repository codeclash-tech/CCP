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
    executionId: { type: String, default: "", index: true },
    sourceHash: { type: String, default: "" },
    executionMode: {
      type: String,
      enum: ["SERVER_VERIFIED", "DESKTOP_LOCAL"],
      default: "SERVER_VERIFIED",
    },
    transcriptHash: { type: String, default: "" },
    clientVersion: { type: String, default: "" },
    engineVersion: { type: String, default: "" },
    executionProtocolVersion: { type: Number, default: 0 },
    riskSignals: { type: [String], default: [] },
    riskScore: { type: Number, min: 0, max: 100, default: 0 },
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "LOW",
    },
    executionTranscript: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
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
    verificationStatus: {
      type: String,
      enum: ["PENDING_VERIFICATION", "VERIFYING", "VERIFIED", "FAILED", "ERROR"],
      default: null,
    },
    verificationSubmittedAt: {
      type: Date,
      default: null,
    },
    verificationStartedAt: {
      type: Date,
      default: null,
    },
    verificationCompletedAt: {
      type: Date,
      default: null,
    },
    verificationLeaseExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    verificationLeaseId: {
      type: String,
      default: null,
      select: false,
    },
    verificationAttempts: {
      type: Number,
      default: 0,
    },
    verificationError: {
      type: String,
      default: "",
    },
    verificationTestCases: {
      type: [
        {
          testCaseId: { type: String, default: "" },
          input: { type: String, required: true },
          expectedOutput: { type: String, required: true },
          isHidden: { type: Boolean, default: false },
          _id: false,
        },
      ],
      default: [],
      select: false,
    },
    verificationSignature: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
    verificationPoints: {
      type: Number,
      default: 0,
      select: false,
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
    completionEmail: {
      eligible: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ["PENDING", "SENDING", "SENT", "FAILED"],
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
      totalTestCases: { type: Number, min: 0, default: 0 },
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
    endRequestedAt: {
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
    totalScore:
      this.status === "COMPLETED" || this.status === "DISQUALIFIED"
        ? this.totalScore
        : null,
    totalPassed:
      this.status === "COMPLETED" || this.status === "DISQUALIFIED"
        ? this.totalPassed
        : null,
    totalFailed:
      this.status === "COMPLETED" || this.status === "DISQUALIFIED"
        ? this.totalFailed
        : null,
    totalQuestions: this.totalQuestions,
    status: this.status,
    endRequestedAt: this.endRequestedAt,
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
        verificationStatus: qr.verificationStatus,
        executionMode: qr.executionMode || "SERVER_VERIFIED",
        verificationSubmittedAt: qr.verificationSubmittedAt,
        verificationStartedAt: qr.verificationStartedAt,
        verificationCompletedAt: qr.verificationCompletedAt,
        verificationError: sanitizeParticipantExecutionError(
          qr.status,
          qr.verificationError || qr.error,
        ),
        verificationStatus: qr.verificationStatus,
        verificationSubmittedAt: qr.verificationSubmittedAt,
        verificationStartedAt: qr.verificationStartedAt,
        verificationCompletedAt: qr.verificationCompletedAt,
        verificationError: sanitizeParticipantExecutionError(
          qr.status,
          qr.verificationError || qr.error,
        ),
        score: qr.verificationStatus === "VERIFIED" ? qr.score : null,
        passed: qr.verificationStatus === "VERIFIED" ? qr.passed : null,
        failed: qr.verificationStatus === "VERIFIED" ? qr.failed : null,
        total: qr.total,
        executionTime:
          qr.verificationStatus === "VERIFIED" ? qr.executionTime : null,
        memoryUsed:
          qr.verificationStatus === "VERIFIED" ? qr.memoryUsed : null,
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
