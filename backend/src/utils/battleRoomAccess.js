const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ALLOWLIST_SIZE = 10_000;

export function normalizeAllowedEmails(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ALLOWLIST_SIZE) {
    throw new TypeError(`Allowed candidates must be an array of at most ${MAX_ALLOWLIST_SIZE} email addresses.`);
  }
  const emails = new Set();
  for (const valueItem of value) {
    if (typeof valueItem !== "string") {
      throw new TypeError("Each allowed candidate must have a valid email address.");
    }
    const email = valueItem.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new TypeError(`Invalid candidate email address: ${valueItem}`);
    }
    emails.add(email);
  }
  return [...emails];
}

export function canCandidateJoinRoom(room, email) {
  if (room.candidateAccess !== "ALLOWLIST") return true;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return (room.allowedEmails || []).includes(normalizedEmail);
}
