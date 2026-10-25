import cron from "node-cron";
import Organization from "../models/Organization.js";
import BattleRoom from "../models/BattleRoom.js";
import BattleRoomSubmission from "../models/BattleRoomSubmission.js";
import User from "../models/User.js";
import WeeklyCycle from "../models/WeeklyCycle.js";
import {
  finalizeWeeklyCycle,
  freezeWeeklyRoster,
  ensureCurrentGlobalCycle,
  startWeeklyVerificationWorker,
} from "./weeklyAssessmentService.js";
import { closeBattleRoomAndNotify } from "./battleRoomClosureService.js";
import { startBattleRoomVerificationWorker } from "./battleRoomVerificationService.js";
import { retryPendingCompletionEmails } from "./completionNotificationService.js";

export function startCleanupJobs() {
  startBattleRoomVerificationWorker();
  startWeeklyVerificationWorker();

  cron.schedule("*/5 * * * *", async () => {
    try {
      await retryPendingCompletionEmails();
    } catch (error) {
      console.error("[CleanupJob] Completion email retry failed:", error.message);
    }
  });

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
          `[CleanupJob] Closed battle room ${room.roomCode} with ${result.totalParticipants} submissions.`,
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

  cron.schedule("* * * * *", async () => {
    const now = new Date();
    try {
      try {
        await ensureCurrentGlobalCycle(now);
      } catch (error) {
        console.error("[WeeklyAssessment] Global cycle scheduling failed:", error.message);
      }
      const cyclesToFreeze = await WeeklyCycle.find({
        status: "SCHEDULED",
        startAt: { $lte: now },
        rosterFrozenAt: null,
      }).select("_id");
      for (const cycle of cyclesToFreeze) {
        try {
          await freezeWeeklyRoster(cycle._id);
        } catch (error) {
          console.error(`[WeeklyAssessment] Cycle ${cycle._id} roster freeze failed:`, error.message);
        }
      }
      const cyclesToFinalize = await WeeklyCycle.find({
        $or: [
          {
            status: { $in: ["ACTIVE", "FINALIZING"] },
            endAt: { $lte: now },
          },
          {
            status: "FINALIZED",
            certificatesIssuedAt: null,
          },
        ],
      }).select("_id");
      for (const cycle of cyclesToFinalize) {
        try {
          await finalizeWeeklyCycle(cycle._id, now);
        } catch (error) {
          if (error.statusCode === 409) continue;
          console.error(`[WeeklyAssessment] Cycle ${cycle._id} finalization failed:`, error.message);
        }
      }
    } catch (error) {
      console.error("[WeeklyAssessment] Lifecycle job failed:", error.message);
    }
  }, { timezone: "Asia/Kolkata" });

  console.log("[CleanupJob] Scheduled cleanup jobs started.");
}
