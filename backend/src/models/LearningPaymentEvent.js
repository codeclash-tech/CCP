import mongoose from "mongoose";

const learningPaymentEventSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["RAZORPAY"], required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    processingStatus: { type: String, enum: ["RECEIVED", "PROCESSING", "PROCESSED", "IGNORED"], default: "RECEIVED" },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

learningPaymentEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export default mongoose.model("LearningPaymentEvent", learningPaymentEventSchema);
