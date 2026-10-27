export const RANKED_SUBMISSION_STATUSES = [
  "COMPLETED",
  "DISQUALIFIED",
];

export function getRoomSubmissionTime(submission) {
  return (submission.questionResults || []).reduce(
    (total, question) => total + (question.timeToSolve || 0),
    0,
  );
}

export function getRoomExecutionTime(submission) {
  return (submission.questionResults || []).reduce(
    (total, question) => total + (Number(question.executionTime) || 0),
    0,
  );
}

export function getRoomMemoryUsed(submission) {
  return (submission.questionResults || []).reduce(
    (peak, question) => Math.max(peak, Number(question.memoryUsed) || 0),
    0,
  );
}

export function compareRoomRankMetrics(a, b) {
  return (
    (Number(b.totalScore) || 0) - (Number(a.totalScore) || 0) ||
    (Number(b.totalPassed) || 0) - (Number(a.totalPassed) || 0) ||
    (Number(a.totalFailed) || 0) - (Number(b.totalFailed) || 0) ||
    getRoomExecutionTime(a) - getRoomExecutionTime(b) ||
    getRoomMemoryUsed(a) - getRoomMemoryUsed(b) ||
    getRoomSubmissionTime(a) - getRoomSubmissionTime(b)
  );
}

export function sortRoomSubmissions(submissions) {
  return submissions.sort((a, b) => {
    const metricDifference = compareRoomRankMetrics(a, b);
    if (metricDifference !== 0) return metricDifference;
    const nameA = a.participantName || a.userId?.name || "";
    const nameB = b.participantName || b.userId?.name || "";
    return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  });
}

export function getRoomRank(sortedSubmissions, index) {
  let first = index;
  while (
    first > 0 &&
    compareRoomRankMetrics(sortedSubmissions[first - 1], sortedSubmissions[index]) === 0
  ) {
    first -= 1;
  }
  return first + 1;
}
