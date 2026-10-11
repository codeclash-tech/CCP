import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    organization: {
      type: String,
      default: "Unspecified",
      trim: true,
      index: true,
    },
    creatorType: {
      type: String,
      enum: ["INDIVIDUAL", "ORGANIZATION", null],
      default: null,
    },
    firstBattleCreatedAt: {
      type: Date,
      default: null,
    },
    partnerLogo: {
      type: String,
      default: "",
      maxlength: 700000,
      select: false,
    },
    partnerAcceptedAt: {
      type: Date,
      default: null,
    },
    partnerTermsVersion: {
      type: String,
      default: "",
    },
    termsAcceptedAt: {
      type: Date,
      default: null,
    },
    termsVersion: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
      index: true,
    },
    // Password is stored as a bcrypt hash in the database — never in plaintext.
    // Every user provides a password at registration.
    password: {
      type: String,
      default: null,
      select: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    totalScore: {
      type: Number,
      default: 0,
    },
    challengesCompleted: {
      type: Number,
      default: 0,
    },
    lastActiveDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    organization: this.organization,
    creatorType: this.creatorType,
    isPartner: Boolean(this.partnerAcceptedAt),
    role: this.role,
    isVerified: this.isVerified,
    totalScore: this.totalScore,
    challengesCompleted: this.challengesCompleted,
    createdAt: this.createdAt,
  };
};

// Hash the password before saving (only when it changes).
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const saltRounds = 10;
    this.password = await bcrypt.hash(this.password, saltRounds);
    return next();
  } catch (err) {
    return next(err);
  }
});

// Compare a plaintext password against the stored hash.
userSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", userSchema);
