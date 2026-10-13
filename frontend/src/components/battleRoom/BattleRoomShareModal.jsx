import { useState, useRef, useEffect, useCallback } from "react";

export default function BattleRoomShareModal({
  isOpen,
  onClose,
  result,
  userName,
}) {
  const canvasRef = useRef(null);
  const [downloaded, setDownloaded] = useState(false);

  const room = result?.room || {};
  const rank = Number(result?.rank) || 1;
  const totalParticipants = Number(result?.totalParticipants) || 1;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // =========================================================
    // CANVAS — Landscape Certificate (3:2 Aspect Ratio)
    // =========================================================
    canvas.width = 1200;
    canvas.height = 800;

    // =========================================================
    // BACKGROUND
    // =========================================================
    const bgGrad = ctx.createLinearGradient(0, 0, 1200, 800);
    bgGrad.addColorStop(0, "#07142f");
    bgGrad.addColorStop(0.5, "#123b8f");
    bgGrad.addColorStop(1, "#2563eb");

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1200, 800);

    // =========================================================
    // CERTIFICATE CARD
    // =========================================================
    ctx.fillStyle = "#ffffff";

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(40, 40, 1120, 720, 20);
      ctx.fill();
    } else {
      ctx.fillRect(40, 40, 1120, 720);
    }

    // =========================================================
    // INNER BLUE BORDER
    // =========================================================
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(62, 62, 1076, 676, 10);
      ctx.stroke();
    } else {
      ctx.strokeRect(62, 62, 1076, 676);
    }

    // =========================================================
    // HEADER — PROFESSIONAL CERTIFICATE STYLE
    // =========================================================

    // ---------------------------------------------------------
    // TOP RIGHT CORNER DESIGN
    // ---------------------------------------------------------

    // Subtle corner bracket
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;

    ctx.beginPath();

    // Horizontal part
    ctx.moveTo(1045, 82);
    ctx.lineTo(1115, 82);

    // Vertical part
    ctx.moveTo(1115, 82);
    ctx.lineTo(1115, 150);

    ctx.stroke();

    // Smaller inner corner accent
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(1060, 92);
    ctx.lineTo(1103, 92);

    ctx.moveTo(1103, 92);
    ctx.lineTo(1103, 135);

    ctx.stroke();

    // ---------------------------------------------------------
    // TOP RIGHT DOT PATTERN
    // ---------------------------------------------------------

    ctx.fillStyle = "#2563eb";

    const dotStartX = 1000;
    const dotStartY = 105;
    const dotGap = 20;
    const dotRadius = 2.2;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const x = dotStartX + col * dotGap;
        const y = dotStartY + row * dotGap;

        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Slightly softer secondary dots
    ctx.fillStyle = "#93c5fd";

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const x = 1030 + col * dotGap;
        const y = 185 + row * dotGap;

        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---------------------------------------------------------
    // CODECLASH — TOP LEFT
    // ---------------------------------------------------------

    ctx.textAlign = "left";

    ctx.fillStyle = "#1d4ed8";
    ctx.font = "bold 42px Georgia, 'Times New Roman', serif";
    ctx.fillText("CodeClash", 105, 125);

    // ---------------------------------------------------------
    // SUBTITLE
    // ---------------------------------------------------------

    ctx.fillStyle = "#64748b";
    ctx.font = "600 13px Arial, Helvetica, sans-serif";
    ctx.letterSpacing = "2px";

    ctx.fillText("CERTIFICATE OF EXCELLENCE", 108, 151);

    // Reset letter spacing
    ctx.letterSpacing = "0px";

    // ---------------------------------------------------------
    // HEADER DECORATIVE LINE
    // ---------------------------------------------------------

    // Main short blue line
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(105, 170);
    ctx.lineTo(350, 170);
    ctx.stroke();

    // Small lighter extension
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(105, 176);
    ctx.lineTo(285, 176);
    ctx.stroke();

    // Small blue accent block
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(105, 168, 32, 4);

    // =========================================================
    // PRESENTED TO
    // =========================================================
    ctx.textAlign = "center";

    ctx.fillStyle = "#94a3b8";
    ctx.font = "20px Georgia, 'Times New Roman', serif";

    ctx.fillText("This certificate is proudly presented to", 600, 255);

    // =========================================================
    // PARTICIPANT NAME
    // =========================================================
    const displayName = (userName || "Developer").toUpperCase();

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 48px Georgia, 'Times New Roman', serif";

    let name = displayName;

    while (ctx.measureText(name).width > 700 && name.length > 10) {
      name = name.slice(0, -1);
    }

    if (name !== displayName) name += "...";

    ctx.fillText(name, 600, 310);

    // Elegant underline below participant name
    const nameWidth = Math.min(ctx.measureText(name).width, 700);

    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(600 - nameWidth / 2, 325);
    ctx.lineTo(600 + nameWidth / 2, 325);
    ctx.stroke();

    // =========================================================
    // PARTICIPATION & ROOM TITLE
    // =========================================================
    ctx.fillStyle = "#64748b";
    ctx.font = "19px Arial, Helvetica, sans-serif";

    ctx.fillText("For successfully competing in the coding battle", 600, 380);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 30px Georgia, 'Times New Roman', serif";

    let title = room.title || "Coding Challenge";

    while (ctx.measureText(title).width > 700 && title.length > 10) {
      title = title.slice(0, -1);
    }

    if (title !== (room.title || "Coding Challenge")) {
      title += "...";
    }

    ctx.fillText(title, 600, 420);

    // =========================================================
    // DESCRIPTION
    // =========================================================
    ctx.fillStyle = "#64748b";
    ctx.font = "17px Arial, Helvetica, sans-serif";

    ctx.fillText(
      "In recognition of your dedication, technical ability and commitment",
      600,
      465,
    );

    ctx.fillText("demonstrated throughout the challenge.", 600, 490);

    // =========================================================
    // RANK
    // =========================================================
    ctx.fillStyle = "#1d4ed8";
    ctx.font = "bold 18px Arial, Helvetica, sans-serif";
    ctx.fillText(
      `FINAL RANK #${rank} OF ${totalParticipants}`,
      600,
      520,
    );

    // =========================================================
    // MAIN DIVIDER
    // =========================================================
    ctx.strokeStyle = "#c9c6c6";
    ctx.lineWidth = 0.5;

    ctx.beginPath();
    ctx.moveTo(150, 540);
    ctx.lineTo(1050, 540);
    ctx.stroke();

    // =========================================================
    // DATE & SIGNATURE SECTION
    // =========================================================

    // Date (Left)
    ctx.textAlign = "left";

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 14px Arial, Helvetica, sans-serif";

    ctx.fillText(
      new Date(result?.completedAt || Date.now()).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      180,
      635,
    );

    ctx.fillStyle = "#64748b";
    ctx.font = "10px Arial, Helvetica, sans-serif";

    ctx.fillText("DATE OF COMPLETION", 180, 655);

    // Signature (Right)
    ctx.textAlign = "right";

    ctx.fillStyle = "#0f172a";
    ctx.font = "italic 23px 'Brush Script MT', 'Segoe Script', cursive";

    ctx.fillText("CodeClash Team", 1020, 635);

    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 0.5;

    ctx.beginPath();
    ctx.moveTo(850, 652);
    ctx.lineTo(1020, 652);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "10px Arial, Helvetica, sans-serif";

    ctx.fillText("VERIFIED SYSTEM", 1020, 655);

    // =========================================================
    // FOOTER DIVIDER & TEXT
    // =========================================================
    ctx.textAlign = "center";

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(150, 650);
    ctx.lineTo(1050, 650);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px 'Courier New', monospace";

    ctx.fillText("CODECLASH • COMPETE • CODE • CONQUER", 600, 695);

    ctx.textAlign = "left";
  }, [rank, result?.completedAt, totalParticipants, userName, room.title]);

  useEffect(() => {
    if (!isOpen) return;

    requestAnimationFrame(() => {
      drawCanvas();
    });
  }, [isOpen, drawCanvas]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");

    link.download = "codeclash-certificate-" + Date.now() + ".png";

    link.href = canvas.toDataURL("image/png");

    link.click();

    setDownloaded(true);

    setTimeout(() => {
      setDownloaded(false);
    }, 2000);
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "15px",
        backdropFilter: "blur(5px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(900px, 95vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 16,
          padding: "20px",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.65)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <h2
              style={{
                color: "#f8fafc",
                fontSize: 16,
                fontFamily: "monospace",
                margin: 0,
              }}
            >
              CodeClash Certificate
            </h2>

            <p
              style={{
                color: "#64748b",
                fontSize: 11,
                fontFamily: "monospace",
                margin: "2px 0 0",
              }}
            >
              Your battle achievement certificate
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: "1px solid #1e293b",
              background: "#1e293b",
              color: "#94a3b8",
              fontSize: 15,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            ✕
          </button>
        </div>

        {/* CERTIFICATE PREVIEW CONTAINER */}
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            overflow: "hidden",
            borderRadius: 8,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              maxWidth: "840px",
              height: "auto",
              aspectRatio: "3 / 2",
              display: "block",
              borderRadius: 6,
              boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
            }}
          />
        </div>

        {/* DOWNLOAD BUTTON */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 16,
          }}
        >
          <button
            onClick={handleDownload}
            style={{
              background: downloaded ? "#059669" : "#2563eb",
              color: "#ffffff",
              border: "none",
              padding: "10px 24px",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "monospace",
              cursor: "pointer",
              fontWeight: 600,
              boxShadow: downloaded
                ? "0 4px 10px rgba(5,150,105,0.3)"
                : "0 4px 10px rgba(37,99,235,0.3)",
              transition: "all 0.2s ease",
            }}
          >
            {downloaded ? "Certificate Downloaded" : "Download Certificate PNG"}
          </button>
        </div>
      </div>
    </div>
  );
}
