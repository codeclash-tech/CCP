import Otp from "./Otp.js";
import CreatorVerificationOtp from "./CreatorVerificationOtp.js";
import OrganizationProfile from "./OrganizationProfile.js";
import OrganizationMembership from "./OrganizationMembership.js";
import GlobalChallenge from "./GlobalChallenge.js";
import WeeklyCycle from "./WeeklyCycle.js";
import WeeklyRosterEntry from "./WeeklyRosterEntry.js";
import WeeklySubmission from "./WeeklySubmission.js";
import WeeklyCertificate from "./WeeklyCertificate.js";
import AssessmentIntegritySession from "./AssessmentIntegritySession.js";
import User from "./User.js";
import config from "../config/env.js";

/**
 * Declares the config-drive TTL index on the Otp collection.
 *
 * The TTL seconds come from environment config (OTP_TTL_SECONDS, default 300)
 * so the hard-delete window is tunable without a code change. Because the
 * model schema already declares a static fallback index, this method ensures
 * the running index matches the configured value by re-creating it.
 *
 * @returns {Promise<void>}
 */
export async function ensureOtpTtlIndex() {
  const ttlSeconds = parseInt(config.OTP_TTL_SECONDS || "300", 10);
  try {
    await Otp.collection.dropIndex("createdAt_1").catch(() => {
      // index may not exist yet — ignore
    });
    await Otp.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: ttlSeconds, name: "createdAt_1" }
    );
    console.log(`[Models] OTP TTL index ensured (${ttlSeconds}s).`);
  } catch (error) {
    console.error("[Models] Failed to ensure OTP TTL index:", error.message);
  }
}

export async function ensureCreatorVerificationOtpTtlIndex() {
  try {
    await CreatorVerificationOtp.collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "expiresAt_1" },
    );
    console.log("[Models] Creator verification OTP TTL index ensured.");
  } catch (error) {
    console.error(
      "[Models] Failed to ensure creator verification OTP TTL index:",
      error.message,
    );
    throw error;
  }
}

export async function ensureOrganizationMembershipIndexes(
  collection = OrganizationMembership.collection,
) {
  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (error.code !== 26 && error.codeName !== "NamespaceNotFound") {
      throw error;
    }
  }

  const membershipKey = (index) =>
    Object.keys(index.key || {}).length === 1 && index.key.userId === 1;
  const isDesiredIndex = (index) =>
    index.name === "active_user_membership_unique" &&
    index.unique === true &&
    Object.keys(index.partialFilterExpression || {}).length === 1 &&
    index.partialFilterExpression.status === "ACTIVE";

  for (const index of indexes) {
    if (membershipKey(index) && !isDesiredIndex(index)) {
      await collection.dropIndex(index.name);
      console.info(
        `[Models] Replaced stale OrganizationMembership index "${index.name}".`,
      );
    }
  }

  await collection.createIndex(
    { userId: 1 },
    {
      name: "active_user_membership_unique",
      unique: true,
      partialFilterExpression: { status: "ACTIVE" },
    },
  );
}

export async function ensureWeeklyAssessmentIndexes() {
  await ensureOrganizationMembershipIndexes();
  await Promise.all([
    User.createIndexes(),
    OrganizationProfile.createIndexes(),
    OrganizationMembership.createIndexes(),
    GlobalChallenge.createIndexes(),
    WeeklyCycle.createIndexes(),
    WeeklyRosterEntry.createIndexes(),
    WeeklySubmission.createIndexes(),
    WeeklyCertificate.createIndexes(),
    AssessmentIntegritySession.createIndexes(),
  ]);
  console.log("[Models] Weekly assessment indexes ensured.");
}

export default {
  ensureOtpTtlIndex,
  ensureCreatorVerificationOtpTtlIndex,
  ensureWeeklyAssessmentIndexes,
};
