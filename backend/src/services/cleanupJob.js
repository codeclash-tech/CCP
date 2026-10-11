import cron from "node-cron";
import Organization from "../models/Organization.js";
import BattleRoom from "../models/BattleRoom.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import User from "../models/User.js";
import { closeBattleRoomAndNotify } from "./battleRoomClosureService.js";

export function startCleanupJobs() {
  // Run daily at midnight to update organization metrics
  cron.schedule("0 0 * * *", async () => {
    console.log(
      "[CleanupJob] Running daily organization metrics recalibration...",
    );
    try {
      const organizations = await Organization.find({}).sort({
        bayesianScore: -1,
      });
      for (let i = 0; i < organizations.length; i++) {
        organizations[i].rank = i + 1;
        await organizations[i].save();
      }
      console.log(
        `[CleanupJob] Recalibrated ${organizations.length} organization rankings.`,
      );
    } catch (error) {
      console.error(
        "[CleanupJob] Organization recalibration failed:",
        error.message,
      );
    }
  });

  // Run every minute to finalize rooms after their configured end date.
  cron.schedule("* * * * *", async () => {
    console.log("[CleanupJob] Checking for expired battle rooms...");
    try {
      const now = new Date();
      const expiredRooms = await BattleRoom.find({
        status: { $in: ["ACTIVE", "UPCOMING"] },
        $or: [
          { endDate: { $lte: now } },
          { endDate: null, endTime: { $lte: now } },
        ],
      });

      for (const room of expiredRooms) {
        console.log(
          `[CleanupJob] Auto-closing battle room: ${room.roomCode} - ${room.title}`,
        );
        const result = await closeBattleRoomAndNotify(room._id);
        if (!result.closed) continue;

        console.log(
          `[CleanupJob] Closed battle room ${room.roomCode} with ${result.totalParticipants} participants; sent ${result.emailsSent} result emails and encountered ${result.emailFailures} email failures.`,
        );
      }
    } catch (error) {
      console.error("[CleanupJob] Battle room cleanup failed:", error.message);
    }
  });

  // Keep completed rooms available briefly for result and certificate downloads.
  cron.schedule("*/10 * * * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000);
      const expiredRoomFilter = {
        $and: [
          { status: "CLOSED", isDeleted: false },
          {
            $or: [
              { closedAt: { $lte: cutoff } },
              {
                closedAt: null,
                resultEmailsCompletedAt: { $lte: cutoff },
              },
              {
                closedAt: null,
                resultEmailsCompletedAt: null,
                updatedAt: { $lte: cutoff },
              },
            ],
          },
        ],
      };
      const expiredRooms = await BattleRoom.find(expiredRoomFilter)
        .select("createdBy")
        .lean();
      if (expiredRooms.length === 0) return;

      const creatorIds = [
        ...new Set(expiredRooms.map((room) => String(room.createdBy))),
      ];
      await User.updateMany(
        {
          _id: { $in: creatorIds },
          role: "USER",
          firstBattleCreatedAt: null,
        },
        { $set: { firstBattleCreatedAt: new Date() } },
      );
      const result = await BattleRoom.deleteMany(expiredRoomFilter);
      if (result.deletedCount > 0) {
        console.log(
          `[CleanupJob] Deleted ${result.deletedCount} battle room(s) closed for at least 5 minutes.`,
        );
      }
    } catch (error) {
      console.error("[CleanupJob] Closed room deletion failed:", error.message);
    }
  });

  console.log("[CleanupJob] Scheduled cleanup jobs started.");
}
