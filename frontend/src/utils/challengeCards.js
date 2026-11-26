// Shared premium challenge card used by Challenges, My Challenges, and
// My Hosted Challenges (Organisation) pages.
export const CHALLENGE_TYPE_LABEL = {
  MCQ: "MCQ",
  CONCEPTS: "Concepts",
  CODING: "Coding",
};

export function challengeTypeLabel(assessment) {
  const kind = assessment?.challengeType || assessment?.moduleType || "";
  if (CHALLENGE_TYPE_LABEL[kind]) return CHALLENGE_TYPE_LABEL[kind];
  if (assessment?.questions?.length && !assessment?.exercises) return "Coding";
  return "Concepts";
}

export function savedChallengeIds(userKey) {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(`cc:saved-challenges:${userKey}`) || "[]",
    );
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch {
    return new Set();
  }
}

export function toggleSavedChallenge(userKey, id, savedIds) {
  const next = new Set(savedIds);
  const key = String(id);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  window.localStorage.setItem(
    `cc:saved-challenges:${userKey}`,
    JSON.stringify([...next]),
  );
  return next;
}
