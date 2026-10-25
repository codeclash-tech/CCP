function uniqueCases(testCases) {
  const seen = new Set();
  return testCases.filter((testCase) => {
    const key = `${testCase?.input ?? ""}\u0000${testCase?.expectedOutput ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getChallengeTestCases(challenge) {
  const canonicalCases = Array.isArray(challenge?.testCases)
    ? challenge.testCases
    : [];
  const legacyCases = canonicalCases.length
    ? [
        ...canonicalCases,
        ...(Array.isArray(challenge?.hiddenTestCases)
          ? challenge.hiddenTestCases
          : []),
      ]
    : [
        ...(Array.isArray(challenge?.visibleTestCases)
          ? challenge.visibleTestCases
          : []),
        ...(Array.isArray(challenge?.hiddenTestCases)
          ? challenge.hiddenTestCases
          : []),
      ];
  return uniqueCases(legacyCases);
}
