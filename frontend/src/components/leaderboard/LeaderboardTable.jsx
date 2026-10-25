import {
  Medal,
  Trophy,
  Users,
  Building2,
} from "lucide-react";

function TableLoadingSkeleton() {
  return (
    <div
      className="leaderboard-loading-skeleton"
      role="status"
      aria-label="Loading leaderboard"
      aria-busy="true"
    >
      {Array.from({ length: 5 }, (_, row) => (
        <div className="leaderboard-loading-row" key={row}>
          {Array.from({ length: 4 }, (_, cell) => (
            <div className="loading-skeleton leaderboard-loading-cell" key={cell} />
          ))}
        </div>
      ))}
    </div>
  );
}

function getRankIcon(rank) {
  if (Number.isNaN(rank) || rank == null) return null;
  if (rank === 1) return <Trophy size={16} color="var(--color-warning)" />;
  if (rank === 2) return <Medal size={16} color="var(--text-muted)" />;
  if (rank === 3) return <Medal size={16} color="#cd7f32" />;
  return null;
}

function UserRow({ rank, name, organization, score, isCurrentUser }) {
  const isNanRank = Number.isNaN(rank) || rank == null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "50px 1fr 1fr 120px",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-color)",
        background: isCurrentUser ? "var(--accent-blue-soft)" : "transparent",
        alignItems: "center",
        fontSize: 13,
        fontFamily: "var(--font-ui)",
        transition: "background 0.15s",
      }}
    >
      <div
        style={{
          color:
            !isNanRank && rank <= 3
              ? "var(--color-warning)"
              : "var(--text-muted)",
          fontWeight: !isNanRank && rank <= 3 ? 700 : 400,
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        {!isNanRank && (
          <>
            {getRankIcon(rank)}
            {rank > 3 && `#${rank}`}
          </>
        )}
      </div>
      <div
        style={{
          color: isCurrentUser
            ? "var(--accent-blue-bright)"
            : "var(--text-primary)",
          fontWeight: isCurrentUser ? 600 : 400,
        }}
      >
        {name}
        {isCurrentUser && (
          <span
            style={{ color: "var(--text-faint)", fontSize: 10, marginLeft: 6 }}
          >
            (you)
          </span>
        )}
      </div>
      <div style={{ color: "var(--text-muted)" }}>{organization}</div>
      <div
        style={{
          color: "var(--accent-blue-bright)",
          textAlign: "right",
          fontWeight: 600,
        }}
      >
        {Math.round(score)}
      </div>
    </div>
  );
}

function OrganizationRow({ rank, name, participants, bayesianScore }) {
  const isNanRank = Number.isNaN(rank) || rank == null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "50px 1fr 100px 120px",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-color)",
        alignItems: "center",
        fontSize: 13,
        fontFamily: "var(--font-ui)",
      }}
    >
      <div
        style={{
          color:
            !isNanRank && rank <= 3
              ? "var(--color-warning)"
              : "var(--text-muted)",
          fontWeight: !isNanRank && rank <= 3 ? 700 : 400,
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        {!isNanRank && (
          <>
            {getRankIcon(rank)}
            {rank > 3 && `#${rank}`}
          </>
        )}
      </div>
      <div style={{ color: "var(--text-primary)" }}>{name}</div>
      <div style={{ color: "var(--text-muted)", textAlign: "center" }}>
        {participants}
      </div>
      <div
        style={{
          color: "var(--accent-blue-bright)",
          textAlign: "right",
          fontWeight: 600,
        }}
      >
        {bayesianScore.toFixed(1)}
      </div>
    </div>
  );
}

export function UserLeaderboardTable({
  data,
  isLoading,
  currentUserId,
  title = "User Leaderboard",
}) {
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-color)",
          color: "var(--text-primary)",
          fontSize: 14,
          fontFamily: "var(--font-ui)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Users size={15} color="var(--accent-blue-bright)" />
        {title}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "50px 1fr 1fr 120px",
          gap: 12,
          padding: "8px 16px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-card)",
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        <div style={{ textAlign: "center" }}>Rank</div>
        <div>Name</div>
        <div>Organization</div>
        <div style={{ textAlign: "right" }}>Score</div>
      </div>

      <div style={{ maxHeight: 480, overflow: "auto" }}>
        {isLoading ? (
          <TableLoadingSkeleton />
        ) : !data || data.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
            }}
          >
            No submissions yet for this challenge.
          </div>
        ) : (
          data
            .filter(
              (row) =>
                row &&
                !(
                  row.score !== undefined &&
                  row.score !== null &&
                  Number.isNaN(row.score)
                ) &&
                !row.isDisqualified,
            )
            .map((row) => (
              <UserRow
                key={row._id || row.rank}
                rank={row.rank}
                name={row.name}
                organization={row.organization}
                score={row.score}
                isCurrentUser={row._id === currentUserId}
              />
            ))
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function OrganizationLeaderboardTable({
  data,
  isLoading,
  title = "Organization Leaderboard",
}) {
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-color)",
          color: "var(--text-primary)",
          fontSize: 14,
          fontFamily: "var(--font-ui)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Building2 size={15} color="var(--accent-blue-bright)" />
        {title}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "50px 1fr 100px 120px",
          gap: 12,
          padding: "8px 16px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-card)",
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        <div style={{ textAlign: "center" }}>Rank</div>
        <div>Organization</div>
        <div style={{ textAlign: "center" }}>Members</div>
        <div style={{ textAlign: "right" }}>Score</div>
      </div>

      <div style={{ maxHeight: 480, overflow: "auto" }}>
        {isLoading ? (
          <TableLoadingSkeleton />
        ) : !data || data.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
            }}
          >
            No organization data available yet.
          </div>
        ) : (
          data.map((row) => (
            <OrganizationRow
              key={row._id || row.rank}
              rank={row.rank}
              name={row.name}
              participants={row.participants}
              bayesianScore={row.bayesianScore}
            />
          ))
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
