import BattleRoom from "../models/BattleRoom.js";
import User from "../models/User.js";

const PARTNER_TERMS_VERSION = "2026-10-11";
const MAX_PARTNER_LOGO_BYTES = 128 * 1024;

export async function getPlatformStats(req, res) {
  try {
    const [memberCount, creatorCountResult] = await Promise.all([
      User.countDocuments({ role: "USER", isVerified: true }),
      BattleRoom.aggregate([
        {
          $lookup: {
            from: User.collection.name,
            localField: "createdBy",
            foreignField: "_id",
            as: "creator",
          },
        },
        { $unwind: "$creator" },
        {
          $match: {
            "creator.role": "USER",
            "creator.isVerified": true,
          },
        },
        {
          $group: {
            _id: { $toLower: { $trim: { input: "$creator.email" } } },
          },
        },
        {
          $unionWith: {
            coll: User.collection.name,
            pipeline: [
              {
                $match: {
                  role: "USER",
                  isVerified: true,
                  firstBattleCreatedAt: { $ne: null },
                },
              },
              {
                $project: {
                  _id: { $toLower: { $trim: { input: "$email" } } },
                },
              },
            ],
          },
        },
        { $group: { _id: "$_id" } },
        { $count: "count" },
      ]),
    ]);

    return res.status(200).json({
      memberCount,
      creatorCount: creatorCountResult[0]?.count || 0,
    });
  } catch (error) {
    console.error("[Platform] Stats error:", error.message);
    return res.status(500).json({ error: "Failed to load platform statistics." });
  }
}

function validateSquarePngLogo(dataUrl) {
  const match =
    typeof dataUrl === "string" &&
    dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) {
    return "Upload a square PNG logo.";
  }

  const image = Buffer.from(match[1], "base64");
  if (image.length > MAX_PARTNER_LOGO_BYTES) {
    return "The logo must be 128 KB or smaller.";
  }
  if (
    image.length < 24 ||
    image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  ) {
    return "The uploaded file is not a valid PNG image.";
  }

  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width < 1 || width !== height) {
    return "The organization logo must have a 1:1 square aspect ratio.";
  }

  return "";
}

export async function updateCreatorProfile(req, res) {
  try {
    const { creatorType, organizationName, logoData, partnerAgreed } =
      req.body || {};
    const user = req.user;

    if (!["INDIVIDUAL", "ORGANIZATION"].includes(creatorType)) {
      return res.status(400).json({
        error: "Choose whether you are creating battles as an individual or organization.",
      });
    }

    if (creatorType === "INDIVIDUAL") {
      user.creatorType = "INDIVIDUAL";
      user.partnerLogo = "";
      user.partnerAcceptedAt = null;
      user.partnerTermsVersion = "";
    } else {
      const name = String(organizationName || "").trim();
      if (!name || name.length > 120) {
        return res.status(400).json({
          error: "Enter an organization name between 1 and 120 characters.",
        });
      }
      if (partnerAgreed !== true) {
        return res.status(400).json({
          error: "Agree to the partner program to register your organization.",
        });
      }
      const logoError = validateSquarePngLogo(logoData);
      if (logoError) return res.status(400).json({ error: logoError });

      user.creatorType = "ORGANIZATION";
      user.organization = name;
      user.partnerLogo = logoData;
      user.partnerAcceptedAt = new Date();
      user.partnerTermsVersion = PARTNER_TERMS_VERSION;
    }

    await user.save();
    return res.status(200).json({ user: user.toPublicJSON() });
  } catch (error) {
    console.error("[Platform] Creator profile update error:", error.message);
    return res.status(500).json({ error: "Failed to save your creator profile." });
  }
}

export async function getPlatformPartners(req, res) {
  try {
    const partnerAccounts = await User.find({
      role: "USER",
      isVerified: true,
      creatorType: "ORGANIZATION",
      partnerAcceptedAt: { $ne: null },
    })
      .select("organization +partnerLogo")
      .sort({ partnerAcceptedAt: 1 })
      .lean();

    const partnersByName = new Map();
    for (const partner of partnerAccounts) {
      const name = String(partner.organization || "").trim();
      const key = name.toLocaleLowerCase();
      if (name && partner.partnerLogo && !partnersByName.has(key)) {
        partnersByName.set(key, { name, logo: partner.partnerLogo });
      }
    }

    return res.status(200).json({ partners: [...partnersByName.values()] });
  } catch (error) {
    console.error("[Platform] Partner listing error:", error.message);
    return res.status(500).json({ error: "Failed to load platform partners." });
  }
}
