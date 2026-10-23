import useProctorGuard from "../../hooks/useProctorGuard";
import { ShieldAlert, Maximize2, AlertTriangle, X } from "lucide-react";

export default function ProctorGuard({ challengeId, onDisqualified, enabled, onExit }) {
  const {
    isFullscreen,
    warning,
    isDisqualified,
    requestFullscreen,
  } = useProctorGuard({
    challengeId,
    onDisqualified,
    enabled,
  });

  return (
    <>
      <style>{`
        .pg-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          backdrop-filter: blur(4px);
        }
        .pg-modal {
          position: relative;
          background: var(--bg-elevated);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 32px;
          max-width: 480px;
          width: 90%;
          text-align: center;
          color: var(--text-secondary);
          font-family: var(--font-ui);
        }
        .pg-exit {
          position: absolute;
          top: 10px;
          right: 10px;
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-muted);
          background: var(--bg-card);
          cursor: pointer;
        }
        .pg-modal h2 {
          color: var(--text-primary);
          font-size: 20px;
          margin: 0 0 12px;
          font-family: var(--font-ui);
          font-weight: 600;
        }
        .pg-modal p {
          color: var(--text-muted);
          font-size: 14px;
          line-height: 1.6;
          margin: 0 0 24px;
        }
        .pg-btn {
          background: var(--accent-blue);
          color: #fff;
          border: none;
          padding: 12px 32px;
          border-radius: 8px;
          font-size: 14px;
          font-family: var(--font-ui);
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .pg-btn:hover {
          background: var(--accent-blue-bright);
          box-shadow: 0 0 16px var(--accent-blue-glow);
        }
        .pg-disqualified {
          border-color: var(--color-danger);
        }
        .pg-disqualified h2 {
          color: var(--color-danger);
        }
        .pg-warning-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: rgba(218, 54, 51, 0.95);
          color: #fff;
          text-align: center;
          padding: 8px 16px;
          font-family: var(--font-ui);
          font-size: 13px;
          z-index: 99998;
          animation: pgSlideDown 0.3s ease-out;
        }
        @keyframes pgSlideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>

      {enabled && !isFullscreen && !isDisqualified && (
        <div className="pg-overlay">
          <div className="pg-modal">
            <button className="pg-exit" type="button" aria-label="Leave challenge" onClick={onExit}>
              <X size={18} />
            </button>
            <ShieldAlert size={40} color="var(--accent-blue-bright)" style={{ marginBottom: 16 }} />
            <h2>Fullscreen Required</h2>
            <p>
              This battle requires fullscreen mode to maintain integrity.
              Please click the button below to enter fullscreen and start coding.
            </p>
            <button className="pg-btn" onClick={requestFullscreen}>
              <Maximize2 size={16} />
              Enter Fullscreen
            </button>
          </div>
        </div>
      )}

      {enabled && isDisqualified && (
        <div className="pg-overlay">
          <div className="pg-modal pg-disqualified">
            <ShieldAlert size={40} color="var(--color-danger)" style={{ marginBottom: 16 }} />
            <h2>Disqualified</h2>
            <p>
              A proctoring violation was detected (tab switch, window blur, or
              unauthorized copy/paste outside the editor).
              Your submission has been auto-submitted with a score of 0.
            </p>
            <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>
              {warning ? `Reason: ${warning.reason}` : "Reason: Proctoring violation detected."}
            </p>
          </div>
        </div>
      )}

      {warning && !isDisqualified && (
        <div className="pg-warning-bar">
          <AlertTriangle size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
          {warning.message}
        </div>
      )}
    </>
  );
}
