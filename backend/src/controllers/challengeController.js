import Challenge from "../models/Challenge.js";
import { describeExecutionServiceFailure } from "../services/executionService.js";
import mongoose from "mongoose";
import {
  normalizeChallengePayload,
  validateChallengePayload,
  previewChallengeExecution,
  generateStarterCodeForChallenge,
} from "../services/challengeAuthoringService.js";
import {
  getCurrentWindow,
  getNextWindowStart,
  getWindowDayKey,
  getWindowStart,
} from "../utils/challengeWindow.js";

export function isLocallyValidatedDesktopRequest(req) {
  return (
    req.user?.role === "ADMIN" &&
    req.headers?.origin === "codeclash://app" &&
    req.body?.referenceSolutionValidatedLocally === true
  );
}

const ALLOWED_UPDATE_FIELDS = [
  "title",
  "description",
  "difficulty",
  "examples",
  "constraints",
  "starterCode",
  "testCases",
  "activeDate",
  "isActive",
  "category",
  "slug",
  "functionSignatures",
  "starterCodes",
  "referenceSolutions",
  "visibleTestCases",
  "hiddenTestCases",
  "signature",
];

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/**
 * Attach fresh starter code to a challenge object.
 * Starter code is never persisted in the DB — always regenerated.
 */
function attachFreshStarters(challenge) {
  const obj = challenge.toObject ? challenge.toObject() : challenge;
  if (obj.signature && obj.signature.name) {
    obj.starterCodes = generateStarterCodeForChallenge(obj);
    // Also set a default starterCode for backward compatibility
    obj.starterCode =
      obj.starterCodes?.java ||
      "";
  }
  return obj;
}

export async function createChallenge(req, res) {
  try {
    const normalized = normalizeChallengePayload(req.body);
    const validation = validateChallengePayload(normalized);
    if (!validation.valid) {
      return res
        .status(400)
        .json({ error: validation.errors[0], details: validation.errors });
    }

    const existing = await Challenge.findOne({ slug: validation.slug });
    if (existing) {
      return res
        .status(409)
        .json({ error: "A challenge with this title already exists." });
    }

    if (!isLocallyValidatedDesktopRequest(req)) {
      const preview = await previewChallengeExecution(normalized);
      if (!preview.accepted) {
        if (preview.status === "SYSTEM_ERROR") {
          return res.status(502).json({
            error: describeExecutionServiceFailure(preview.error),
            details: preview.error ? [preview.error] : [],
          });
        }
        return res
          .status(400)
          .json({
            error: "Reference solution failed validation. Publish blocked.",
            details: preview.results || [],
          });
      }
    }

    // Generate fresh starter code (not persisted in DB)
    const freshStarters = normalized.signature?.name
      ? generateStarterCodeForChallenge(normalized)
      : {};

// Determine the active date.
    // For the super admin (daily challenge creator), enforce ONE challenge per day:
    // if today already has a challenge, this new one is scheduled for the next day.
    let activeDate = req.body.activeDate
      ? new Date(req.body.activeDate)
      : getNextWindowStart(); // default: next 6 PM window
    const isSuperAdmin = req.user?.role === "ADMIN";

    if (isSuperAdmin) {
      // Normalize the requested activeDate to its 6 PM window start.
      activeDate = new Date(activeDate);
      activeDate.setHours(18, 0, 0, 0);
      const existingThatDay = await Challenge.findOne({
        activeDate: {
          $gte: getWindowStart(activeDate),
          $lt: new Date(getWindowStart(activeDate).getTime() + 24 * 60 * 60 * 1000),
        },
      });
      // If a challenge already exists for that day, schedule the next one for the next day.
      if (existingThatDay) {
        activeDate = new Date(getWindowStart(activeDate).getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const challenge = new Challenge({
      title: normalized.title,
      slug: validation.slug,
      description: normalized.description,
      difficulty: normalized.difficulty,
      category: normalized.category,
      examples: normalized.examples,
      constraints: normalized.constraints,
      signature: normalized.signature || null,
      starterCode:
        Object.values(freshStarters)[0] || normalized.starterCode || "",
      starterCodes: freshStarters,
      functionSignatures: normalized.functionSignatures,
      referenceSolutions: normalized.referenceSolutions,
      visibleTestCases: normalized.visibleTestCases,
      hiddenTestCases: normalized.hiddenTestCases,
      testCases: normalized.visibleTestCases,
      createdBy: req.userId,
      activeDate,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
    });

    await challenge.save();
    return res
      .status(201)
      .json({
        message: "Challenge created successfully.",
        challenge: challenge.toAdminJSON(),
      });
  } catch (error) {
    const message =
      error?.message ||
      "Secure Code Engine is currently unavailable. Please try again in a few moments.";
    console.error("Create challenge error:", message);
    return res.status(502).json({ error: message });
  }
}

export async function updateChallenge(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid challenge ID format." });
    }

    const updates = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ error: "No valid update fields provided." });
    }

    if (
      updates.functionSignatures ||
      updates.referenceSolutions ||
      updates.visibleTestCases ||
      updates.hiddenTestCases
    ) {
      const existing = await Challenge.findById(id);
      const normalized = normalizeChallengePayload({
        ...(existing?.toObject?.() || {}),
        ...updates,
      });
      const validation = validateChallengePayload(normalized);
      if (!validation.valid) {
        return res
          .status(400)
          .json({ error: validation.errors[0], details: validation.errors });
      }
      updates.slug = validation.slug;
      updates.category = normalized.category;
      updates.functionSignatures = normalized.functionSignatures;
      updates.signature = normalized.signature || null;
      updates.referenceSolutions = normalized.referenceSolutions;
      updates.visibleTestCases = normalized.visibleTestCases;
      updates.hiddenTestCases = normalized.hiddenTestCases;
      // Remove persisted starterCodes when signature changes — they'll be regenerated
      delete updates.starterCodes;
    }

    const challenge = await Challenge.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found." });
    }

    import("../models/AuditLog.js").then(({ default: AuditLog }) => {
      AuditLog.create({
        userId: req.userId,
        action: "CHALLENGE_UPDATE",
        resource: "challenge",
        resourceId: id,
        details: { updatedFields: Object.keys(updates) },
        requestId: req.requestId,
      }).catch(() => {});
    });

    return res
      .status(200)
      .json({
        message: "Challenge updated.",
        challenge: challenge.toAdminJSON(),
      });
  } catch (error) {
    console.error("Update challenge error:", error.message);
    return res.status(500).json({ error: "Failed to update challenge." });
  }
}

export async function deleteChallenge(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid challenge ID format." });
    }

    const challenge = await Challenge.findByIdAndDelete(id);
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found." });
    }

    import("../models/AuditLog.js").then(({ default: AuditLog }) => {
      AuditLog.create({
        userId: req.userId,
        action: "CHALLENGE_DELETE",
        resource: "challenge",
        resourceId: id,
        details: { title: challenge.title },
        requestId: req.requestId,
      }).catch(() => {});
    });

    return res.status(200).json({ message: "Challenge deleted." });
  } catch (error) {
    console.error("Delete challenge error:", error.message);
    return res.status(500).json({ error: "Failed to delete challenge." });
  }
}

export async function getTodayChallenge(req, res) {
  try {
    const now = new Date();
    const { start, end } = getCurrentWindow(now);

    let challenge = await Challenge.findOne({
      activeDate: { $gte: start, $lt: end },
      isActive: true,
    });

    if (!challenge) {
      challenge = await Challenge.findOne({ isActive: true }).sort({
        activeDate: -1,
      });
    }

    if (!challenge) {
      return res.status(404).json({ error: "No active challenge found." });
    }

    const result = challenge.toUserJSON();
    // Attach fresh starter code every time
    if (challenge.signature && challenge.signature.name) {
      const freshStarters = generateStarterCodeForChallenge(challenge);
      result.starterCodes = freshStarters;
      result.starterCode =
        freshStarters?.java ||
        result.starterCode ||
        "";
    }

    return res.status(200).json({ challenge: result });
  } catch (error) {
    console.error("Get today challenge error:", error.message);
    return res.status(500).json({ error: "Failed to get challenge." });
  }
}

export async function getChallengeById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid challenge ID format." });
    }

    const challenge = await Challenge.findById(id);

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found." });
    }

    const isAdmin = req.user && req.user.role === "ADMIN";
    const result = isAdmin ? challenge.toAdminJSON() : challenge.toUserJSON();

    // Attach fresh starter code every time
    if (challenge.signature && challenge.signature.name) {
      const freshStarters = generateStarterCodeForChallenge(challenge);
      result.starterCodes = freshStarters;
      result.starterCode =
        freshStarters?.java ||
        result.starterCode ||
        "";
    }

    return res.status(200).json({ challenge: result });
  } catch (error) {
    console.error("Get challenge error:", error.message);
    return res.status(500).json({ error: "Failed to get challenge." });
  }
}

export async function getAllChallenges(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const challenges = await Challenge.find({})
      .sort({ activeDate: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "title slug difficulty activeDate totalSubmissions totalAccepted isActive",
      )
      .lean();

    const total = await Challenge.countDocuments({});

    return res.status(200).json({
      challenges,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get all challenges error:", error.message);
    return res.status(500).json({ error: "Failed to list challenges." });
  }
}

export async function archiveChallenge(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid challenge ID format." });
    }

    const challenge = await Challenge.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true, runValidators: true },
    );

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found." });
    }

    import("../models/AuditLog.js").then(({ default: AuditLog }) => {
      AuditLog.create({
        userId: req.userId,
        action: "CHALLENGE_ARCHIVE",
        resource: "challenge",
        resourceId: id,
        details: { title: challenge.title },
        requestId: req.requestId,
      }).catch(() => {});
    });

    return res
      .status(200)
      .json({
        message: "Challenge archived.",
        challenge: challenge.toAdminJSON(),
      });
  } catch (error) {
    console.error("Archive challenge error:", error.message);
    return res.status(500).json({ error: "Failed to archive challenge." });
  }
}

export async function publishChallenge(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid challenge ID format." });
    }

    const challenge = await Challenge.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true, runValidators: true },
    );

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found." });
    }

    import("../models/AuditLog.js").then(({ default: AuditLog }) => {
      AuditLog.create({
        userId: req.userId,
        action: "CHALLENGE_PUBLISH",
        resource: "challenge",
        resourceId: id,
        details: { title: challenge.title },
        requestId: req.requestId,
      }).catch(() => {});
    });

    return res
      .status(200)
      .json({
        message: "Challenge published.",
        challenge: challenge.toAdminJSON(),
      });
  } catch (error) {
    console.error("Publish challenge error:", error.message);
    return res.status(500).json({ error: "Failed to publish challenge." });
  }
}

export async function duplicateChallenge(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid challenge ID format." });
    }

    const original = await Challenge.findById(id);
    if (!original) {
      return res.status(404).json({ error: "Challenge not found." });
    }

    const duplicateTitle = `${original.title} (Copy)`;
    let slug = generateSlug(duplicateTitle);

    let existingSlug = await Challenge.findOne({ slug });
    let suffix = 1;
    while (existingSlug) {
      slug = generateSlug(`${duplicateTitle} ${suffix}`);
      suffix++;
      existingSlug = await Challenge.findOne({ slug });
    }

    const duplicate = new Challenge({
      title: duplicateTitle,
      slug,
      description: original.description,
      difficulty: original.difficulty,
      category: original.category,
      examples: original.examples,
      constraints: original.constraints,
      signature: original.signature || null,
      starterCode: original.starterCode,
      functionSignatures: original.functionSignatures,
      starterCodes: original.starterCodes,
      referenceSolutions: original.referenceSolutions,
      visibleTestCases: original.visibleTestCases || original.testCases || [],
      hiddenTestCases: original.hiddenTestCases || [],
      testCases: original.testCases || original.visibleTestCases || [],
      activeDate: new Date(),
      isActive: false,
      createdBy: req.userId,
    });

    await duplicate.save();

    return res.status(201).json({
      message: "Challenge duplicated successfully.",
      challenge: duplicate.toAdminJSON(),
    });
  } catch (error) {
    console.error("Duplicate challenge error:", error.message);
    return res.status(500).json({ error: "Failed to duplicate challenge." });
  }
}

export async function getChallengeStats(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid challenge ID format." });
    }

    const challenge = await Challenge.findById(id).select(
      "title slug totalSubmissions totalAccepted difficulty",
    );
    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found." });
    }

    return res.status(200).json({
      stats: {
        title: challenge.title,
        slug: challenge.slug,
        difficulty: challenge.difficulty,
        totalSubmissions: challenge.totalSubmissions,
        totalAccepted: challenge.totalAccepted,
        acceptanceRate:
          challenge.totalSubmissions > 0
            ? Math.round(
                (challenge.totalAccepted / challenge.totalSubmissions) * 100,
              )
            : 0,
      },
    });
  } catch (error) {
    console.error("Get challenge stats error:", error.message);
    return res.status(500).json({ error: "Failed to get challenge stats." });
  }
}
