import assert from "node:assert/strict";
import test from "node:test";
import { createCertificatePdfBuffer } from "../src/services/certificatePdfService.js";

test("daily participation and ranking certificates render as landscape PDF attachments", async () => {
  const certificates = await Promise.all([
    createCertificatePdfBuffer({
      challengeType: "DAILY_CHALLENGE",
      participantName: "Daily Participant",
      challengeName: "Daily Challenge",
      score: 82.5,
      completedAt: new Date("2026-10-28T12:00:00.000Z"),
    }),
    createCertificatePdfBuffer({
      challengeType: "DAILY_CHALLENGE",
      participantName: "Ranked Participant",
      challengeName: "Daily Challenge",
      score: 100,
      rank: 1,
      totalParticipants: 38,
      completedAt: new Date("2026-10-29T12:00:00.000Z"),
    }),
  ]);

  for (const pdf of certificates) {
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 1000);
    assert.match(pdf.toString("latin1"), /\/MediaBox \[0 0 900 600\]/);
  }
});

test("battle certificates retain the battle title and rank layout in PDF format", async () => {
  const pdf = await createCertificatePdfBuffer({
    challengeType: "BATTLE_ROOM",
    participantName: "Battle Participant",
    challengeName: "Algorithms Room",
    rank: 2,
    totalParticipants: 12,
    completedAt: new Date("2026-10-29T12:00:00.000Z"),
  });

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
});

test("certificate PDF generation rejects incomplete participant details", async () => {
  await assert.rejects(
    createCertificatePdfBuffer({
      challengeType: "DAILY_CHALLENGE",
      participantName: "",
      challengeName: "Daily Challenge",
    }),
    /participant and challenge names are required/,
  );
});
