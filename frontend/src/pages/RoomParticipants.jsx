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
