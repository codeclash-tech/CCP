import BattleRoom from "../models/BattleRoom.js";
import User from "../models/User.js";

export async function getPlatformStats(req, res) {
  try {
    const [memberCount, creatorCountResult] = await Promise.all([
      User.countDocuments({ role: "USER" }),
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
          $group: {
            _id: { $toLower: { $trim: { input: "$creator.email" } } },
          },
        },
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
