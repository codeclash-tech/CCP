import mongoose from "mongoose";

const integrityEventSchema = new mongoose.Schema(
  {
    sequence: { type: Number, required: true, min: 1 },
    eventType: {
      type: String,
      enum: [
        "ASSESSMENT_START",
        "FULLSCREEN_EXIT",
        "TAB_SWITCH",
        "WINDOW_BLUR",
        "COPY_ATTEMPT",
        "PASTE_ATTEMPT",
        "DEVTOOLS_OPEN",
        "KEYBOARD_SHORTCUT",
        "ASSESSMENT_SUBMIT",
      ],
      required: true,
    },
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
    reason: { type: String, default: "", maxlength: 200 },
    sequenceGapBefore: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const assessmentIntegritySessionSchema = new mongoose.Schema(
  {
    assessmentType: {
      type: String,
      enum: ["DAILY_CHALLENGE", "BATTLE_ROOM"],
      required: true,
    },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sessionId: { type: String, required: true, maxlength: 64 },
    lastSequence: { type: Number, required: true, min: 1 },
    startedAt: { type: Date, required: true },
    lastEventAt: { type: Date, required: true },
    finalizedAt: { type: Date, default: null },
    events: {
      type: [integrityEventSchema],
      default: [],
      validate: [(events) => events.length <= 200, "An integrity session cannot exceed 200 events."],
    },
  },
  { timestamps: true },
);

assessmentIntegritySessionSchema.index(
  { assessmentType: 1, assessmentId: 1, userId: 1, sessionId: 1 },
  { unique: true },
);

export default mongoose.model(
  "AssessmentIntegritySession",
  assessmentIntegritySessionSchema,
);
