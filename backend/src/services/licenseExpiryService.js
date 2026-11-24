import License from "../models/License.js";
import User from "../models/User.js";

/**
 * Downgrade every organisation (primary admin) account whose license has
 * expired back to an ordinary user account. The license record is marked
 * EXPIRED. Returns how many accounts were downgraded.
 */
export async function checkLicenseExpiry({
  licenseModel = License,
  userModel = User,
} = {}) {
  const now = new Date();
  const expiredLicenses = await licenseModel.find({
    status: "USED",
    usedByUserId: { $ne: null },
    expiresAt: { $lte: now },
  });

  let downgraded = 0;
  for (const license of expiredLicenses) {
    const user = await userModel.findById(license.usedByUserId);
    if (!user || user.role !== "USER" || user.creatorType !== "ORGANIZATION") {
      license.status = "EXPIRED";
      await license.save().catch(() => {});
      continue;
    }
    user.creatorType = "INDIVIDUAL";
    user.organization = "Unspecified";
    await user.save();
    downgraded += 1;

    license.status = "EXPIRED";
    await license.save().catch(() => {});
    console.info(
      `[LicenseExpiry] Downgraded ${user.email} after license expiry (${license.expiresAt.toISOString()}).`,
    );
  }
  return downgraded;
}

export default checkLicenseExpiry;
