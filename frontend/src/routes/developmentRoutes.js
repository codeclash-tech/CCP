export const DEVELOPMENT_ROUTES = {
  "/weekly-assessment": {
    title: "Daily Global Challenge",
    summary:
      "Participants complete the question assigned to the active, server-scheduled daily Global Challenge cycle.",
    backend: "Persisted Asia/Kolkata cycles and authoritative candidate submissions are available.",
    nextStep: "Validate scheduled cycles and submissions against the configured live backend.",
  },
  "/rankings": {
    title: "Rankings",
    summary:
      "Two live leaderboard tabs show active Battle Rooms and daily Global Challenge rankings.",
    backend:
      "Battle Room and global cycle rankings are retrieved from the backend and refreshed automatically.",
    nextStep:
      "Verify live updates and roster authorization against the configured backend.",
    relatedPath: "/battle-room",
    relatedLabel: "View Battle Room results",
  },
  "/certificates": {
    title: "Certificates",
    summary:
      "The library displays persisted Battle Room and weekly certificates, with server-side ownership checks and PDF downloads.",
    backend:
      "Battle Room and weekly certificate listing/download APIs return persisted server-authoritative snapshots.",
    nextStep:
      "Validate certificate generation and downloads using real finalized results in the packaged application.",
    relatedPath: "/battle-room",
    relatedLabel: "Open Battle Rooms",
  },
  "/settings": {
    title: "Settings",
    summary:
      "A general Desktop settings screen is not implemented. Authentication and profile settings remain available in their existing screens.",
    backend: "No general user-settings API was identified in the Phase A audit.",
    nextStep:
      "Define supported settings and their backend ownership before implementing this screen.",
    relatedPath: "/profile",
    relatedLabel: "Open Profile",
  },
  "/assessments/edit": {
    title: "Edit Assessment",
    summary:
      "Use My Rooms to select an owned, upcoming room and open its saved-room editor. Existing questions can be updated, reordered, added, or removed before participation.",
    backend:
      "Owner-authorized GET /api/battle-rooms/:roomCode/edit and PUT /api/battle-rooms/:roomCode APIs.",
    nextStep: "The server rejects edits after room start or candidate participation.",
    relatedPath: "/battle-room",
    relatedLabel: "Open My Assessments / Rooms",
  },
  "/participants": {
    title: "Participants / Invitations",
    summary:
      "Open My Rooms and choose Manage candidates for a room to view participants and update its email allowlist.",
    backend:
      "Owner-authorized room participant and allowlist APIs; candidate admission is checked server-side during join.",
    nextStep: "Existing participants retain access to their started submission when an allowlist is subsequently changed.",
    relatedPath: "/battle-room",
    relatedLabel: "Open My Assessments / Rooms",
  },
  "/admin": {
    title: "Global Challenge",
    summary:
      "Super Admin configures the initial Asia/Kolkata start time and ordered question rotation for daily global cycles.",
    backend: "Global challenge configuration and generated daily cycles are persisted server-side.",
    nextStep: "Manage selected questions at any time; edits take effect on upcoming cycles.",
  },
  "/admin/weekly-assessment": {
    title: "Global Challenge",
    summary:
      "Super Admin sets the initial start time and selects questions that rotate one per 24-hour cycle.",
    backend: "Global challenge configuration and generated daily cycles are persisted by the weekly assessment API.",
    nextStep: "Question additions and removals affect upcoming cycles while preserving the active cycle snapshot.",
  },
  "/admin/questions": {
    title: "Global Challenge Questions",
    summary:
      "Super Admin creates and maintains the saved questions used by the global daily rotation.",
    backend: "Admin-authorized question CRUD APIs validate reference solutions and test cases.",
    nextStep: "Select active questions on the Global Challenge setup page.",
  },
  "/admin/rankings": {
    title: "Global Challenge Rankings",
    summary:
      "Super Admin monitors current and previous global daily-cycle standings.",
    backend: "Cycle rankings are calculated from persisted submissions and refreshed automatically.",
    nextStep: "Verify results after the scheduled cycle closes.",
  },
};
