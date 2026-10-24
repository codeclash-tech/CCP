const EVENT_WEIGHTS = Object.freeze({
  FULLSCREEN_EXIT: 10,
  TAB_SWITCH: 10,
  WINDOW_BLUR: 10,
  COPY_ATTEMPT: 15,
  PASTE_ATTEMPT: 15,
  DEVTOOLS_OPEN: 20,
  KEYBOARD_SHORTCUT: 10,
});

export function calculateIntegrityRisk(events = []) {
  const riskScore = Math.min(
    100,
    events.reduce(
      (score, event) =>
        score + (EVENT_WEIGHTS[event.eventType] || 0) +
        (event.sequenceGapBefore > 0 ? 20 : 0),
      0,
    ),
  );
  return {
    riskScore,
    riskLevel:
      riskScore >= 60 ? "HIGH" : riskScore >= 25 ? "MEDIUM" : "LOW",
  };
}
