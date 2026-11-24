import mongoose from "mongoose";

/**
 * License model — an organisation license issued by the Super Admin.
 *
 * A license binds an email address to an organisation and carries an expiry
 * date. The Super Admin generates the license, a 16-digit key is emailed to
 * the organisation address, and the organisation uses that key exactly once
 * during registration to create its Primary Admin account.
 */
const licenseSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    organizationName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    licenseKey: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    usedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "USED", "REVOKED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true },
);

licenseSchema.methods.toPublicJSON = function () {
  const remainingMs = new Date(this.expiresAt).getTime() - Date.now();
  return {
    id: this._id,
    email: this.email,
    organizationName: this.organizationName,
    expiresAt: this.expiresAt,
    issuedAt: this.issuedAt,
    usedAt: this.usedAt,
    usedByUserId: this.usedByUserId,
    status: this.status,
    remainingDays:
      remainingMs > 0 ? Math.ceil(remainingMs / (24 * 60 * 60 * 1000)) : 0,
    createdAt: this.createdAt,
  };
};

licenseSchema.index({ email: 1, createdAt: -1 });

export default mongoose.model("License", licenseSchema);
