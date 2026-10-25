import Submission from "../models/Submission.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import Challenge from "../models/Challenge.js";
import { getCurrentWindow } from "../utils/challengeWindow.js";

const TOP_K = 5;

function isRankedSubmission(submission) {
  return Boolean(
    submission?.status === "ACCEPTED" &&
    submission.isDisqualified !== true &&
    Number.isFinite(Number(submission.passed)) &&
    Number.isFinite(Number(submission.total)) &&
    Number(submission.total) > 0 &&
    Number(submission.passed) === Number(submission.total),
  );
}

export async function calculateUserScores(challengeId) {
  const submissions = await Submission.find({
    challengeId,
    status: { $in: ["ACCEPTED", "REJECTED"] },
    isDisqualified: false,
  })
    .populate("userId", "name email organization")
    .sort({ score: -1 })
    .lean();

  const rankedSubmissions = submissions.filter(isRankedSubmission).map((sub, index) => ({
    rank: index + 1,
    userId: sub.userId?._id,
    name: sub.userId?.name || "Unknown",
    email: sub.userId?.email || "",
    organization: sub.userId?.organization || "Unknown",
    score: sub.score,
    passed: sub.passed,
    total: sub.total,
    executionTime: sub.executionTime,
    memoryUsed: sub.memoryUsed,
    status: sub.status,
    submittedAt: sub.createdAt,
  }));

  return rankedSubmissions;
}

export async function calculateOrganizationScores(challengeId) {
  const submissions = await Submission.find({
    challengeId,
    status: { $in: ["ACCEPTED", "REJECTED"] },
    isDisqualified: false,
  })
    .populate("userId", "organization")
    .lean();

  const orgGroups = {};
  for (const sub of submissions.filter(isRankedSubmission)) {
    const orgName = sub.userId?.organization || "Unknown";
    if (!orgGroups[orgName]) {
      orgGroups[orgName] = [];
    }
    orgGroups[orgName].push(sub.score);
  }

  const orgScores = [];
  for (const [orgName, scores] of Object.entries(orgGroups)) {
    scores.sort((a, b) => b - a);
    const participants = scores.length;
    const k = Math.min(participants, TOP_K);
    const topKScores = scores.slice(0, k);
    const topKAverage = topKScores.reduce((sum, s) => sum + s, 0) / k;

    const participationMultiplier =
      0.85 + 0.15 * (Math.log(participants) / Math.log(participants + 5));

    const bayesianScore = topKAverage * participationMultiplier;

    orgScores.push({
      name: orgName,
      participants,
      topKAverage: Math.round(topKAverage * 100) / 100,
      bayesianScore: Math.round(bayesianScore * 100) / 100,
    });
  }

  orgScores.sort((a, b) => b.bayesianScore - a.bayesianScore);
  const rankedOrgs = orgScores.map((org, index) => ({
    rank: index + 1,
    ...org,
  }));

  await persistOrganizationScores(rankedOrgs);

  return rankedOrgs;
}

async function persistOrganizationScores(orgScores) {
  for (const score of orgScores) {
    try {
      await Organization.findOneAndUpdate(
        { name: score.name },
        {
          $set: {
            participants: score.participants,
            averageScore: score.topKAverage,
            bayesianScore: score.bayesianScore,
            rank: score.rank,
            lastUpdated: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      console.error(
        `Failed to update organization ${score.name}:`,
        error.message,
      );
    }
  }
}

export async function getGlobalUserLeaderboard(limit = 100) {
// Determine today's active challenge (server-authoritative).
  const now = new Date();
  const { start, end } = getCurrentWindow(now);

  const todayChallenge = await Challenge.findOne({
    activeDate: { $gte: start, $lt: end },
    isActive: true,
  });

  if (!todayChallenge) {
    return [];
  }

  // Rank is based on today's challenge submissions only.
  const submissions = await Submission.find({
    challengeId: todayChallenge._id,
    status: { $in: ["ACCEPTED", "REJECTED"] },
    isDisqualified: false,
  })
    .populate("userId", "name email organization")
    .sort({ score: -1 })
    .lean();

  // Filter out NaN scores and disqualified users.
  const filtered = submissions
    .filter((sub) => {
      if (!sub || !sub.userId) return false;
      if (!isRankedSubmission(sub)) return false;
      if (sub.score === undefined || sub.score === null) return false;
      if (typeof sub.score === "number" && Number.isNaN(sub.score))
        return false;
      return true;
    })
    .slice(0, limit)
    .map((sub, index) => ({
      rank: index + 1,
      _id: sub.userId._id,
      name: sub.userId.name || "Unknown",
      email: sub.userId.email || "",
      organization: sub.userId.organization || "Unknown",
      totalScore: sub.score,
      challengesCompleted: sub.status === "ACCEPTED" ? 1 : 0,
      lastActiveDate: sub.createdAt,
    }));

  return filtered;
}

export async function getTodayUserRank(userId, todayChallengeId) {
  if (!todayChallengeId) {
    return { rank: null, totalScore: 0, challengesCompleted: 0 };
  }

  const submissions = await Submission.find({
    challengeId: todayChallengeId,
    isDisqualified: false,
    status: { $in: ["ACCEPTED", "REJECTED"] },
  })
    .populate("userId", "name email")
    .sort({ score: -1 })
    .lean();

  const rankedSubmissions = submissions.filter(isRankedSubmission);
  const userEntry = rankedSubmissions.find(
    (sub) => sub.userId?._id?.toString() === userId.toString(),
  );

  if (!userEntry) {
    return { rank: null, totalScore: 0, challengesCompleted: 0 };
  }

  const rank =
    rankedSubmissions.findIndex((sub) =>
      sub.userId?._id?.toString() === userId.toString(),
    ) + 1;

  return {
    rank,
    totalScore: userEntry.score || 0,
    challengesCompleted: userEntry.status === "ACCEPTED" ? 1 : 0,
  };
}

export async function getOrganizationLeaderboard(limit = 50) {
  return await Organization.find()
    .select("name participants bayesianScore rank lastUpdated")
    .sort({ bayesianScore: -1, rank: 1 })
    .limit(limit)
    .lean();
}
