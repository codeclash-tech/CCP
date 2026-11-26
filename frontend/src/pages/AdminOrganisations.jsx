import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  RefreshCw,
  KeyRound,
  CalendarClock,
  Send,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import api from "../services/api";
import PageSkeleton from "../components/layout/PageSkeleton";
import "./AdminOrganisations.css";

export default function AdminOrganisations() {
  const [organizations, setOrganizations] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [activeTab, setActiveTab] = useState("generate");
  const [cancelingId, setCancelingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [orgResult, licenseResult] = await Promise.allSettled([
      api.get("/licenses/organizations"),
      api.get("/licenses"),
    ]);
    if (orgResult.status === "fulfilled") {
      setOrganizations(orgResult.value.data.organizations || []);
    }
    if (licenseResult.status === "fulfilled") {
      setLicenses(licenseResult.value.data.licenses || []);
    }
    if (
      orgResult.status === "rejected" &&
      licenseResult.status === "rejected"
    ) {
      setError(orgResult.reason?.message || "Could not load organisations.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generateLicense = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { data } = await api.post("/licenses/generate", {
        email: email.trim(),
        organizationName: organizationName.trim(),
        expiresAt: expiresAt
          ? new Date(`${expiresAt}T23:59:59+05:30`).toISOString()
          : null,
      });
      setNotice(data.message || "License generated and emailed.");
      setEmail("");
      setOrganizationName("");
      setExpiresAt("");
      await load();
    } catch (generateError) {
      setError(
        generateError.response?.data?.error ||
          generateError.message ||
          "Could not generate the license.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCancelLicense = async (licenseId) => {
    setError("");
    setNotice("");
    setCancelingId(licenseId);
    try {
      const { data } = await api.post(`/licenses/${licenseId}/cancel`);
      setNotice(data.message || "License cancelled.");
      await load();
    } catch (cancelError) {
      setError(
        cancelError.response?.data?.error ||
          cancelError.message ||
          "Could not cancel the license.",
      );
    } finally {
      setCancelingId(null);
    }
  };

  if (loading) return <PageSkeleton label="Loading organisations" />;

  return (
    <main className="admin-org-page">
      <header className="challenges-header">
        <p className="challenges-eyebrow">SUPER ADMIN</p>
        <h1>Organisations</h1>
        <p>
          Generate license keys and keep an eye on every organisation's access.
        </p>
      </header>

      {error && (
        <p className="weekly-admin-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="weekly-admin-notice" role="status">
          {notice}
        </p>
      )}

      <div
        className="organisation-tabs"
        role="tablist"
        aria-label="Organisation admin sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "generate"}
          className={activeTab === "generate" ? "selected" : ""}
          onClick={() => setActiveTab("generate")}
        >
          <KeyRound size={15} /> Generate license
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "list"}
          className={activeTab === "list" ? "selected" : ""}
          onClick={() => setActiveTab("list")}
        >
          <Building2 size={15} /> Organisations ({organizations.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "licenses"}
          className={activeTab === "licenses" ? "selected" : ""}
          onClick={() => setActiveTab("licenses")}
        >
          <CalendarClock size={15} /> Licenses ({licenses.length})
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ marginLeft: "auto" }}
          onClick={load}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {activeTab === "generate" && (
        <form className="admin-org-generate" onSubmit={generateLicense}>
          <h2>Generate a license key</h2>
          <p>
            The key is emailed to the organisation — one registration, valid
            until it expires.
          </p>
          <label>
            Organisation email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
            />
          </label>
          <label>
            Organisation name
            <input
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label>
            License expiry date
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            <Send size={15} />{" "}
            {busy ? "Generating…" : "Generate & email license"}
          </button>
        </form>
      )}

      {activeTab === "list" && (
        <section>
          {organizations.length === 0 ? (
            <p className="my-challenges-empty">
              No organisation (primary admin) accounts have registered yet.
            </p>
          ) : (
            <div className="admin-org-table-wrap">
              <table className="my-challenges-table">
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>Primary admin</th>
                    <th>Email</th>
                    <th>License expiry</th>
                    <th>Days remaining</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((organization) => {
                    const remaining = organization.license?.remainingDays ?? 0;
                    return (
                      <tr key={organization.id}>
                        <td>
                          <strong>
                            {organization.organizationName || "—"}
                          </strong>
                        </td>
                        <td>{organization.name}</td>
                        <td>{organization.email}</td>
                        <td>
                          {organization.license?.expiresAt
                            ? new Date(
                                organization.license.expiresAt,
                              ).toLocaleDateString("en-IN", {
                                dateStyle: "medium",
                              })
                            : "—"}
                        </td>
                        <td>
                          <span
                            className={`admin-org-days${remaining <= 7 ? " admin-org-days-warning" : ""}`}
                          >
                            {remaining} day{remaining === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td>
                          {organization.license?.id &&
                          (organization.license?.status === "ACTIVE" ||
                            organization.license?.status === "USED") &&
                          remaining > 0 ? (
                            <button
                              type="button"
                              className="btn-secondary admin-org-cancel"
                              disabled={
                                cancelingId === organization.license.id
                              }
                              onClick={() =>
                                handleCancelLicense(organization.license.id)
                              }
                            >
                              <XCircle size={14} />{" "}
                              {cancelingId === organization.license.id
                                ? "Cancelling…"
                                : "Cancel"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "licenses" && (
        <section>
          {licenses.length === 0 ? (
            <p className="my-challenges-empty">
              No licenses have been issued yet.
            </p>
          ) : (
            <div className="admin-org-table-wrap">
              <table className="my-challenges-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Organisation</th>
                    <th>Email</th>
                    <th>Expires</th>
                    <th>Days remaining</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((license) => {
                    const remaining = license.remainingDays ?? 0;
                    const licenseId = license.id || license._id;
                    return (
                      <tr
                        key={licenseId}
                        className={
                          license.status === "REVOKED"
                            ? "admin-org-license-revoked"
                            : ""
                        }
                      >
                        <td className="admin-org-key">
                          {String(license.licenseKey || "").replace(
                            /(\d{4})(?=\d)/g,
                            "$1 ",
                          )}
                        </td>
                        <td>{license.organizationName}</td>
                        <td>{license.email}</td>
                        <td>
                          {new Date(license.expiresAt).toLocaleDateString(
                            "en-IN",
                            {
                              dateStyle: "medium",
                            },
                          )}
                        </td>
                        <td>
                          <span
                            className={`admin-org-days${remaining <= 7 ? " admin-org-days-warning" : ""}`}
                          >
                            {remaining} day{remaining === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td>
                          {license.status === "USED" ? (
                            <span className="admin-org-status admin-org-status-used">
                              <CheckCircle2 size={13} /> Used
                            </span>
                          ) : license.status === "REVOKED" ? (
                            <span className="admin-org-status admin-org-status-revoked">
                              <XCircle size={13} /> Cancelled
                            </span>
                          ) : remaining <= 0 ? (
                            <span className="admin-org-status">
                              Expired
                            </span>
                          ) : (
                            <span className="admin-org-status">
                              {license.status}
                            </span>
                          )}
                        </td>
                        <td>
                          {(license.status === "ACTIVE" ||
                            license.status === "USED") &&
                          remaining > 0 ? (
                            <button
                              type="button"
                              className="btn-secondary admin-org-cancel"
                              disabled={cancelingId === licenseId}
                              onClick={() => handleCancelLicense(licenseId)}
                            >
                              <XCircle size={14} />{" "}
                              {cancelingId === licenseId
                                ? "Cancelling…"
                                : license.status === "USED"
                                  ? "Cancel license"
                                  : "Cancel"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
