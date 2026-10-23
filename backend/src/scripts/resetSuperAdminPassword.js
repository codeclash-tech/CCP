import { connectDB } from "../config/db.js";
import config from "../config/env.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { sanitizeEmail } from "../services/emailDispatchService.js";
import { validateSuperAdminPassword } from "../services/superAdminBootstrapService.js";

async function resetPassword() {
  if (!process.argv.includes("--confirm-password-reset")) {
    throw new Error("Explicit confirmation flag is required.");
  }
  if (!validateSuperAdminPassword(config.SUPER_ADMIN_PASSWORD)) {
    throw new Error(
      "Configure SUPER_ADMIN_PASSWORD as an 8-72 byte secret before running this command.",
    );
  }

  const connected = await connectDB();
  if (!connected) throw new Error("MongoDB connection is required.");

  const email = sanitizeEmail(config.SUPER_ADMIN_EMAIL);
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new Error("The configured Super Admin account does not exist.");
  }

  user.password = config.SUPER_ADMIN_PASSWORD;
  user.role = "ADMIN";
  await user.save();
  console.info("[SuperAdmin] Password updated for the configured account.");
}

try {
  await resetPassword();
} catch (error) {
  console.error("[SuperAdmin] Password update failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
