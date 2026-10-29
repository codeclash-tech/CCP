import { streamCertificatePdf } from "./certificatePdfService.js";

export function streamWeeklyCertificate(certificate, response) {
  if (!certificate?.snapshot || !certificate.certificateId) {
    throw new Error("Finalized daily certificate snapshot is incomplete.");
  }
  const { snapshot } = certificate;
  streamCertificatePdf({
    challengeType: "DAILY_CHALLENGE",
    participantName: snapshot.subjectName,
    challengeName: snapshot.assessmentName,
    score: snapshot.score,
    rank: snapshot.rank,
    completedAt: snapshot.issuedAt,
  }, response);
}
