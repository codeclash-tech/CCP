import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { RefreshCw, Users } from "lucide-react";
import { getRoomParticipants } from "../services/battleRoomService";
import "./WeeklyAdminAssessment.css";

export default function RoomParticipants() {
  const { roomCode } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getRoomParticipants(roomCode);
      setData(result);
    } catch (loadError) {
      setError(loadError.message || "Could not load room participants.");
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return <main className="page-container" aria-busy="true">Loading room participants…</main>;
  }

  return (
    <main className="page-container" style={{ maxWidth: 1100, margin: "0 auto", padding: 28 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div>
          <p className="about-eyebrow">BATTLE ROOM · {roomCode}</p>
          <h1 style={{ margin: "6px 0" }}>{data?.room.title || "Participants"}</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Only people with the shared room key can join. View the participants and their completed results here.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      {error && <p role="alert" className="weekly-admin-alert">{error}</p>}
      <section style={{ padding: 20, border: "1px solid var(--border-color)", borderRadius: 10, background: "var(--bg-elevated)" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0 }}>
          <Users size={18} /> Participants ({data?.participants?.length || 0})
        </h2>
        {!data?.participants?.length ? (
          <p style={{ color: "var(--text-secondary)" }}>No participants have joined this room.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr>
                  <th style={{ padding: 10 }}>Participant</th>
                  <th style={{ padding: 10 }}>Email</th>
                  <th style={{ padding: 10 }}>Organization</th>
                  <th style={{ padding: 10 }}>Status</th>
                  <th style={{ padding: 10 }}>Score</th>
                  <th style={{ padding: 10 }}>Security report</th>
                </tr>
              </thead>
              <tbody>
                {data.participants.map((participant) => (
                  <tr key={participant._id}>
                    <td style={{ padding: 10 }}>{participant.participantName}</td>
                    <td style={{ padding: 10 }}>{participant.participantEmail}</td>
                    <td style={{ padding: 10 }}>{participant.participantOrganization}</td>
                    <td style={{ padding: 10 }}>{participant.status}</td>
                    <td style={{ padding: 10 }}>{Number(participant.totalScore || 0).toFixed(2)}</td>
                    <td style={{ padding: 10 }}>
                      {participant.securityReport ? (
                        <details>
                          <summary>
                            {participant.securityReport.riskLevel} risk · {participant.securityReport.riskScore}/100
                          </summary>
                          <div>
                            {participant.securityReport.executions.map((execution) => (
                              <section key={execution.executionId}>
                                <p>Question {execution.questionId} · {execution.executionMode || "DESKTOP_LOCAL"} · {execution.resultStatus}</p>
                                <p>Client / engine: {execution.clientVersion} / {execution.engineVersion}</p>
                                <p>Protocol: {execution.executionProtocolVersion}</p>
                                <p>Execution ID: <code>{execution.executionId}</code></p>
                                <p>Source SHA-256: <code>{execution.sourceHash}</code></p>
                                <p>Transcript SHA-256: <code>{execution.transcriptHash}</code></p>
                                {execution.riskSignals?.length > 0
                                  ? <p>Signals: {execution.riskSignals.join(", ")}</p>
                                  : <p>No execution anomalies recorded.</p>}
                                {execution.exactSourceMatches?.length > 0 && (
                                  <>
                                    <p>Exact source-hash match (review signal only):</p>
                                    <ul>{execution.exactSourceMatches.map((match) => (
                                      <li key={match.submissionId}>
                                        {match.candidateName} · submission {match.submissionId}
                                      </li>
                                    ))}</ul>
                                  </>
                                )}
                                <p>Desktop-local result; the server did not independently re-execute it.</p>
                              </section>
                            ))}
                            {participant.securityReport.integritySessions.map((session) => (
                              <section key={session.sessionId}>
                                <p>Session {session.sessionId} · {session.riskLevel} risk ({session.riskScore}/100)</p>
                                <ul>
                                  {session.events.map((event) => (
                                    <li key={event.sequence}>
                                      #{event.sequence} {event.eventType} · {event.occurredAt}
                                      {event.sequenceGapBefore > 0 ? ` · ${event.sequenceGapBefore} sequence gap(s)` : ""}
                                      {event.reason ? ` · ${event.reason}` : ""}
                                    </li>
                                  ))}
                                </ul>
                              </section>
                            ))}
                            <p>These signals are evidence for review, not proof of misconduct.</p>
                          </div>
                        </details>
                      ) : "No report available"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
