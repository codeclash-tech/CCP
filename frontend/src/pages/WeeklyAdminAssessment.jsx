import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Save } from "lucide-react";
import api from "../services/api";
import "./WeeklyAdminAssessment.css";

const ADMIN_VIEWS = [
  ["cycles", "Daily challenges", "/admin/weekly-assessment"],
  ["roster", "Frozen roster", "/admin/weekly-roster"],
  ["individual", "Individual rankings", "/admin/rankings/individual"],
  ["organizations", "Organization rankings", "/admin/rankings/organizations"],
  ["history", "Daily history", "/admin/weekly-history"],
  ["certificates", "Certificates", "/admin/certificates"],
  ["participants", "Participant organizations", "/admin/participants"],
  ["questions", "Question pool", "/admin/questions"],
];

function dateLabel(value) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

export default function WeeklyAdminAssessment({ view = "cycles" }) {
  const [cycles, setCycles] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [organizationUsers, setOrganizationUsers] = useState([]);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationOwnerId, setOrganizationOwnerId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [roster, setRoster] = useState([]);
  const [results, setResults] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [cycleKey, setCycleKey] = useState("");
  const [cycleName, setCycleName] = useState("");
  const [questionIds, setQuestionIds] = useState([""]);
  const [candidateId, setCandidateId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const requests = [
        api.get("/weekly-assessments/admin/cycles"),
        api.get("/challenges", { params: { limit: 100 } }),
        api.get("/weekly-assessments/admin/organizations"),
        api.get("/weekly-assessments/admin/candidates"),
      ];
      const [cyclesResponse, questionsResponse, organizationsResponse, candidatesResponse] =
        await Promise.all(requests);
      const loadedCycles = cyclesResponse.data.cycles || [];
      setCycles(loadedCycles);
      setQuestions((questionsResponse.data.challenges || []).filter((question) => question.isActive));
      setOrganizations(organizationsResponse.data.organizations || []);
      setCandidates(candidatesResponse.data.candidates || []);
      setOrganizationUsers(candidatesResponse.data.organizationUsers || []);
      setCycleId((currentId) =>
        loadedCycles.some((cycle) => String(cycle._id) === currentId)
          ? currentId
          : String(loadedCycles[0]?._id || ""),
      );
    } catch (requestError) {
      setError(requestError.message || "Could not load daily challenge settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCycleData = useCallback(async () => {
    if (!cycleId) {
      setRoster([]);
      setResults(null);
      setCertificates([]);
      return;
    }
    setError("");
    try {
      if (view === "roster") {
        const { data } = await api.get(`/weekly-assessments/admin/cycles/${cycleId}/roster`);
        setRoster(data.roster || []);
      } else if (view === "individual" || view === "organizations") {
        const { data } = await api.get(`/weekly-assessments/admin/cycles/${cycleId}/results`);
        setResults(data);
      } else if (view === "certificates") {
        const { data } = await api.get(`/weekly-assessments/admin/cycles/${cycleId}/certificates`);
        setCertificates(data.certificates || []);
      }
    } catch (requestError) {
      setRoster([]);
      setResults(null);
      setCertificates([]);
      if (requestError.message === "Certificates are available only after cycle finalization.") {
        setNotice("Certificates are issued after the daily challenge is finalized.");
      } else {
        setError(requestError.message || "Could not load this challenge.");
      }
    }
  }, [cycleId, view]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    loadCycleData();
  }, [loadCycleData]);

  const createCycle = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/weekly-assessments/admin/cycles", {
        cycleKey,
        name: cycleName,
        questionIds,
      });
      setNotice(`Daily challenge ${data.cycle.cycleKey} scheduled.`);
      setCycleKey("");
      setCycleName("");
      setQuestionIds([""]);
      await loadBase();
    } catch (requestError) {
      setError(requestError.message || "Could not schedule the daily challenge.");
    } finally {
      setSaving(false);
    }
  };

  const assignCandidate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.put(`/weekly-assessments/admin/candidates/${candidateId}/organization`, {
        organizationId,
      });
      setNotice("Participant organization assignment saved for the next eligible cycle.");
      setCandidateId("");
      setOrganizationId("");
      await loadBase();
    } catch (requestError) {
      setError(requestError.message || "Could not save participant organization assignment.");
    } finally {
      setSaving(false);
    }
  };

  const createOrganization = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.post("/weekly-assessments/admin/organizations", {
        name: organizationName,
        ownerUserId: organizationOwnerId,
      });
      setOrganizationName("");
      setOrganizationOwnerId("");
      setNotice("Organization profile created for the verified organization account.");
      await loadBase();
    } catch (requestError) {
      setError(requestError.message || "Could not create the organization profile.");
    } finally {
      setSaving(false);
    }
  };

  const removeCandidateAssignment = async (id) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.delete(`/weekly-assessments/admin/candidates/${id}/organization`);
      setNotice("Participant organization assignment ended. Historical rosters are unchanged.");
      await loadBase();
    } catch (requestError) {
      setError(requestError.message || "Could not end the participant organization assignment.");
    } finally {
      setSaving(false);
    }
  };

  const setCandidateActive = async (candidate) => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/weekly-assessments/admin/candidates/${candidate._id}/status`, {
        isActive: !candidate.isActive,
      });
      setNotice(`Participant account ${candidate.isActive ? "deactivated" : "activated"}.`);
      await loadBase();
    } catch (requestError) {
      setError(requestError.message || "Could not update participant status.");
    } finally {
      setSaving(false);
    }
  };

  const setOrganizationStatus = async (organization) => {
    setSaving(true);
    setError("");
    try {
      const status = organization.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await api.patch(`/weekly-assessments/admin/organizations/${organization._id}/status`, { status });
      setNotice(`Organization ${status.toLowerCase()}.`);
      await loadBase();
    } catch (requestError) {
      setError(requestError.message || "Could not update organization status.");
    } finally {
      setSaving(false);
    }
  };

  const finalizeCycle = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post(`/weekly-assessments/admin/cycles/${cycleId}/finalize`);
      setNotice("Daily challenge finalized and certificates issued from saved results.");
      await loadBase();
      await loadCycleData();
    } catch (requestError) {
      setError(requestError.message || "Could not finalize this cycle.");
    } finally {
      setSaving(false);
    }
  };

  const downloadCertificate = async (certificate) => {
    setError("");
    try {
      const { data } = await api.get(
        `/weekly-assessments/certificates/${encodeURIComponent(certificate.certificateId)}/pdf`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${certificate.certificateId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message || "Could not download the certificate.");
    }
  };

  const activeCycle = cycles.find((cycle) => String(cycle._id) === cycleId);
  const title = ADMIN_VIEWS.find(([key]) => key === view)?.[1] || "Daily challenge";

  return (
    <section className="weekly-admin-page">
      <header className="weekly-admin-header">
        <div>
          <p className="weekly-eyebrow">ADMINISTRATION</p>
          <h1>{title}</h1>
          <p>Each challenge has one question, one daily score reset and its own certificates.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={loadBase} disabled={loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {error && <p className="weekly-admin-alert" role="alert">{error}</p>}
      {notice && <p className="weekly-admin-notice" role="status">{notice}</p>}
      {loading ? <p>Loading daily challenge data…</p> : (
        <>
          {(view === "cycles" || view === "history") && (
            <>
              {view === "cycles" && (
                <form className="weekly-admin-card weekly-create-cycle" onSubmit={createCycle}>
                  <h2>Schedule a daily global challenge</h2>
                  <label>
                    Challenge date (Asia/Kolkata)
                    <input type="date" value={cycleKey} onChange={(event) => setCycleKey(event.target.value)} required />
                  </label>
                  <label>
                    Challenge name
                    <input value={cycleName} onChange={(event) => setCycleName(event.target.value)} maxLength={160} placeholder="Global Challenge" />
                  </label>
                  <div className="weekly-admin-question-grid">
                    <label>
                      Daily challenge question
                      <select
                        required
                        value={questionIds[0]}
                        onChange={(event) => setQuestionIds([event.target.value])}
                      >
                        <option value="">Select a saved question</option>
                        {questions.map((question) => (
                          <option key={question._id || question.id} value={question._id || question.id}>
                            {question.title} ({question.difficulty || "Question"})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button type="submit" className="btn-primary" disabled={saving || !questionIds[0]}>
                    <Save size={15} /> {saving ? "Saving…" : "Schedule daily challenge"}
                  </button>
                </form>
              )}
              <section className="weekly-admin-card">
                <h2>{view === "history" ? "Previous and current challenges" : "Scheduled challenges"}</h2>
                {cycles.length === 0 ? <p>No daily challenges have been scheduled.</p> : (
                  <div className="weekly-cycle-list">
                    {cycles.map((cycle) => (
                      <button
                        className={`weekly-cycle-row${cycleId === String(cycle._id) ? " selected" : ""}`}
                        key={cycle._id}
                        type="button"
                        onClick={() => setCycleId(String(cycle._id))}
                      >
                        <span><strong>{cycle.name}</strong><small>{cycle.cycleKey} · {dateLabel(cycle.startAt)} → {dateLabel(cycle.endAt)}</small></span>
                        <span className={`weekly-status status-${cycle.status?.toLowerCase()}`}>{cycle.status}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {view === "participants" && (
            <section className="weekly-admin-card">
              <h2>Organization management</h2>
              <form className="weekly-assignment-form" onSubmit={createOrganization}>
                <label>
                  Organization name
                  <input
                    required
                    maxLength={120}
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                  />
                </label>
                <label>
                  Verified organization owner
                  <select
                    required
                    value={organizationOwnerId}
                    onChange={(event) => setOrganizationOwnerId(event.target.value)}
                  >
                    <option value="">Select organization account</option>
                    {organizationUsers.map((owner) => (
                      <option key={owner._id} value={owner._id}>{owner.name} · {owner.email}</option>
                    ))}
                  </select>
                </label>
                <button className="btn-primary" disabled={saving || !organizationName.trim() || !organizationOwnerId} type="submit">Create organization</button>
              </form>
              <h2>Participant organization assignments</h2>
              <p>Assignment changes take effect at their server timestamp and never rewrite a frozen roster.</p>
              <form className="weekly-assignment-form" onSubmit={assignCandidate}>
                <label>
                  Participant
                  <select required value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
                    <option value="">Select participant</option>
                    {candidates.map((candidate) => (
                      <option key={candidate._id} value={candidate._id}>
                        {candidate.name} · {candidate.email} {candidate.isVerified ? "" : "(unverified)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Organization
                  <select required value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                    <option value="">Select organization</option>
                    {organizations.filter((organization) => organization.status === "ACTIVE").map((organization) => (
                      <option key={organization._id} value={organization._id}>{organization.name}</option>
                    ))}
                  </select>
                </label>
                <button className="btn-primary" disabled={saving || !candidateId || !organizationId} type="submit">Assign</button>
              </form>
              <div className="weekly-cycle-list">
                {candidates.map((candidate) => (
                  <div className="weekly-cycle-row" key={candidate._id}>
                    <span><strong>{candidate.name}</strong><small>{candidate.email} · {candidate.organization || "No organization"} · {candidate.isActive ? "Active" : "Inactive"} / {candidate.isVerified ? "Verified" : "Unverified"}</small></span>
                    <button type="button" className="btn-secondary" onClick={() => setCandidateActive(candidate)} disabled={saving}>
                      {candidate.isActive ? "Deactivate" : "Activate"}
                    </button>
                    {candidate.organizationId && (
                      <button type="button" className="btn-secondary" onClick={() => removeCandidateAssignment(candidate._id)} disabled={saving}>
                        Remove assignment
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <h3>Organizations</h3>
              <div className="weekly-cycle-list">
                {organizations.map((organization) => (
                  <div className="weekly-cycle-row" key={organization._id}>
                    <span><strong>{organization.name}</strong><small>{organization.status}</small></span>
                    <button type="button" className="btn-secondary" onClick={() => setOrganizationStatus(organization)} disabled={saving}>
                      {organization.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {["roster", "individual", "organizations", "certificates"].includes(view) && (
            <section className="weekly-admin-card">
              <div className="weekly-data-toolbar">
                <label>
                  Daily challenge
                  <select value={cycleId} onChange={(event) => setCycleId(event.target.value)}>
                    {cycles.map((cycle) => <option key={cycle._id} value={cycle._id}>{cycle.cycleKey} · {cycle.name}</option>)}
                  </select>
                </label>
                {view === "cycles" && activeCycle?.status !== "FINALIZED" && (
                  <button type="button" className="btn-primary" onClick={finalizeCycle} disabled={saving}>
                    Finalize results
                  </button>
                )}
              </div>
              {view === "roster" && (
                roster.length ? (
                  <div className="weekly-admin-table-wrap"><table className="weekly-admin-table">
                    <thead><tr><th>Participant</th><th>Organization snapshot</th><th>Status</th><th>Score</th><th>Questions</th><th>Security report</th><th>Action</th></tr></thead>
                    <tbody>{roster.map((entry) => (
                      <tr key={entry._id}>
                        <td>{entry.candidateNameSnapshot}</td><td>{entry.organizationNameSnapshot}</td>
                        <td>{entry.participationStatus}</td><td>{entry.score.toFixed(2)}</td>
                        <td>{entry.completedDays.length}/1</td>
                        <td>
                          {entry.securityReport ? (
                            <details>
                              <summary>
                                {entry.securityReport.riskLevel || "LOW"} risk · {entry.securityReport.riskScore || 0}/100
                              </summary>
                              <div>
                                <p>Mode: {entry.securityReport.executionMode === "DESKTOP_LOCAL" ? "Desktop app" : entry.securityReport.executionMode || (entry.securityReport.submissionId ? "CodeClash service" : "Integrity events")}</p>
                                <p>Result: {entry.securityReport.resultStatus || entry.securityReport.status} · {entry.securityReport.passed ?? 0}/{entry.securityReport.total ?? 0} tests</p>
                                <p>Client / runtime: {entry.securityReport.clientVersion || "—"} / {entry.securityReport.engineVersion || "—"}</p>
                                <p>Protocol: {entry.securityReport.executionProtocolVersion || "—"}</p>
                                <p>Execution ID: <code>{entry.securityReport.executionId || "—"}</code></p>
                                <p>Source SHA-256: <code>{entry.securityReport.sourceHash || "—"}</code></p>
                                <p>Transcript SHA-256: <code>{entry.securityReport.transcriptHash || "—"}</code></p>
                                {entry.securityReport.riskSignals?.length ? (
                                  <ul>{entry.securityReport.riskSignals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
                                ) : <p>No server-derived anomalies recorded.</p>}
                                {entry.securityReport.exactSourceMatches?.length > 0 && (
                                  <section>
                                    <p>Exact source-hash match (review signal only):</p>
                                    <ul>{entry.securityReport.exactSourceMatches.map((match) => (
                                      <li key={match.submissionId}>
                                        {match.candidateName} · submission {match.submissionId}
                                      </li>
                                    ))}</ul>
                                  </section>
                                )}
                                {entry.securityReport.timeline && (
                                  <>
                                    <p>Started: {entry.securityReport.timeline.startTime || "—"}</p>
                                    <p>Ended: {entry.securityReport.timeline.endTime || "—"} · {entry.securityReport.timeline.durationMs ?? 0} ms</p>
                                    <ul>
                                      {entry.securityReport.timeline.testOutcomes.map((outcome) => (
                                        <li key={outcome.testCase}>
                                          Test {outcome.testCase}: {outcome.status} · {outcome.executionTimeMs} ms · {outcome.memoryUsedKb} KB
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {entry.securityReport.integritySessions?.map((session) => (
                                  <section key={session.sessionId}>
                                    <p>Monitoring session {session.sessionId} · risk {session.riskLevel} ({session.riskScore}/100)</p>
                                    <ul>
                                      {session.events.map((event) => (
                                        <li key={event.sequence}>
                                          #{event.sequence} {event.eventType} · {event.occurredAt}
                                          {event.sequenceGapBefore > 0 ? ` · ${event.sequenceGapBefore} sequence gap(s) before event` : ""}
                                          {event.reason ? ` · ${event.reason}` : ""}
                                        </li>
                                      ))}
                                    </ul>
                                  </section>
                                ))}
                                <p>Integrity events are client-reported risk evidence, not proof of misconduct.</p>
                              </div>
                            </details>
                          ) : "No submission report"}
                        </td>
                        <td>{entry.participationStatus !== "DISQUALIFIED" && activeCycle?.status === "ACTIVE" &&
                          <button type="button" onClick={async () => {
                            const reason = window.prompt("Disqualification reason:");
                            if (reason === null) return;
                            try {
                              await api.post(`/weekly-assessments/admin/cycles/${cycleId}/candidates/${entry.candidateId}/disqualify`, { reason });
                              await loadCycleData();
                            } catch (requestError) {
                              setError(requestError.message || "Could not remove this participant from the challenge.");
                            }
                          }}>Disqualify</button>}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                ) : <p>This cycle has no frozen roster entries yet.</p>
              )}
              {(view === "individual" || view === "organizations") && (
                <RankingTable
                  view={view}
                  rankings={view === "individual" ? results?.individualRankings : results?.organizationRankings}
                  cycle={results?.cycle}
                />
              )}
              {view === "certificates" && (
                certificates.length ? (
                  <div className="weekly-cycle-list">{certificates.map((certificate) => (
                    <div className="weekly-cycle-row" key={certificate.certificateId}>
                      <span><strong>{certificate.snapshot.subjectName}</strong><small>{certificate.category} · Rank {certificate.snapshot.rank} · {certificate.certificateId}</small></span>
                      <button type="button" className="btn-secondary" onClick={() => downloadCertificate(certificate)}><Download size={15} /> PDF</button>
                    </div>
                  ))}</div>
                ) : <p>No certificates are available for this challenge.</p>
              )}
              {view === "roster" && activeCycle?.status === "ACTIVE" && new Date(activeCycle.endAt) <= new Date() && (
                <button type="button" className="btn-primary" onClick={finalizeCycle} disabled={saving}>Finalize results</button>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}

function RankingTable({ view, rankings = [], cycle }) {
  if (!cycle) return <p>Select a cycle to load its rankings.</p>;
  if (cycle.status !== "FINALIZED") {
    return <p>Current rankings are calculated from the frozen roster and persisted results. Final rankings will be frozen after Sunday.</p>;
  }
  if (!rankings.length) return <p>No rankings are available for this cycle.</p>;
  return (
    <div className="weekly-admin-table-wrap"><table className="weekly-admin-table">
      <thead>
        {view === "individual"
          ? <tr><th>Rank</th><th>Participant</th><th>Organization snapshot</th><th>Score</th><th>Completed</th><th>Status</th></tr>
          : <tr><th>Rank</th><th>Organization</th><th>Mean</th><th>Bayesian score</th><th>Eligible</th><th>Completed</th><th>Completion</th></tr>}
      </thead>
      <tbody>{rankings.map((item) => (
        <tr key={`${item.rank}-${item.candidateId || item.organizationId}`}>
          <td>{item.rank}</td>
          <td>{view === "individual" ? item.candidateNameSnapshot : item.organizationNameSnapshot}</td>
          {view === "individual" ? (
            <>
              <td>{item.organizationNameSnapshot}</td><td>{item.score.toFixed(2)}</td>
              <td>{item.completedQuestions}/1</td><td>{item.status}</td>
            </>
          ) : (
            <>
              <td>{item.organizationMean.toFixed(2)}</td><td>{item.finalScore.toFixed(2)}</td>
              <td>{item.eligibleCandidates}</td><td>{item.completedEligibleCandidates}</td>
              <td>{item.completionRate.toFixed(2)}%</td>
            </>
          )}
        </tr>
      ))}</tbody>
    </table></div>
  );
}
