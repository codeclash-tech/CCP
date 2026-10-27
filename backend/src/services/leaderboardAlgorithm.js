import Submission from "../models/Submission.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import Challenge from "../models/Challenge.js";
import { getCurrentWindow } from "../utils/challengeWindow.js";

const TOP_K = 5;

function isRankedSubmission(submission) {
  return Boolean(
    ["ACCEPTED", "REJECTED"].includes(submission?.status) &&
    submission.isDisqualified !== true &&
    Number.isFinite(Number(submission.passed)) &&
    Number.isFinite(Number(submission.total)) &&
    Number(submission.total) > 0 &&
    Number(submission.passed) >= 0 &&
    Number(submission.passed) <= Number(submission.total),
  );
}

function getAccuracyScore(submission) {
  return Math.round((Number(submission.passed) / Number(submission.total)) * 10000) / 100;
}

function compareSubmissionMetrics(left, right) {
  return (
    getAccuracyScore(right) - getAccuracyScore(left) ||
    (Number(left.executionTime) || 0) - (Number(right.executionTime) || 0) ||
    (Number(left.memoryUsed) || 0) - (Number(right.memoryUsed) || 0)
  );
}

function rankAt(sortedSubmissions, index) {
  let first = index;
  while (
    first > 0 &&
    compareSubmissionMetrics(sortedSubmissions[first - 1], sortedSubmissions[index]) === 0
  ) {
    first -= 1;
  }
  return first + 1;
}

export async function calculateUserScores(challengeId) {
  const submissions = await Submission.find({
    challengeId,
    status: { $in: ["ACCEPTED", "REJECTED"] },
    isDisqualified: false,
  })
    .populate("userId", "name email organization")
    .lean();

  const rankedSubmissions = submissions
    .filter(isRankedSubmission)
    .sort((left, right) =>
      compareSubmissionMetrics(left, right) ||
      String(left.userId?.name || "").localeCompare(
        String(right.userId?.name || ""),
        undefined,
        { sensitivity: "base" },
      ) ||
      String(left._id).localeCompare(String(right._id)),
    )
    .map((sub, index, sorted) => ({
    rank: rankAt(sorted, index),
    userId: sub.userId?._id,
    name: sub.userId?.name || "Unknown",
    email: sub.userId?.email || "",
    organization: sub.userId?.organization || "Unknown",
    score: getAccuracyScore(sub),
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
    orgGroups[orgName].push(sub);
  }

  const orgScores = [];
  for (const [orgName, scores] of Object.entries(orgGroups)) {
    scores.sort(compareSubmissionMetrics);
    const participants = scores.length;
    const k = Math.min(participants, TOP_K);
    const topKScores = scores.slice(0, k);
    const topKAverage = topKScores.reduce((sum, s) => sum + getAccuracyScore(s), 0) / k;
    const averageExecutionTime =
      scores.reduce((sum, submission) => sum + (Number(submission.executionTime) || 0), 0) /
      participants;
    const averageMemoryUsed =
      scores.reduce((sum, submission) => sum + (Number(submission.memoryUsed) || 0), 0) /
      participants;

    const participationMultiplier =
      0.85 + 0.15 * (Math.log(participants) / Math.log(participants + 5));

    const bayesianScore = topKAverage * participationMultiplier;

    orgScores.push({
      name: orgName,
      participants,
      topKAverage: Math.round(topKAverage * 100) / 100,
      bayesianScore: Math.round(bayesianScore * 100) / 100,
      averageExecutionTime,
      averageMemoryUsed,
    });
  }

  orgScores.sort((a, b) =>
    b.bayesianScore - a.bayesianScore ||
    b.topKAverage - a.topKAverage ||
    a.averageExecutionTime - b.averageExecutionTime ||
    a.averageMemoryUsed - b.averageMemoryUsed ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const rankedOrgs = orgScores.map((org, index) => {
    let first = index;
    while (
      first > 0 &&
      orgScores[first - 1].bayesianScore === org.bayesianScore &&
      orgScores[first - 1].topKAverage === org.topKAverage &&
      orgScores[first - 1].averageExecutionTime === org.averageExecutionTime &&
      orgScores[first - 1].averageMemoryUsed === org.averageMemoryUsed
    ) {
      first -= 1;
    }
    return { rank: first + 1, ...org };
  });

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
    .sort((left, right) =>
      compareSubmissionMetrics(left, right) ||
      String(left.userId.name || "").localeCompare(
        String(right.userId.name || ""),
        undefined,
        { sensitivity: "base" },
      ) ||
      String(left._id).localeCompare(String(right._id)),
    )
    .slice(0, limit)
    .map((sub, index, sorted) => ({
      rank: rankAt(sorted, index),
      _id: sub.userId._id,
      name: sub.userId.name || "Unknown",
      email: sub.userId.email || "",
      organization: sub.userId.organization || "Unknown",
      totalScore: getAccuracyScore(sub),
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
    .lean();

  const rankedSubmissions = submissions
    .filter(isRankedSubmission)
    .sort((left, right) =>
      compareSubmissionMetrics(left, right) ||
      String(left.userId?._id || "").localeCompare(String(right.userId?._id || "")),
    );
  const userEntry = rankedSubmissions.find(
    (sub) => sub.userId?._id?.toString() === userId.toString(),
  );

  if (!userEntry) {
    return { rank: null, totalScore: 0, challengesCompleted: 0 };
  }

  const rankIndex =
    rankedSubmissions.findIndex((sub) =>
      sub.userId?._id?.toString() === userId.toString(),
    ) + 1;
  const rank = rankAt(rankedSubmissions, rankIndex - 1);

  return {
    rank,
    totalScore: getAccuracyScore(userEntry),
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
