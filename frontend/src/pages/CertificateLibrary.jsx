import { useCallback, useEffect, useState } from "react";
import { Award, RefreshCw } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import BattleRoomShareModal from "../components/battleRoom/BattleRoomShareModal";
import PageSkeleton from "../components/layout/PageSkeleton";

function CertificateCard({ certificate, onPreview }) {
  const isDaily = certificate.type === "DAILY";
  const completedAt = certificate.completedAt
    ? new Date(certificate.completedAt).toLocaleDateString()
    : isDaily
      ? certificate.snapshot.cycleKey
      : "Completion date unavailable";
  const title = isDaily
    ? certificate.snapshot.assessmentName
    : certificate.roomTitle;
  const dailyRank =
    certificate.category !== "PARTICIPATION"
      ? Number(certificate.snapshot?.rank)
      : null;
  const description = isDaily
    ? `${certificate.category.replaceAll("_", " ")} · ${dailyRank > 0 ? `Rank ${dailyRank}` : "Participation"} · Score ${Number(certificate.snapshot.score || 0).toFixed(2)} · ${completedAt}`
    : `Rank ${certificate.rank} of ${certificate.totalParticipants} · Score ${Math.round(certificate.totalScore)} · Completed ${completedAt}`;

  return (
    <article className="certificate-card">
      <div className="certificate-card-icon" aria-hidden="true">
        <Award size={22} />
      </div>
      <div className="certificate-card-content">
        <h2>{title}</h2>
        <p>{isDaily ? "Global Daily Challenge" : `Battle Room ${certificate.roomCode}`}</p>
        <p>Certificate {certificate.certificateId} · {description}</p>
      </div>
      <button className="btn-secondary certificate-preview" type="button" onClick={() => onPreview(certificate)}>
        Preview
      </button>
    </article>
  );
}

export default function CertificateLibrary() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryAction, setRetryAction] = useState(null);
  const [previewCertificate, setPreviewCertificate] = useState(null);

  const loadCertificates = useCallback(async () => {
    setLoading(true);
    setError("");
    setRetryAction(null);
    try {
      const [battleResponse, personalResponse, organizationResponse] = await Promise.all([
        api.get("/battle-rooms/certificates/mine"),
        api.get("/weekly-assessments/certificates/mine"),
        user?.creatorType === "ORGANIZATION" && user?.role !== "ADMIN"
          ? api.get("/weekly-assessments/certificates/organization")
          : Promise.resolve({ data: { certificates: [] } }),
      ]);
      if (
        !Array.isArray(battleResponse.data?.certificates) ||
        !Array.isArray(personalResponse.data?.certificates) ||
        !Array.isArray(organizationResponse.data?.certificates)
      ) {
        throw new Error("The certificate response was invalid.");
      }
      const battleCertificates = battleResponse.data.certificates.map((certificate) => ({
        ...certificate,
        type: "BATTLE_ROOM",
      }));
      const dailyCertificates = [
        ...personalResponse.data.certificates,
        ...organizationResponse.data.certificates,
      ].map((certificate) => ({
        ...certificate,
        type: "DAILY",
      }));
      setCertificates([...battleCertificates, ...dailyCertificates]);
    } catch (loadError) {
      setError(loadError.message || "Unable to load your certificates.");
      setRetryAction(() => loadCertificates);
    } finally {
      setLoading(false);
    }
  }, [user?.creatorType, user?.role]);

  useEffect(() => {
    loadCertificates();
  }, [loadCertificates]);

  useEffect(() => {
    const handleDailyChallengeUpdate = () => {
      void loadCertificates();
    };
    window.addEventListener("ccp-daily-challenge-updated", handleDailyChallengeUpdate);
    return () => {
      window.removeEventListener("ccp-daily-challenge-updated", handleDailyChallengeUpdate);
    };
  }, [loadCertificates]);

  const closePreview = () => {
    setPreviewCertificate(null);
    setError("");
    setRetryAction(null);
  };

  return (
    <section className="certificate-library">
      <header className="certificate-library-header">
        <div>
          <span className="certificate-eyebrow">YOUR ACHIEVEMENTS</span>
          <h1>Certificates</h1>
          <p>
            Preview and download certificates as soon as your Daily Challenge or Battle Room result is finalized.
          </p>
        </div>
        <Award size={30} aria-hidden="true" />
      </header>

      {error && (
        <div className="certificate-message certificate-error" role="alert">
          <span>{error}</span>
          <button
            className="btn-secondary"
            type="button"
            onClick={retryAction || loadCertificates}
          >
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <PageSkeleton compact label="Loading certificates" />
      ) : certificates.length === 0 ? (
        !error && (
          <div className="certificate-empty-state">
            <Award size={28} aria-hidden="true" />
            <h2>No certificates available</h2>
            <p>Certificates appear here as soon as your result is finalized.</p>
            <button
              className="btn-secondary"
              type="button"
              onClick={loadCertificates}
            >
              <RefreshCw size={15} />
              Refresh certificates
            </button>
          </div>
        )
      ) : (
        <div className="certificate-list">
          {certificates.map((certificate) => (
            <CertificateCard
              key={certificate.certificateId}
              certificate={certificate}
              onPreview={setPreviewCertificate}
            />
          ))}
        </div>
      )}
      <BattleRoomShareModal
        isOpen={Boolean(previewCertificate)}
        onClose={closePreview}
        result={previewCertificate ? {
          room: {
            title: previewCertificate.type === "DAILY"
              ? previewCertificate.snapshot.assessmentName
              : previewCertificate.roomTitle,
          },
          score: previewCertificate.type === "DAILY"
            ? previewCertificate.snapshot.score
            : null,
          rank: previewCertificate.type === "DAILY"
            ? previewCertificate.category === "PARTICIPATION"
              ? null
              : previewCertificate.snapshot.rank
            : previewCertificate.rank,
          totalParticipants: previewCertificate.totalParticipants || 1,
          completedAt: previewCertificate.completedAt || previewCertificate.snapshot?.issuedAt,
        } : null}
        userName={previewCertificate?.snapshot?.subjectName || user?.name}
        dailyChallenge={previewCertificate?.type === "DAILY"}
        confirmDownload
      />
    </section>
  );
}
