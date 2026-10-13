export const RANKED_SUBMISSION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "DISQUALIFIED",
];

export function getRoomSubmissionTime(submission) {
  return (submission.questionResults || []).reduce(
    (total, question) => total + (question.timeToSolve || 0),
    0,
  );
}

export function sortRoomSubmissions(submissions) {
  return submissions.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.totalPassed !== a.totalPassed) return b.totalPassed - a.totalPassed;
    if (a.totalFailed !== b.totalFailed) return a.totalFailed - b.totalFailed;
    const timeDifference =
      getRoomSubmissionTime(a) - getRoomSubmissionTime(b);
    if (timeDifference !== 0) return timeDifference;
    const nameA = a.participantName || a.userId?.name || "";
    const nameB = b.participantName || b.userId?.name || "";
    return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  });
}
