import assert from "node:assert/strict";
import test from "node:test";
import {
  canCandidateJoinRoom,
  normalizeAllowedEmails,
} from "../src/utils/battleRoomAccess.js";

test("normalizes and deduplicates allowlisted candidate emails", () => {
  assert.deepEqual(
    normalizeAllowedEmails([
      " Candidate@One.Example ",
      "candidate@one.example",
      "second@example.org",
    ]),
    ["candidate@one.example", "second@example.org"],
  );
});

test("rejects malformed and excessive allowlists", () => {
  assert.throws(() => normalizeAllowedEmails(["not-an-email"]), /Invalid candidate email/);
  assert.throws(() => normalizeAllowedEmails("candidate@example.com"), /must be an array/);
  assert.throws(
    () => normalizeAllowedEmails(Array.from({ length: 10_001 }, () => "a@example.com")),
    /at most 10000/,
  );
});

test("candidate join policy permits open rooms and only matching allowlisted emails", () => {
  assert.equal(canCandidateJoinRoom({ candidateAccess: "OPEN" }, "anyone@example.com"), true);
  assert.equal(
    canCandidateJoinRoom(
      { candidateAccess: "ALLOWLIST", allowedEmails: ["candidate@example.com"] },
      " CANDIDATE@example.com ",
    ),
    true,
  );
  assert.equal(
    canCandidateJoinRoom(
      { candidateAccess: "ALLOWLIST", allowedEmails: ["candidate@example.com"] },
      "other@example.com",
    ),
    false,
  );
});
