const IST_OFFSET_MS = 330 * 60 * 1000;
const CYCLE_DURATION_MS = 24 * 60 * 60 * 1000;
export const WEEKLY_TIMEZONE = "Asia/Kolkata";
export const WEEKLY_SHRINKAGE_K = 5;
export const WEEKLY_RECOVERY_GRACE_MS = 24 * 60 * 60 * 1000;

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
  if (!isWeeklyParticipationEligible(result)) return false;
  return Number(result.passedTestCases ?? result.passed) ===
    Number(result.totalTestCases ?? result.total);
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
  const orderedIndividuals = [...rows].sort((left, right) =>
    right.score - left.score ||
    right.completedQuestions - left.completedQuestions ||
    (new Date(left.lastSubmittedAt || 0) - new Date(right.lastSubmittedAt || 0)) ||
    String(left.candidateId).localeCompare(String(right.candidateId)),
  );
  const individualRankings = orderedIndividuals.map((entry, index) => ({
    rank: index + 1,
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
        completedEligibleCandidates: 0,
        participatingEligibleCandidates: 0,
      });
    }
    const organization = organizations.get(key);
    organization.scores.push(entry.score);
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
      return {
        organizationId: organization.organizationId,
        organizationNameSnapshot: organization.organizationNameSnapshot,
        eligibleCandidates,
        completedEligibleCandidates: organization.completedEligibleCandidates,
        participatingEligibleCandidates: organization.participatingEligibleCandidates,
        organizationMean,
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
      left.organizationNameSnapshot.localeCompare(right.organizationNameSnapshot) ||
      String(left.organizationId).localeCompare(String(right.organizationId)),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return { cycleMean, individualRankings, organizationRankings };
}
