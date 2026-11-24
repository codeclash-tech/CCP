import crypto from "crypto";
import License from "../models/License.js";
import User from "../models/User.js";
import { sanitizeEmail } from "../services/emailDispatchService.js";
import { getResendClient } from "../services/resendClient.js";
import { checkLicenseExpiry } from "../services/licenseExpiryService.js";

function generateLicenseKey() {
  // 16-digit license key: L-XXXX-XXXX-XXXX-XXXX
  let digits = "";
  for (let i = 0; i < 16; i += 1) {
    digits += crypto.randomInt(0, 10);
  }
  return digits;
}

function requireSuperAdmin(req, res) {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Super admin access is required." });
    return false;
  }
  return true;
}

/**
 * GET /api/licenses
 * Super admin only — list all issued licenses with remaining expiry days.
 */
export async function listLicenses(req, res) {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const licenses = await License.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.status(200).json({
      licenses: licenses.map((license) => {
        const remainingMs = new Date(license.expiresAt).getTime() - Date.now();
        return {
          ...license,
          id: license._id,
          remainingDays:
            remainingMs > 0
              ? Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
              : 0,
        };
      }),
    });
  } catch (error) {
    console.error("[LicenseController] list failed:", error.message);
    return res.status(500).json({ error: "Could not load licenses." });
  }
}

/**
 * GET /api/licenses/organizations
 * Super admin only — organisations (primary admins) with license expiry info.
 */
export async function listOrganizations(req, res) {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const primaryAdmins = await User.find({
      role: "USER",
      creatorType: "ORGANIZATION",
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const licenses = await License.find({
      usedByUserId: { $in: primaryAdmins.map((user) => user._id) },
    })
      .sort({ createdAt: -1 })
      .lean();
    const licenseByUser = new Map(
      licenses.map((license) => [String(license.usedByUserId), license]),
    );

    const organizations = primaryAdmins.map((user) => {
      const license = licenseByUser.get(String(user._id));
      const remainingMs = license
        ? new Date(license.expiresAt).getTime() - Date.now()
        : 0;
      return {
        id: user._id,
        email: user.email,
        name: user.name,
        organizationName:
          license?.organizationName ||
          (user.organization && user.organization !== "Unspecified"
            ? user.organization
            : ""),
        createdAt: user.createdAt,
        license: license
          ? {
              id: license._id,
              expiresAt: license.expiresAt,
              status: license.status,
              remainingDays:
                remainingMs > 0
                  ? Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
                  : 0,
              issuedAt: license.issuedAt,
            }
          : null,
      };
    });

    return res.status(200).json({ organizations });
  } catch (error) {
    console.error("[LicenseController] organizations failed:", error.message);
    return res.status(500).json({ error: "Could not load organisations." });
  }
}

/**
 * POST /api/licenses/generate
 * Super admin only — generate a 16-digit license for an organisation email
 * with an expiry date and email the key to that address.
 * Body: { email, organizationName, expiresAt }
 */
export async function generateLicense(req, res) {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const { email, organizationName, expiresAt } = req.body || {};

    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (
      typeof organizationName !== "string" ||
      organizationName.trim().length < 2 ||
      organizationName.trim().length > 120
    ) {
      return res
        .status(400)
        .json({ error: "Organisation name must be 2-120 characters." });
    }
    const expiry = new Date(expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      return res
        .status(400)
        .json({ error: "Choose a license expiry date in the future." });
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser?.isVerified) {
      return res.status(409).json({
        error: "An account already exists for that email address.",
      });
    }

    const licenseKey = generateLicenseKey();
    const license = new License({
      email: cleanEmail,
      organizationName: organizationName.trim(),
      normalizedName: organizationName.trim().toLowerCase(),
      licenseKey,
      expiresAt: expiry,
      issuedBy: req.userId,
      status: "ACTIVE",
    });
    await license.save();

    const client = getResendClient();
    const sendResult = await client.resend.emails.send({
      from: client.from,
      to: [cleanEmail],
      subject: "Your CodeClash organisation license",
      text:
        `Your CodeClash license key is: ${licenseKey}\n\n` +
        `Organisation: ${organizationName.trim()}\n` +
        `This license expires on ${expiry.toDateString()}.\n\n` +
        "Use this key once during registration to create your organisation account.\n",
      html:
        '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">' +
        '<h2 style="color:#2563eb;">CodeClash Organisation License</h2>' +
        `<p>Your 16-digit license key is:</p>` +
        `<div style="background:#eff6ff;color:#1d4ed8;font-size:22px;font-weight:700;letter-spacing:4px;padding:16px;text-align:center;border-radius:10px;">${licenseKey}</div>` +
        `<p>Organisation: <strong>${organizationName.trim()}</strong></p>` +
        `<p>This license expires on <strong>${expiry.toDateString()}</strong>.</p>` +
        "<p>Use this key once during registration to create your organisation account.</p>" +
        "</div>",
    });

    if (sendResult.error) {
      console.error(
        "[LicenseController] license email failed:",
        sendResult.error,
      );
      await License.deleteOne({ _id: license._id }).catch(() => {});
      return res
        .status(500)
        .json({ error: "License could not be emailed. Please try again." });
    }

    return res.status(201).json({
      message: `License generated and emailed to ${cleanEmail}.`,
      license: license.toPublicJSON(),
    });
  } catch (error) {
    console.error("[LicenseController] generate failed:", error.message);
    return res.status(500).json({ error: "Could not generate the license." });
  }
}

/**
 * POST /api/licenses/:id/cancel
 * Super admin only — cancel (revoke) an active, unused license.
 */
export async function cancelLicense(req, res) {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const license = await License.findById(req.params.id);
    if (!license) {
      return res.status(404).json({ error: "License not found." });
    }
    if (license.status === "USED") {
      return res
        .status(409)
        .json({ error: "This license has already been redeemed and cannot be cancelled." });
    }
    if (license.status === "REVOKED") {
      return res
        .status(409)
        .json({ error: "This license has already been cancelled." });
    }
    license.status = "REVOKED";
    await license.save();
    return res.status(200).json({
      message: `License for ${license.email} has been cancelled.`,
      license: license.toPublicJSON(),
    });
  } catch (error) {
    console.error("[LicenseController] cancel failed:", error.message);
    return res.status(500).json({ error: "Could not cancel the license." });
  }
}

/**
 * GET /api/licenses/validate?key=XXXX — public check used by the register form.
 */
export async function validateLicenseKey(req, res) {
  try {
    const key = String(req.query.key || "").replace(/\D/g, "");
    if (key.length !== 16) {
      return res
        .status(400)
        .json({ valid: false, error: "A license key is 16 digits." });
    }
    const license = await License.findOne({ licenseKey: key });
    if (!license || license.status === "USED" || license.status === "REVOKED") {
      return res
        .status(404)
        .json({ valid: false, error: "This license key is not valid." });
    }
    if (new Date(license.expiresAt).getTime() <= Date.now()) {
      return res
        .status(410)
        .json({ valid: false, error: "This license has expired." });
    }
    return res.status(200).json({
      valid: true,
      organizationName: license.organizationName,
      email: license.email,
    });
  } catch (error) {
    console.error("[LicenseController] validate failed:", error.message);
    return res
      .status(500)
      .json({ valid: false, error: "Could not validate the license." });
  }
}

/**
 * POST /api/licenses/redeem — internal (called by authService during verify).
 * Marks the license as used for the registered user.
 */
export async function redeemLicenseForKey(key, userId) {
  const license = await License.findOne({ licenseKey: key });
  if (
    !license ||
    license.status === "USED" ||
    license.status === "REVOKED" ||
    new Date(license.expiresAt).getTime() <= Date.now()
  ) {
    throw new Error("This license key is not valid or has already been used.");
  }

  license.status = "USED";
  license.usedByUserId = userId;
  license.usedAt = new Date();
  await license.save();

  const User = (await import("../models/User.js")).default;
  const user = await User.findById(userId);
  if (user) {
    user.creatorType = "ORGANIZATION";
    user.organization = license.organizationName;
    user.organizationId = license._id; // reference retained for audit
    await user.save();
  }

  // Extend the license list with the redeeming user for organisation listing.
  const OrganizationProfile = (await import("../models/OrganizationProfile.js"))
    .default;
  const existingProfile = await OrganizationProfile.findOne({
    normalizedName: license.normalizedName,
  });
  if (!existingProfile) {
    const profile = new OrganizationProfile({
      name: license.organizationName,
      normalizedName: license.normalizedName,
      status: "ACTIVE",
      ownerUserId: userId,
    });
    await profile.save();
    if (user) {
      user.organizationId = profile._id;
      await user.save();
    }
  } else if (
    !existingProfile.ownerUserId ||
    String(existingProfile.ownerUserId) === String(userId)
  ) {
    existingProfile.ownerUserId = userId;
    await existingProfile.save();
  }

  return license;
}

export { generateLicenseKey, checkLicenseExpiry };
export default {
  listLicenses,
  listOrganizations,
  generateLicense,
  cancelLicense,
  validateLicenseKey,
  redeemLicenseForKey,
};
