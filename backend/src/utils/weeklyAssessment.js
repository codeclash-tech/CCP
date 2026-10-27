const IST_OFFSET_MS = 330 * 60 * 1000;
const CYCLE_DURATION_MS = 24 * 60 * 60 * 1000;
export const WEEKLY_TIMEZONE = "Asia/Kolkata";
export const WEEKLY_SHRINKAGE_K = 5;
export const WEEKLY_RECOVERY_GRACE_MS = 24 * 60 * 60 * 1000;

export function calculateDailyScore(passed, total, points = 100) {
  const caseCount = Number(total);
  const passedCount = Number(passed);
  const maxPoints = Number(points);
  if (
    !Number.isFinite(caseCount) ||
    caseCount <= 0 ||
    !Number.isFinite(passedCount) ||
    !Number.isFinite(maxPoints) ||
    maxPoints < 0
  ) {
    return 0;
  }
  const verifiedPassed = Math.min(caseCount, Math.max(0, passedCount));
  return Math.round((maxPoints * verifiedPassed / caseCount) * 100) / 100;
}

export function getWeeklyRecoveryDeadline(endAt) {
  return new Date(new Date(endAt).getTime() + WEEKLY_RECOVERY_GRACE_MS);
}

export function shouldWaitForWeeklyRecovery({ endAt, recoveryUntilAt, hasRecoverableSubmissions, now }) {
  return Boolean(
    hasRecoverableSubmissions &&
    new Date(now) < new Date(recoveryUntilAt || getWeeklyRecoveryDeadline(endAt)),
  );
}

function localDateParts(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

export function getWeeklyCycleBounds(date) {
  const { year, month, day } = localDateParts(date);
  const localMidnight = Date.UTC(year, month, day);
  const startAt = new Date(localMidnight - IST_OFFSET_MS);
  return {
    cycleKey: new Date(localMidnight).toISOString().slice(0, 10),
    startAt,
    endAt: new Date(startAt.getTime() + 24 * 60 * 60 * 1000),
  };
}

export function getDailyCertificateAvailableAt(cycleKey) {
  const key = String(cycleKey || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  const cycleDate = new Date(Date.UTC(year, month - 1, day));
  if (cycleDate.toISOString().slice(0, 10) !== key) return null;
  return new Date(Date.UTC(year, month - 1, day + 1) - IST_OFFSET_MS);
}

export function getRecurringCycleBounds(startAt, date) {
  const anchor = new Date(startAt);
  const current = new Date(date);
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(current.getTime())) {
    throw new TypeError("A valid global challenge start and current date are required.");
  }
  if (current < anchor) return null;

  const cycleIndex = Math.floor((current.getTime() - anchor.getTime()) / CYCLE_DURATION_MS);
  const cycleStartAt = new Date(anchor.getTime() + cycleIndex * CYCLE_DURATION_MS);
  const localDate = localDateParts(cycleStartAt);
  const cycleKey = [
    String(localDate.year).padStart(4, "0"),
    String(localDate.month + 1).padStart(2, "0"),
    String(localDate.day).padStart(2, "0"),
  ].join("-");

  return {
    cycleIndex,
    cycleKey,
    startAt: cycleStartAt,
    endAt: new Date(cycleStartAt.getTime() + CYCLE_DURATION_MS),
  };
}

export function takeNextQueuedQuestion(questionIds) {
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return { questionId: null, remainingQuestionIds: [] };
  }
  return {
    questionId: questionIds[0],
    remainingQuestionIds: questionIds.slice(1),
  };
}

export function getWeeklyDayIndex(date, startAt) {
  const elapsed = date.getTime() - startAt.getTime();
  if (elapsed < 0 || elapsed >= 24 * 60 * 60 * 1000) return -1;
  return 0;
}

export function latestEligibilityAt(user, instant) {
  const history = user.eligibilityHistory || [];
  return history
    .filter((entry) => new Date(entry.effectiveAt) < instant)
    .sort((left, right) => new Date(right.effectiveAt) - new Date(left.effectiveAt))[0] || null;
}

export function resolveWeeklyOrganization(
  user,
  membership,
  organizationsById,
  organizationsByName,
) {
  const membershipOrganization =
    membership && organizationsById.get(String(membership.organizationId));
  if (membershipOrganization?.status === "ACTIVE") return membershipOrganization;

  const normalizedName = String(user?.organization || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
  return organizationsByName.get(normalizedName) || null;
}

export function isWeeklyParticipationEligible(result) {
  const finalizedAt = new Date(result?.resultFinalizedAt || result?.finalizedAt || NaN);
  const total = Number(result?.totalTestCases ?? result?.total);
  const passed = Number(result?.passedTestCases ?? result?.passed);
  return Boolean(
    result?.participationStatus !== "DISQUALIFIED" &&
    !result?.disqualifiedAt &&
    Number.isFinite(finalizedAt.getTime()) &&
    Number.isFinite(total) &&
    total > 0 &&
    Number.isFinite(passed) &&
    passed >= 1 &&
    passed <= total,
  );
}

export function isWeeklyRankedEligible(result) {
  const finalizedAt = new Date(result?.resultFinalizedAt || result?.finalizedAt || NaN);
  const total = Number(result?.totalTestCases ?? result?.total);
  const passed = Number(result?.passedTestCases ?? result?.passed);
  return Boolean(
    result?.participationStatus !== "DISQUALIFIED" &&
    !result?.disqualifiedAt &&
    Number.isFinite(finalizedAt.getTime()) &&
    Number.isFinite(total) &&
    total > 0 &&
    Number.isFinite(passed) &&
    passed >= 0 &&
    passed <= total,
  );
}

export function summarizeWeeklySubmissions(submissions) {
  const summary = submissions.reduce(
    (result, submission) => {
      const finalizedAt = new Date(submission.finalizedAt || NaN);
      result.score += Number(submission.score) || 0;
      result.passedTestCases += Number(submission.passed) || 0;
      result.totalTestCases += Number(submission.total) || 0;
      result.executionTime += Number(submission.executionTime) || 0;
      result.memoryUsed = Math.max(
        result.memoryUsed,
        Number(submission.memoryUsed) || 0,
      );
      result.completedDays.add(submission.dayIndex);
      if (Number.isFinite(finalizedAt.getTime()) && finalizedAt > result.resultFinalizedAt) {
        result.resultFinalizedAt = finalizedAt;
      }
      return result;
    },
    {
      score: 0,
      passedTestCases: 0,
      totalTestCases: 0,
      executionTime: 0,
      memoryUsed: 0,
      completedDays: new Set(),
      resultFinalizedAt: new Date(0),
    },
  );
  const completedDays = [...summary.completedDays].sort((left, right) => left - right);

  return {
    score: Math.round(summary.score * 100) / 100,
    passedTestCases: summary.passedTestCases,
    totalTestCases: summary.totalTestCases,
    executionTime: summary.executionTime,
    memoryUsed: summary.memoryUsed,
    completedDays,
    resultFinalizedAt:
      summary.resultFinalizedAt.getTime() > 0 ? summary.resultFinalizedAt : null,
    participationStatus: completedDays.length ? "PARTICIPATED" : "NOT_STARTED",
  };
}

export function calculateWeeklyRankings(roster, shrinkageK = WEEKLY_SHRINKAGE_K) {
  if (shrinkageK !== WEEKLY_SHRINKAGE_K) {
    throw new Error("Weekly ranking shrinkage k must remain 5.");
  }

  const rows = roster
    .filter(isWeeklyRankedEligible)
    .map((entry) => ({
      ...entry,
      score: Number(entry.score) || 0,
      completedQuestions: (entry.completedDays || []).length,
    }));
  const cycleMean = rows.length
    ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length
    : 0;
  const compareIndividualMetrics = (left, right) =>
    right.score - left.score ||
    (Number(left.executionTime) || 0) - (Number(right.executionTime) || 0) ||
    (Number(left.memoryUsed) || 0) - (Number(right.memoryUsed) || 0);
  const orderedIndividuals = [...rows].sort((left, right) =>
    compareIndividualMetrics(left, right) ||
    String(left.candidateNameSnapshot || "").localeCompare(
      String(right.candidateNameSnapshot || ""),
      undefined,
      { sensitivity: "base" },
    ) ||
    String(left.candidateId).localeCompare(String(right.candidateId)),
  );
  const individualRankings = orderedIndividuals.map((entry, index) => ({
    rank:
      index > 0 &&
      compareIndividualMetrics(orderedIndividuals[index - 1], entry) === 0
        ? individualRankingsRank(orderedIndividuals, index, compareIndividualMetrics)
        : index + 1,
    candidateId: entry.candidateId,
    candidateNameSnapshot: entry.candidateNameSnapshot,
    organizationId: entry.organizationId,
    organizationNameSnapshot: entry.organizationNameSnapshot,
    score: entry.score,
    completedQuestions: entry.completedQuestions,
    status: "PARTICIPATED",
    lastSubmittedAt: entry.lastSubmittedAt || null,
  }));

  const organizations = new Map();
  for (const entry of rows) {
    const key = String(entry.organizationId);
    if (!entry.organizationId) continue;
    if (!organizations.has(key)) {
      organizations.set(key, {
        organizationId: entry.organizationId,
        organizationNameSnapshot: entry.organizationNameSnapshot,
        scores: [],
        executionTimes: [],
        memoryUses: [],
        completedEligibleCandidates: 0,
        participatingEligibleCandidates: 0,
      });
    }
    const organization = organizations.get(key);
    organization.scores.push(entry.score);
    organization.executionTimes.push(Number(entry.executionTime) || 0);
    organization.memoryUses.push(Number(entry.memoryUsed) || 0);
    if (entry.completedQuestions > 0) {
      organization.participatingEligibleCandidates += 1;
    }
    if (entry.completedQuestions === 1) {
      organization.completedEligibleCandidates += 1;
    }
  }

  const organizationRankings = [...organizations.values()]
    .map((organization) => {
      const eligibleCandidates = organization.scores.length;
      const organizationMean = organization.scores.reduce((sum, score) => sum + score, 0) / eligibleCandidates;
      const averageExecutionTime =
        organization.executionTimes.reduce((sum, value) => sum + value, 0) /
        eligibleCandidates;
      const averageMemoryUsed =
        organization.memoryUses.reduce((sum, value) => sum + value, 0) /
        eligibleCandidates;
      return {
        organizationId: organization.organizationId,
        organizationNameSnapshot: organization.organizationNameSnapshot,
        eligibleCandidates,
        completedEligibleCandidates: organization.completedEligibleCandidates,
        participatingEligibleCandidates: organization.participatingEligibleCandidates,
        organizationMean,
        averageExecutionTime,
        averageMemoryUsed,
        cycleMean,
        shrinkageK,
        finalScore:
          (eligibleCandidates * organizationMean + shrinkageK * cycleMean) /
          (eligibleCandidates + shrinkageK),
        completionRate: organization.completedEligibleCandidates / eligibleCandidates * 100,
      };
    })
    .sort((left, right) =>
      right.finalScore - left.finalScore ||
      right.organizationMean - left.organizationMean ||
      left.averageExecutionTime - right.averageExecutionTime ||
      left.averageMemoryUsed - right.averageMemoryUsed ||
      String(left.organizationNameSnapshot || "").localeCompare(
        String(right.organizationNameSnapshot || ""),
      ) ||
      String(left.organizationId).localeCompare(String(right.organizationId)),
    )
    .map((entry, index, sorted) => ({
      ...entry,
      rank:
        index > 0 &&
        compareOrganizationMetrics(sorted[index - 1], entry) === 0
          ? organizationRank(sorted, index)
          : index + 1,
    }));

  return { cycleMean, individualRankings, organizationRankings };
}

function individualRankingsRank(rows, index, compareMetrics) {
  let first = index - 1;
  while (first > 0 && compareMetrics(rows[first - 1], rows[index]) === 0) {
    first -= 1;
  }
  return first + 1;
}

function compareOrganizationMetrics(left, right) {
  return (
    right.finalScore - left.finalScore ||
    right.organizationMean - left.organizationMean ||
    left.averageExecutionTime - right.averageExecutionTime ||
    left.averageMemoryUsed - right.averageMemoryUsed
  );
}

function organizationRank(rows, index) {
  let first = index - 1;
  while (first > 0 && compareOrganizationMetrics(rows[first - 1], rows[index]) === 0) {
    first -= 1;
  }
  return first + 1;
}
