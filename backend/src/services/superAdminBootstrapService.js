import User from "../models/User.js";
import config from "../config/env.js";
import { sanitizeEmail } from "./emailDispatchService.js";

function validateSuperAdminPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}

export async function initializeSuperAdmin({
  userModel = User,
  email = config.SUPER_ADMIN_EMAIL,
  password = config.SUPER_ADMIN_PASSWORD,
} = {}) {
  const normalizedEmail = sanitizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("SUPER_ADMIN_EMAIL must be a valid email address.");
  }
  if (password && !validateSuperAdminPassword(password)) {
    throw new Error(
      "SUPER_ADMIN_PASSWORD must be 8-72 UTF-8 bytes when initializing a new account.",
    );
  }

  const existingUserQuery = userModel.findOne({ email: normalizedEmail });
  const existingUser = await (
    typeof existingUserQuery?.select === "function"
      ? existingUserQuery.select("+password")
      : existingUserQuery
  );
  if (existingUser) {
    let changed = false;
    if (existingUser.role !== "ADMIN") {
      existingUser.role = "ADMIN";
      changed = true;
    }
    if (existingUser.isVerified !== true) {
      existingUser.isVerified = true;
      changed = true;
    }
    if (existingUser.isActive === false) {
      existingUser.isActive = true;
      changed = true;
    }
    if (password) {
      const passwordMatches = typeof existingUser.comparePassword === "function"
        ? await existingUser.comparePassword(password)
        : existingUser.password === password;
      if (!passwordMatches) {
        existingUser.password = password;
        changed = true;
      }
    }
    if (changed) {
      await existingUser.save();
    }
    return "existing";
  }

  if (!password) {
    console.warn(
      "[SuperAdmin] No account exists; initialization is deferred until SUPER_ADMIN_PASSWORD is configured.",
    );
    return "deferred";
  }
  const user = new userModel({
    email: normalizedEmail,
    name: "CodeClash Super Admin",
    organization: "Unspecified",
    role: "ADMIN",
    isVerified: true,
    password,
  });

  try {
    await user.save();
    console.info("[SuperAdmin] Initialized the configured account.");
    return "created";
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const concurrentUser = await userModel.findOne({ email: normalizedEmail });
    if (!concurrentUser) throw error;
    if (concurrentUser.role !== "ADMIN") {
      concurrentUser.role = "ADMIN";
      await concurrentUser.save();
    }
    return "existing";
  }
}

export { validateSuperAdminPassword };
