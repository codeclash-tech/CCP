import { useAuth } from "../context/AuthContext";
import UserAvatar from "../components/user/UserAvatar";

export default function Profile() {
  const { user } = useAuth();

  const verified = Boolean(user?.isVerified);

  return (
    <main className="profile-page">
      <style>{`
        .profile-page {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          min-height: calc(100vh - 64px);
          padding: 20px clamp(20px, 4vw, 64px) 48px;
          color: var(--text-primary);
        }

        .profile-container {
          width: 100%;
          margin: 0 auto;
        }

        /* Header */

        .profile-heading {
          margin-bottom: 22px;
        }

        .profile-heading h1 {
          margin: 0;
          font-size: 25px;
          line-height: 1.2;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: var(--text-primary);
        }

        .profile-heading p {
          margin: 7px 0 0;
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        /* Main Card */

        .profile-card {
          overflow: hidden;
          background: var(--bg-elevated);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.08);
        }

        /* Profile Hero */

        .profile-hero {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 28px 30px;
          border-bottom: 1px solid var(--border-color);
          background:
            radial-gradient(
              circle at 85% 20%,
              rgba(59, 130, 246, 0.10),
              transparent 30%
            ),
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.015),
              transparent
            );
        }

        .profile-identity {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
        }

        .profile-avatar {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .profile-name-block {
          min-width: 0;
        }

        .profile-name {
          margin: 0;
          color: var(--text-primary);
          font-size: 21px;
          line-height: 1.3;
          font-weight: 700;
          letter-spacing: -0.015em;
          overflow-wrap: anywhere;
        }

        .profile-email {
          margin: 5px 0 0;
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .profile-status {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 11px;
          border: 1px solid rgba(34, 197, 94, 0.18);
          border-radius: 999px;
          background: rgba(34, 197, 94, 0.07);
          color: var(--color-success);
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .profile-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.08);
        }

        /* Information */

        .profile-content {
          padding: 26px 30px 30px;
        }

        .profile-section-title {
          margin: 0 0 15px;
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 650;
          letter-spacing: 0.01em;
        }

        .profile-details {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin: 0;
        }

        .profile-detail {
          min-width: 0;
          padding: 15px 16px;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.012);
          transition:
            border-color 160ms ease,
            background 160ms ease;
        }

        .profile-detail:hover {
          border-color: color-mix(
            in srgb,
            var(--border-color) 65%,
            var(--text-muted)
          );
          background: rgba(255, 255, 255, 0.018);
        }

        .profile-detail dt {
          margin: 0 0 7px;
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.3;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.065em;
        }

        .profile-detail dd {
          margin: 0;
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.45;
          font-weight: 500;
          overflow-wrap: anywhere;
        }

        .profile-detail dd.success {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--color-success);
        }

        .success-check {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: rgba(34, 197, 94, 0.12);
          font-size: 9px;
          line-height: 1;
        }

        .profile-role {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 4px 8px;
          border-radius: 6px;
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.14);
          color: var(--text-primary);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
        }

        /* Footer */

        .profile-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid var(--border-color);
        }

        .profile-footer-text {
          margin: 0;
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.5;
        }

        .profile-footer-mark {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          opacity: 0.7;
        }

        /* Responsive */

        @media (max-width: 680px) {
          .profile-page {
            padding: 24px 16px 40px;
          }

          .profile-heading {
            margin-bottom: 16px;
          }

          .profile-heading h1 {
            font-size: 22px;
          }

          .profile-hero {
            align-items: flex-start;
            flex-direction: column;
            padding: 22px;
            gap: 16px;
          }

          .profile-content {
            padding: 22px;
          }

          .profile-details {
            grid-template-columns: 1fr;
          }

          .profile-footer {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 420px) {
          .profile-identity {
            gap: 12px;
          }

          .profile-name {
            font-size: 18px;
          }

          .profile-email {
            font-size: 12px;
          }

          .profile-avatar :global(*) {
            max-width: 46px;
          }

          .profile-content {
            padding: 18px;
          }

          .profile-detail {
            padding: 13px 14px;
          }
        }
      `}</style>

      <div className="profile-container">
        <header className="profile-heading">
          <h1>Profile</h1>
          <p>Manage and view your account information.</p>
        </header>

        <section className="profile-card">
          <div className="profile-hero">
            <div className="profile-identity">
              <div className="profile-avatar">
                <UserAvatar name={user?.name} size={58} />
              </div>

              <div className="profile-name-block">
                <h2 className="profile-name">{user?.name || "Your profile"}</h2>

                <p className="profile-email">
                  {user?.email || "No email available"}
                </p>
              </div>
            </div>

            <div className="profile-status">
              <span className="profile-status-dot" />
              {verified ? "Verified account" : "Unverified account"}
            </div>
          </div>

          <div className="profile-content">
            <h3 className="profile-section-title">Account information</h3>

            <dl className="profile-details">
              <div className="profile-detail">
                <dt>Email</dt>
                <dd>{user?.email || "—"}</dd>
              </div>

              <div className="profile-detail">
                <dt>Organization</dt>
                <dd>{user?.organization || "—"}</dd>
              </div>

              <div className="profile-detail">
                <dt>Account status</dt>
                <dd className={verified ? "success" : ""}>
                  {verified && <span className="success-check">✓</span>}
                  {verified ? "Verified" : "Unverified"}
                </dd>
              </div>

              <div className="profile-detail">
                <dt>Role</dt>
                <dd>
                  <span className="profile-role">{user?.role || "USER"}</span>
                </dd>
              </div>

              <div className="profile-detail">
                <dt>Member since</dt>
                <dd>
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="profile-footer">
              <p className="profile-footer-text">
                Your account information is displayed here based on your current
                account details.
              </p>

              <span className="profile-footer-mark">ACCOUNT</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
