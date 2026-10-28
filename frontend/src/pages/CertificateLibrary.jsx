import { useCallback, useEffect, useState } from "react";
import { Award, Download, RefreshCw } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import BattleRoomShareModal from "../components/battleRoom/BattleRoomShareModal";
import PageSkeleton from "../components/layout/PageSkeleton";

function CertificateCard({
  certificate,
  onDownload,
  onPreview,
  downloading,
  downloadDisabled,
}) {
  const isDaily = certificate.type === "DAILY";
  const completedAt = certificate.completedAt
    ? new Date(certificate.completedAt).toLocaleDateString()
    : isDaily
      ? certificate.snapshot.cycleKey
      : "Completion date unavailable";
  const title = isDaily
    ? certificate.snapshot.assessmentName
    : certificate.roomTitle;
  const dailyRank = Number(certificate.snapshot?.rank);
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
      <button
        className="btn-primary certificate-download"
        type="button"
        onClick={() => onDownload(certificate)}
        disabled={downloading || downloadDisabled}
      >
        <Download size={16} />
        {downloading ? "Downloading…" : "Download certificate"}
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
  const [pendingDeletionCertificate, setPendingDeletionCertificate] = useState(null);
  const [downloadingCertificateId, setDownloadingCertificateId] = useState("");
  const [deletingCertificateId, setDeletingCertificateId] = useState("");

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

  const downloadCertificate = async (certificate) => {
    setError("");
    setRetryAction(null);
    setDownloadingCertificateId(certificate.certificateId);
    try {
      const { data } = await api.get(certificate.downloadPath, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${certificate.certificateId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPendingDeletionCertificate(certificate);
    } catch (downloadError) {
      setError(downloadError.message || "Unable to download this certificate.");
    } finally {
      setDownloadingCertificateId("");
    }
  };

  const deleteCertificate = async (certificate) => {
    setError("");
    setRetryAction(null);
    setDeletingCertificateId(certificate.certificateId);
    try {
      await api.delete(certificate.deletePath);
      setCertificates((current) =>
        current.filter(
          (item) => item.certificateId !== certificate.certificateId,
        ),
      );
      setPendingDeletionCertificate(null);
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete this certificate.");
      setRetryAction(() => () => deleteCertificate(certificate));
    } finally {
      setDeletingCertificateId("");
    }
  };

  const keepCertificate = () => {
    setPendingDeletionCertificate(null);
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
            Download daily challenge certificates, available the following day, and completed Battle Room certificates.
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
            <p>
              Certificates appear here after you complete a daily challenge or an eligible Battle Room.
            </p>
          </div>
        )
      ) : (
        <div className="certificate-list">
          {certificates.map((certificate) => (
            <CertificateCard
              key={certificate.certificateId}
              certificate={certificate}
              onDownload={downloadCertificate}
              onPreview={setPreviewCertificate}
              downloading={downloadingCertificateId === certificate.certificateId}
              downloadDisabled={Boolean(pendingDeletionCertificate)}
            />
          ))}
        </div>
      )}
      {pendingDeletionCertificate && (
        <div className="certificate-confirmation-backdrop">
          <section
            className="certificate-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="certificate-delete-title"
          >
            <h2 id="certificate-delete-title">Delete downloaded certificate?</h2>
            <p>
              Your certificate has downloaded. Delete it from your account? This
              cannot be undone.
            </p>
            <div className="certificate-confirmation-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={keepCertificate}
                disabled={Boolean(deletingCertificateId)}
              >
                Keep certificate
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => deleteCertificate(pendingDeletionCertificate)}
                disabled={Boolean(deletingCertificateId)}
              >
                {deletingCertificateId ? "Deleting…" : "Delete certificate"}
              </button>
            </div>
          </section>
        </div>
      )}
      <BattleRoomShareModal
        isOpen={Boolean(previewCertificate)}
        onClose={() => setPreviewCertificate(null)}
        result={previewCertificate ? {
          room: {
            title: previewCertificate.type === "DAILY"
              ? previewCertificate.snapshot.assessmentName
              : previewCertificate.roomTitle,
          },
          rank: previewCertificate.type === "DAILY"
            ? previewCertificate.snapshot.rank
            : previewCertificate.rank,
          totalParticipants: previewCertificate.totalParticipants || 1,
          completedAt: previewCertificate.completedAt || previewCertificate.snapshot?.issuedAt,
        } : null}
        userName={previewCertificate?.snapshot?.subjectName || user?.name}
      />
    </section>
  );
}
