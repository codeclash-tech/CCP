import mongoose from "mongoose";

const organizationProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    normalizedName: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    history: {
      type: [
        new mongoose.Schema(
          {
            effectiveAt: { type: Date, required: true },
            name: { type: String, required: true },
            status: { type: String, enum: ["ACTIVE", "INACTIVE"], required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

organizationProfileSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    status: this.status,
    ownerUserId: this.ownerUserId,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

organizationProfileSchema.pre("save", function (next) {
  if (
    this.isNew ||
    this.isModified("name") ||
    this.isModified("status")
  ) {
    this.history.push({
      effectiveAt: new Date(),
      name: this.name,
      status: this.status,
    });
  }
  next();
});

export default mongoose.model("OrganizationProfile", organizationProfileSchema);
