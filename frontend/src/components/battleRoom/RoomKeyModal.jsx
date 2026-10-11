import { useState } from "react";
import { KeyRound, Copy, Check, ShieldCheck, Share2, X, Users, Clock } from "lucide-react";

export default function RoomKeyModal({ isOpen, onClose, roomCode, room }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  if (!isOpen) return null;

  const handleCopy = async () => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = roomCode;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      try {
        textarea.select();
        if (!document.execCommand("copy")) {
          throw new Error("Clipboard copy was rejected.");
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopyError("Couldn't copy the key. Please select and copy it manually.");
      } finally {
        textarea.remove();
      }
    }
  };

  const handleShare = async () => {
    const shareText = `⚔️ Join my Coding Battle!\n\nRoom: ${room?.title || "Battle Room"}\nRoom Key: ${roomCode}\n\nEnter this key in the Battle Room section to join and compete!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join Coding Battle", text: shareText });
        return;
      } catch {
        // fall through to copy
      }
    }
    await handleCopy();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
        fontFamily: "var(--font-ui)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          padding: 32,
          maxWidth: 480,
          width: "90%",
          textAlign: "center",
          boxShadow: "0 0 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 18,
          }}
        >
          <X size={18} />
        </button>

        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(210,153,34,0.12)",
            border: "1px solid rgba(210,153,34,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <KeyRound size={30} color="var(--color-warning)" />
        </div>

        <h2 style={{ color: "var(--text-primary)", fontSize: 20, margin: "0 0 8px", fontWeight: 700 }}>
          Room Key Generated!
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 20px", lineHeight: 1.6 }}>
          Share this key with up to <strong style={{ color: "var(--text-primary)" }}>{room?.maxParticipants || 100}</strong> participants.
          Only people with this key can join the battle room.
        </p>

        <div
          style={{
            background: "var(--bg-main)",
            border: "2px dashed var(--border-strong)",
            borderRadius: 10,
            padding: "16px 24px",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: 8,
            fontFamily: "var(--font-code)",
            color: "var(--color-warning)",
            marginBottom: 16,
            userSelect: "all",
          }}
        >
          {roomCode}
        </div>

        {copyError && (
          <p
            role="alert"
            style={{
              color: "var(--color-danger)",
              fontSize: 12,
              margin: "0 0 14px",
            }}
          >
            {copyError}
          </p>
        )}

        {room?.timeLimit && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20, flexWrap: "wrap" }}>
            <span style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={11} /> {room.timeLimit} {room.timeLimitUnit || "minutes"}
            </span>
            <span style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <Users size={11} /> Max {room.maxParticipants || 100} participants
            </span>
            <span style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <ShieldCheck size={11} /> Creator-only
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1,
              background: "var(--accent-blue)",
              color: "#fff",
              border: "none",
              padding: "12px 20px",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.2s",
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Key"}
          </button>
          <button
            onClick={handleShare}
            className="btn-secondary"
            style={{ flex: 1, justifyContent: "center", padding: "12px 20px" }}
          >
            <Share2 size={14} />
            Share
          </button>
        </div>

        <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 16, lineHeight: 1.5 }}>
          Only you (the creator) can see this key. You can share it again later from the room page.
          The room will be automatically deleted after 1 year of inactivity.
        </p>
      </div>
    </div>
  );
}
