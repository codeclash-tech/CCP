import mongoose from "mongoose";

/**
 * Nonce model for replay protection.
 * Each nonce is unique per user and expires after use.
 * TTL index auto-deletes after 24 hours.
 */
const nonceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    nonce: {
      type: String,
      required: true,
      unique: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "SUBMIT",
        "RUN",
        "JUDGE_RESULT",
        "CONTEST_START",
        "CONTEST_END",
        "REFRESH_TOKEN",
        "LOGOUT",
        "ANALYTICS_FLUSH",
      ],
    },
    resourceId: {
      type: String,
      default: "",
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    authorizationExpiresAt: {
      type: Date,
      default: null,
    },
    recoveryExpiresAt: {
      type: Date,
      default: null,
    },
    state: {
      type: String,
      enum: ["AVAILABLE", "PROCESSING", "RETRYABLE", "COMPLETED"],
      default: "AVAILABLE",
    },
    claimId: {
      type: String,
      default: null,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    used: {
      type: Boolean,
      default: false,
    },
    consumedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

nonceSchema.index({ userId: 1, nonce: 1 }, { unique: true });
nonceSchema.index({ userId: 1, action: 1, createdAt: -1 });
nonceSchema.index({ userId: 1, action: 1, resourceId: 1, state: 1 });

nonceSchema.methods.consume = async function () {
  if (this.used) {
    throw new Error("Nonce already consumed (replay detected)");
  }
  this.used = true;
  this.consumedAt = new Date();
  await this.save();
};

nonceSchema.statics.generate = async function (
  userId,
  action,
  resourceId = "",
  ttlMs = 24 * 60 * 60 * 1000,
) {
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 24 * 60 * 60 * 1000) {
    throw new RangeError("Nonce lifetime must be between 1 second and 24 hours.");
  }
  const { randomBytes } = await import("crypto");
  const nonceValue = randomBytes(32).toString("hex");
  const now = new Date();
  const authorizationExpiresAt = new Date(now.getTime() + ttlMs);
  const recoveryExpiresAt =
    action === "SUBMIT"
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
      : authorizationExpiresAt;
  const nonce = new this({
    userId,
    nonce: nonceValue,
    action,
    resourceId,
    expiresAt: recoveryExpiresAt,
    authorizationExpiresAt,
    recoveryExpiresAt,
  });
  await nonce.save();
  return nonceValue;
};

nonceSchema.statics.claimDesktopSubmission = async function (
  userId,
  nonceValue,
  resourceId,
) {
  const now = new Date();
  const claimId = (await import("crypto")).randomBytes(16).toString("hex");
  const leaseExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const nonce = await this.findOneAndUpdate(
    {
      userId,
      nonce: nonceValue,
      action: "SUBMIT",
      resourceId,
      recoveryExpiresAt: { $gt: now },
      $or: [
        {
          state: "AVAILABLE",
          authorizationExpiresAt: { $gt: now },
        },
        { state: "RETRYABLE" },
        {
          state: "PROCESSING",
          leaseExpiresAt: { $lte: now },
        },
      ],
    },
    {
      $set: {
        state: "PROCESSING",
        used: true,
        claimId,
        leaseExpiresAt,
      },
      $inc: { attemptCount: 1 },
    },
    { new: true },
  );
  if (nonce) {
    return { nonce, claimId, claimed: true };
  }

  const existing = await this.findOne({
    userId,
    nonce: nonceValue,
    action: "SUBMIT",
    resourceId,
    recoveryExpiresAt: { $gt: now },
  }).lean();
  return { nonce: existing, claimId: null, claimed: false };
};

nonceSchema.statics.releaseDesktopSubmission = function (nonceId, claimId) {
  return this.findOneAndUpdate(
    { _id: nonceId, action: "SUBMIT", state: "PROCESSING", claimId },
    {
      $set: {
        state: "RETRYABLE",
        claimId: null,
        leaseExpiresAt: null,
      },
    },
    { new: true },
  );
};

nonceSchema.statics.completeDesktopSubmission = function (nonceId, claimId) {
  const now = new Date();
  return this.findOneAndUpdate(
    {
      _id: nonceId,
      action: "SUBMIT",
      state: "PROCESSING",
      claimId,
      leaseExpiresAt: { $gt: now },
    },
    {
      $set: {
        state: "COMPLETED",
        claimId: null,
        leaseExpiresAt: null,
        completedAt: now,
      },
    },
    { new: true },
  );
};

nonceSchema.statics.validateAndConsume = async function (userId, nonceValue, action, resourceId = "") {
  const now = new Date();
  const expiryField =
    action === "SUBMIT" ? "authorizationExpiresAt" : "expiresAt";
  const consumed = await this.findOneAndUpdate(
    {
      userId,
      nonce: nonceValue,
      action,
      resourceId,
      used: false,
      [expiryField]: { $gt: now },
    },
    {
      $set: {
        used: true,
        state: "COMPLETED",
        consumedAt: now,
        completedAt: now,
      },
    },
    { new: true },
  );
  return Boolean(consumed);
};

export default mongoose.model("Nonce", nonceSchema);
