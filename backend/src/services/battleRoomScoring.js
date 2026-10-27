export function countRoomTestCases(questions = []) {
  return questions.reduce((total, question) => {
    const cases = Array.isArray(question.testCases) && question.testCases.length
      ? question.testCases
      : [
          ...(question.visibleTestCases || []),
          ...(question.hiddenTestCases || []),
        ];
    return total + cases.length;
  }, 0);
}

export function calculateQuestionScore(points, passedTestCases, totalTestCases) {
  const total = Number(totalTestCases);
  const mark = Number(points);
  const passed = Number(passedTestCases);
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isFinite(mark) ||
    mark < 0 ||
    !Number.isFinite(passed)
  ) {
    return 0;
  }
  return Math.round((mark * Math.min(total, Math.max(0, passed)) * 100) / total) / 100;
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
  return isBattleRoomSubmissionComplete(submission, totalTestCases);
}
