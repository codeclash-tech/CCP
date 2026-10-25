export function countRoomTestCases(questions = []) {
  return questions.reduce(
    (total, question) =>
      total +
      (question.visibleTestCases || []).length +
      (question.hiddenTestCases || []).length,
    0,
  );
}

export function calculateQuestionScore(points, passedTestCases, totalTestCases) {
  if (totalTestCases <= 0) return 0;
  return Math.round((points * passedTestCases * 100) / totalTestCases) / 100;
}

export function isBattleRoomSubmissionComplete(submission, totalTestCases) {
  const passed = Number(submission?.totalPassed);
  const failed = Number(submission?.totalFailed);
  return Boolean(
    submission?.status === "COMPLETED" &&
    Number.isFinite(totalTestCases) &&
    totalTestCases > 0 &&
    Number.isFinite(passed) &&
    Number.isFinite(failed) &&
    passed >= 0 &&
    failed >= 0 &&
    passed + failed === totalTestCases,
  );
}

export function isBattleRoomCertificateEligible(submission, totalTestCases) {
  return isBattleRoomSubmissionComplete(submission, totalTestCases) &&
    Number(submission.totalPassed) > 0;
}

export function isBattleRoomRankedEligible(submission, totalTestCases) {
  return isBattleRoomSubmissionComplete(submission, totalTestCases) &&
    Number(submission.totalPassed) === totalTestCases;
}
