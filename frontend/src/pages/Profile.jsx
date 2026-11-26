import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import UserAvatar from "../components/user/UserAvatar";
import { updateProfile } from "../services/authService";
import api from "../services/api";
import {
  Check,
  Loader2,
  Pencil,
  X,
  ShieldCheck,
  Mail,
  Building2,
  CalendarDays,
} from "lucide-react";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState(user?.name || "");
  const [organization, setOrganization] = useState(user?.organization || "");
  const [organizationProfile, setOrganizationProfile] = useState(null);

  const verified = Boolean(user?.isVerified);
  const isOrganizationUser =
    user?.creatorType === "ORGANIZATION" && user?.role !== "ADMIN";
  const displayOrganization =
    organizationProfile?.name ||
    (user?.organization && user.organization !== "Unspecified"
      ? user.organization
      : "");

  useEffect(() => {
    setName(user?.name || "");
    setOrganization(user?.organization || "");
  }, [user?.name, user?.organization]);

  useEffect(() => {
    if (!isOrganizationUser) {
      setOrganizationProfile(null);
      return;
    }
    api
      .get("/weekly-assessments/organization/profile")
      .then(({ data }) => {
        setOrganizationProfile(data.organization || null);
        if (data.organization?.name) setOrganization(data.organization.name);
      })
      .catch((loadError) => {
        if (loadError.response?.status === 404) {
          setOrganizationProfile(null);
          return;
        }
        setError(loadError.message || "Could not load your profile.");
      });
  }, [isOrganizationUser]);

  const cancelEditing = () => {
    setName(user?.name || "");
    setOrganization(user?.organization || "");
    setError("");
    setSuccess("");
    setEditing(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const trimmedName = name.trim();
    const trimmedOrganization = organization.trim();
    if (!trimmedName || trimmedName.length > 100) {
      setError("Enter a name between 1 and 100 characters.");
      return;
    }
    if (isOrganizationUser && !trimmedOrganization) {
      setError("Enter your organization name.");
      return;
    }
    if (trimmedOrganization.length > 120) {
      setError("Organization must be 120 characters or fewer.");
      return;
    }

    setSaving(true);
    try {
      if (isOrganizationUser) {
        const { data } = await api.request({
          method: organizationProfile ? "put" : "post",
          url: "/weekly-assessments/organization/profile",
          data: { name: trimmedOrganization },
        });
        setOrganizationProfile(data.organization);
      }
      const updatedUser = await updateProfile({
        name: trimmedName,
        organization: trimmedOrganization,
      });
      updateUser(updatedUser);
      setSuccess("Your profile has been updated.");
      setEditing(false);
    } catch (saveError) {
      setError(saveError.message || "Failed to update your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="profile-page">
      <style>{`
        .profile-page {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          min-height: calc(100vh - 64px);
          padding: 20px var(--page-gutter) 48px;
          color: var(--text-primary);
        }

        .profile-container {
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
        }

        /* Single premium card */
        .profile-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(56, 189, 248, 0.28);
          border-radius: 20px;
          background:
            radial-gradient(ellipse at 88% -10%, rgba(56, 189, 248, 0.16), transparent 55%),
            linear-gradient(160deg, rgba(15, 30, 58, 0.5), var(--bg-elevated));
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
        }

        .profile-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #38bdf8, transparent);
          opacity: 0.7;
        }

        .profile-hero {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 30px 32px 26px;
          border-bottom: 1px solid var(--border-color);
        }

        .profile-identity {
          display: flex;
          align-items: center;
          gap: 18px;
          min-width: 0;
        }

        .profile-avatar {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .profile-name {
          margin: 0;
          color: var(--text-primary);
          font-size: 24px;
          line-height: 1.25;
          font-weight: 800;
          letter-spacing: -0.02em;
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
          padding: 7px 12px;
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 999px;
          background: rgba(34, 197, 94, 0.08);
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
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
        }

        .profile-content {
          padding: 24px 32px 30px;
        }

        .profile-details {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin: 0;
        }

        .profile-detail {
          min-width: 0;
          padding: 15px 16px;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.015);
        }

        .profile-detail dt {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin: 0 0 8px;
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.3;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .profile-detail dt svg {
          color: var(--accent-blue-bright, #38bdf8);
        }

        .profile-detail dd {
          margin: 0;
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.45;
          font-weight: 500;
          overflow-wrap: anywhere;
        }

        .profile-role {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 4px 10px;
          border-radius: 100px;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: var(--text-primary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

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
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          opacity: 0.8;
        }

        .profile-edit-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 22px;
          padding-top: 20px;
          border-top: 1px solid var(--border-color);
        }

        .profile-edit-field {
          display: grid;
          gap: 7px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.065em;
        }

        .profile-edit-field input {
          width: 100%;
          min-height: 42px;
          padding: 9px 11px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-main);
          color: var(--text-primary);
          font: 14px var(--font-ui);
          text-transform: none;
          letter-spacing: normal;
        }

        .profile-edit-actions {
          display: flex;
          grid-column: 1 / -1;
          justify-content: flex-end;
          gap: 9px;
        }

        .profile-edit-feedback {
          grid-column: 1 / -1;
          font-size: 13px;
        }

        .profile-edit-feedback.error {
          color: var(--color-danger);
        }

        .profile-edit-feedback.success {
          color: var(--color-success);
        }

        .profile-saving-icon {
          animation: profile-spin 1s linear infinite;
        }

        @keyframes profile-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 680px) {
          .profile-page {
            padding: 24px 16px 40px;
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

          .profile-edit-form {
            grid-template-columns: 1fr;
          }

          .profile-edit-actions,
          .profile-edit-feedback {
            grid-column: auto;
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
            font-size: 19px;
          }
        }
      `}</style>

      <div className="profile-container">
        <section className="profile-card">
          <div className="profile-hero">
            <div className="profile-identity">
              <div className="profile-avatar">
                <UserAvatar name={user?.name} size={64} />
              </div>

              <div>
                <h2 className="profile-name">{user?.name || "Your profile"}</h2>
                <p className="profile-email">
                  {user?.email || "No email available"}
                </p>
                <span className="profile-role" style={{ marginTop: 8 }}>
                  {user?.role === "ADMIN"
                    ? "Super Admin"
                    : isOrganizationUser
                      ? "Primary Admin"
                      : "Participant"}
                </span>
              </div>
            </div>

            <div className="profile-status">
              <span className="profile-status-dot" />
              {verified ? "Verified account" : "Unverified account"}
            </div>
          </div>

          <div className="profile-content">
            <dl className="profile-details">
              <div className="profile-detail">
                <dt>
                  <Mail size={13} /> Email
                </dt>
                <dd>{user?.email || "—"}</dd>
              </div>

              <div className="profile-detail">
                <dt>
                  <Building2 size={13} /> Organization
                </dt>
                <dd>{displayOrganization || "Not set"}</dd>
              </div>

              <div className="profile-detail">
                <dt>
                  <CalendarDays size={13} /> Member since
                </dt>
                <dd>
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
            </dl>

            {success && !editing && (
              <p className="profile-edit-feedback success" role="status">
                {success}
              </p>
            )}

            {editing ? (
              <form className="profile-edit-form" onSubmit={handleSave}>
                <label className="profile-edit-field">
                  Name
                  <input
                    autoComplete="name"
                    maxLength={100}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="profile-edit-field">
                  Organization (optional)
                  <input
                    autoComplete="organization"
                    maxLength={120}
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
                  />
                </label>
                {error && (
                  <p className="profile-edit-feedback error" role="alert">
                    {error}
                  </p>
                )}
                <div className="profile-edit-actions">
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                  >
                    <X size={14} />
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 size={14} className="profile-saving-icon" />
                    ) : (
                      <Check size={14} />
                    )}
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </form>
            ) : (
              <div
                className="profile-edit-actions"
                style={{ marginTop: 20, justifyContent: "flex-start" }}
              >
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setError("");
                    setSuccess("");
                    setEditing(true);
                  }}
                >
                  <Pencil size={14} />
                  Edit profile
                </button>
                {error && !editing && (
                  <p className="profile-edit-feedback error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            )}

            <div className="profile-footer">
              <p className="profile-footer-text">
                Your account information is displayed here based on your current
                account details.
              </p>

              <span className="profile-footer-mark">
                <ShieldCheck size={13} /> AMUX ACCOUNT
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
