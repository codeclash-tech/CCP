# CodeClash Desktop Assessment — Stage 1 Architecture Analysis

## Scope and as-is boundaries

This is a source inspection of the current worktree for Stage 1. No application code, configuration, or dependency manifests were changed, and no build or test suite was run. The repository already had unrelated/uncommitted changes when inspected; the report describes the checked-out worktree, not a clean-HEAD baseline. In particular, `secure-code-engine/` is present but is untracked in Git, and the backend execution service and documentation files are already modified.

No `.env` values or credentials are reproduced here. Environment variable names only are listed below.

## 1. Architecture map

```text
Current web product
┌──────────────────────────────┐
│ React 19 + Vite SPA           │
│ BrowserRouter, Axios, Monaco  │
└─────────────┬────────────────┘
              │ HTTPS/HTTP REST + JWT
              ▼
┌──────────────────────────────┐
│ Node 20 + Express API         │
│ auth, rooms, challenges,      │
│ judging adapter, results      │
└──────────┬─────────────┬─────┘
           │             │ Mongoose
           │ REST        ▼
           │       ┌─────────────┐
           │       │ MongoDB     │
           │       └─────────────┘
           ▼
┌──────────────────────────────┐
│ Spring Boot Java engine       │
│ REST → queue → validate →     │
│ workspace → compile/run →     │
│ compare outputs → response    │
└──────────────────────────────┘
```

The React renderer currently calls the backend, not the Java engine. The backend’s `ExecutionService` calls the engine over HTTP and supplies its API key. Production defaults point at Render; development defaults point at port 8080. The Java engine has no current Electron lifecycle owner or installer integration.

The intended desktop boundary can preserve the existing React pages and backend:

```text
React renderer ↔ allowlisted preload IPC ↔ Electron main
                                             ├── managed local Java engine
                                             └── HTTPS backend API ↔ MongoDB
```

The renderer should receive public problem data and the result fields it needs. Protected judge data should not enter ordinary React state. Desktop local execution receives visible cases only; the backend keeps hidden cases and independently re-executes submissions for authoritative scoring. This avoids relying on a candidate-controlled desktop process for assessment integrity.

## 2. Project and dependency map

The repository is a full-stack, multi-package product rather than a workspace with one root build. `backend/` and `frontend/` have separate `package.json` and lockfiles. The root has no `package.json`; its lockfile has an empty `packages` object. There is no Electron package, main process, preload, or Windows installer configuration.

| Area | Existing stack and role |
|---|---|
| Frontend | React/React DOM `^19.2.7`, React Router `^7.3.0`, Vite `^8.1.1`, Axios `^1.7.9`, Lucide icons. JSX/ES modules; no TypeScript compiler or frontend test script is declared. |
| Backend | Node `>=20.19.0`, Express `^4.21.2`, Mongoose `^8.9.5`, JWT `^9.0.2`, bcryptjs `^2.4.3`, validation/rate-limit/Helmet middleware, node-cron, PDFKit, ExcelJS, Resend, and UUID. Controllers access Mongoose models directly; there is no separate repository layer. |
| Execution engine | Java 21, Maven, Spring Boot `3.5.6`, Spring MVC/Web, Bean Validation, SpringDoc `2.8.6`, Lombok, JUnit/Spring test starter. It is a separate REST service, with no MongoDB dependency. |
| Persistence | MongoDB through Mongoose is the live application persistence layer. |
| Reference schemas | `database/schema.prisma` describes a MongoDB Prisma model but does not match current Mongoose fields. `database/schema.sql` explicitly calls itself a PostgreSQL-compatible reference and is not the live schema. |

The frontend’s Monaco editor is loaded from jsDelivr at runtime rather than bundled. An offline-capable desktop build must package the editor assets locally. The existing renderer only enables Java coding; the engine has adapters for Java, C, C++, and Python, but that wider engine capability is not a current product contract.

The Java engine resolves `javac` and `java` from configured commands/PATH by default. Since it compiles submitted Java source, a candidate install needs a controlled JDK/compiler runtime, not merely a JRE, unless the compile mechanism is changed. The current engine Docker configuration defaults to disabled.

## 3. Current execution and assessment flows

### Authentication and profile

1. React uses Axios against the configured backend API base URL.
2. Registration requests email OTP; OTP verification or password login issues access/refresh tokens and a session. Passwords are hashed by the `User` model’s bcrypt save hook. OTP records store a digest and have TTL cleanup.
3. The browser stores access/refresh tokens in `localStorage`; profile data is cached in `sessionStorage`. Axios attaches the access token and refreshes it on eligible 401 responses.
4. `authenticate` verifies the access token and reloads the `User` from MongoDB for protected routes. `requireRole` checks the database-backed role for admin routes.

Relevant source: `frontend/src/context/AuthContext.jsx`, `frontend/src/services/api.js`, `backend/src/services/authService.js`, `backend/src/middleware/auth.js`, `backend/src/middleware/rbac.js`.

### Normal Battle Room

1. A verified creator creates a room through `/api/battle-rooms/create`. The controller validates the room and its questions, stores question content and visible/hidden tests in embedded room questions, schedules the room, and returns a generated room code/key. The current creation path accepts up to 20 questions and requires at least three visible and one hidden test per question.
2. The creator starts the room or it becomes active according to its scheduled window. Starting auto-joins the creator. Other users join using the room code; the client currently sends an organization string with the join/start request.
3. The server gates room/question access and execution using the room schedule and server time. Participant serializers expose public question data, while creator serializers include authoring/test data.
4. The frontend keeps per-question drafts/results in `sessionStorage`, displays a countdown, and uses the existing Java editor. “Run” executes visible tests without persisting a final submission. In the desktop client, “Submit” first executes the visible cases locally, then sends the source and a one-use, code-bound authorization to the backend. The backend independently executes all visible and hidden cases through the existing judging service, calculates the authoritative score, and persists the result. Hidden test inputs and expected outputs remain server-side; participants receive only hidden pass/fail/timing summaries. Web submissions continue to use the existing server-side execution path.
5. Ending a test finalizes the participant status. Room closure calculates result/certificate data and dispatches result delivery; room and participant leaderboards, reports, Excel/PDF exports, and Battle Room certificates are already present.

Current room and participant status strings include `UPCOMING`, `ACTIVE`, `CLOSED`; and `PENDING`, `PROCESSING`, `COMPLETED`, `DISQUALIFIED`. Room ranking sorts by score, passed count, failed count, solve time, then name.

Relevant source: `backend/src/controllers/battleRoomController.js`, `backend/src/models/BattleRoom.js`, `backend/src/models/BattleRoomSubmission.js`, `backend/src/services/battleRoomClosureService.js`, `backend/src/services/battleRoomCertificateService.js`, `frontend/src/pages/BattleRoomChallenge.jsx`, `frontend/src/services/battleRoomService.js`.

### Engine call path and compile behavior

The backend execution adapter posts `{language, code, timeLimit, memoryLimit, testCases}` to `/api/v1/execute`, using `x-api-key`. The engine validates the request, queues the work, validates source, creates a temporary workspace, compiles, runs test cases, compares outputs, and deletes the workspace. The Java batch path compiles once in a workspace and then starts a Java process per test case. Engine request validation allows up to 50 test cases; time and memory settings are request-bounded. Process execution has timeout handling, output caps, and forced cleanup.

Important integration mismatch: the current backend `ExecutionService.execute()` sends one test case per engine HTTP request, with up to three concurrent requests. That bypasses the engine’s compile-once-per-submission batch path and causes repeat HTTP/compile overhead for multi-case judging. A desktop integration should preserve the engine’s batch request and stream progress without moving arbitrary OS command execution into React.

The engine currently executes host processes unless Docker is enabled. Java compile/runtime commands must resolve on the machine; the engine process does not yet have a desktop-managed lifecycle.

Relevant source: `backend/src/services/executionService.js`, `secure-code-engine/src/main/java/com/amux/engine/controller/ExecutionController.java`, `secure-code-engine/src/main/java/com/amux/engine/service/ExecutionService.java`, `secure-code-engine/src/main/java/com/amux/engine/pipeline/ExecutionPipeline.java`, `secure-code-engine/src/main/java/com/amux/engine/runner/BaseProcessRunner.java`.

### Existing daily challenge (not a weekly assessment)

The backend has a `Challenge` model, daily challenge endpoints, submissions, daily/global and per-challenge leaderboards, and administrator-only challenge authoring. Super-admin challenge creation attempts to place at most one challenge in a daily window, with a default 6 PM window. The window helper uses JavaScript local `Date` operations; it is not an `Asia/Kolkata` weekly-cycle implementation. If no challenge is found for the current window, `getTodayChallenge` falls back to the most recently active challenge.

There is no weekly-cycle entity, Monday–Sunday cycle state, day/question status model, weekly result snapshot, dedicated global weekly leaderboard, or weekly certificate flow in the current source.

## 4. MongoDB model and relationship map

The live models are Mongoose schemas; `ref` fields are logical ObjectId references and embedded schemas are stored inside their parent document.

| Model | Existing data and links |
|---|---|
| `User` | Email (unique/indexed), name, organization **string**, creator profile/partner fields, role (`USER`/`ADMIN`), bcrypt password hash, verification and aggregate scores. `organization` is not an `Organization` reference. |
| `Organization` | Unique name and aggregate participant/score/rank fields, with ranking indexes. It is not referenced by `User` or `BattleRoom`; leaderboard calculations upsert it by name. |
| `Challenge` | Daily/admin challenge with embedded visible/hidden/legacy tests and language/signature/reference-code maps; `createdBy` references `User`; indexes on slug/date/activity. `toUserJSON()` excludes hidden tests; admin serialization includes them. |
| `Submission` | `userId` → `User`, `challengeId` → `Challenge`; code, score, status, test-result array, timing and disqualification fields. Unique `(userId, challengeId)` and ranking/history indexes. |
| `BattleRoom` | `createdBy` → `User`; embeds questions, test cases, schedule, room status and participant email strings. It has no organization field/reference. Room code is unique; schedule/status indexes exist. |
| `BattleRoomSubmission` | `roomId` → `BattleRoom`, `userId` → `User`; embeds per-question result/test-result arrays, participant identity and organization strings, status, score, moderation, delivery and certificate snapshot. Unique `(roomId, userId)` and leaderboard indexes. |
| `Session` | `userId` → `User`, refresh-token/device/IP/user-agent/session state, expiry TTL index. |
| `Otp` | Email, OTP digest, purpose, optional `userId` → `User`, attempts and forensic fields; TTL configured at startup. |
| `CreatorVerificationOtp` | Email-keyed creator OTP digest, expiry TTL, attempts. |
| `Nonce` | `userId` → `User`, action/resource, used/expiry and replay-protection indexes/TTL. |
| `AuditLog` | Optional `userId` → `User`, action/resource/details/request and network metadata; action/user/date indexes and 90-day TTL. |
| `EditorAnalytics` | `userId` → `User`, `challengeId` → `Challenge`, optional `submissionId` → `Submission`; aggregate editor/focus/paste/automation metadata; one-year TTL. |
| `Violation` | `userId` → `User`, optional submission/challenge references, event/severity/details and one-year TTL. |
| `SuspicionScore` | Unique `userId` → `User`, optional `submissionId`, weighted factors and review fields. |

There is no Mongoose model for a separate assessment, weekly cycle, participant-cycle state, cycle-scoped result snapshot, certificate record, or integrity-event collection. Existing room results, challenge submissions, `Violation`, `EditorAnalytics`, and certificate snapshots/tokens provide partial reusable foundations; they do not represent the requested historical weekly cycle.

## 5. API surface map

The Express app mounts routes in `backend/src/server.js`; API base path is `/api`.

| Route group | Existing surface |
|---|---|
| `/auth` | OTP registration/verification/resend; password login/reset; refresh/logout; sessions; authenticated profile read/update. |
| `/challenges` | Today/list/by-id/stats; create/update/delete/archive/publish/duplicate. Admin middleware protects challenge authoring. |
| `/execute` | Authenticated nonce, run, and submit; engine health. |
| `/submissions` | Submit, history, result by challenge, judge callback result update (callback-secret middleware), admin disqualification. |
| `/leaderboard` | Global, user rank/today, per-challenge leaderboard, submission status. |
| `/analytics` | Authenticated analytics flush; admin submission/suspicion/challenge reports. |
| `/battle-rooms` | Authoring helpers; room create/start/join/list/read/delete/share/reuse; run/submit/end/disqualify; leaderboards/results; closure/result delivery; participant and room PDF/Excel reports; room certificates. |
| `/creator-verification` | OTP request/verify for creator verification. |
| `/platform` | Public stats/partner listing; authenticated creator/organization profile update. |
| `/health` | Backend dependency health; reports MongoDB connection status. |

There are no APIs yet for global weekly assessment discovery, current day/question, cycle state, separate weekly individual/organization rankings, immutable weekly result snapshots, weekly certificates, or a desktop integrity-event sync protocol.

## 6. Configuration and environment map

Only names are recorded; values are intentionally omitted.

| Component | Configuration names observed |
|---|---|
| Backend runtime | `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT`, `NODE_ENV`, `CLIENT_URL`, `API_PUBLIC_URL`, `LOG_LEVEL`, `JWT_EXPIRY`, `JWT_REFRESH_EXPIRY`, `JWT_ISSUER`. |
| Backend integrations/security | `RESEND_API_KEY`, `EMAIL_FROM`, `SECURE_CODE_ENGINE_URL`, `SECURE_CODE_ENGINE_TIMEOUT_MS`, `SECURE_CODE_ENGINE_API_KEY`, `JUDGE_CALLBACK_SECRET`, rate-limit settings. |
| Backend OTP/admin | `OTP_EXPIRY_MINUTES`, `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`. |
| Other keys present in env files | SMTP `EMAIL_HOST`/`EMAIL_PORT`/`EMAIL_USER`/`EMAIL_PASS`, Cloudinary and Razorpay key names. Not all are wired by the current `backend/src/config/env.js`. |
| Frontend build/runtime | `VITE_API_URL`, `VITE_BATTLE_ROOM_PERF_LOGS`. The API URL is public configuration; the frontend also has a hard-coded production backend fallback. Monaco CDN URLs are hard-coded in the editor component. |
| Engine | `SERVER_PORT`, workspace, execution/time/memory/output/test-case limits, queue/thread-pool sizing, Java compiler/runtime/JVM options, C/C++/Python tool settings, Docker options, history cleanup, and engine/client API-key settings in `application.yml`. |

The backend config currently requires MongoDB and JWT secrets, but does not define/validate `SUPER_ADMIN_PASSWORD`. The auth service promotes an account based on the configured super-admin email during its auth flow; there is no observed startup seeding path that hashes the configured password only when the account is absent. The current role vocabulary is `USER` and `ADMIN`, not the requested three roles.

## 7. Security and product-readiness observations

These are integration observations, not a full security audit.

- Backend route protection is meaningful: access tokens are verified, users are reloaded from MongoDB, and administrator route middleware checks the database role. Electron route hiding must not replace these checks.
- The current role model has only `USER`/`ADMIN`; the super-admin email is a special-case promotion, not a separate RBAC role or idempotent environment-driven password seed/update mechanism.
- Organization names are stored on the authenticated user as strings, but room start/join APIs accept the organization from the request body and persist it on the submission. The server should use the authenticated profile instead of trusting a submitted organization value.
- Hidden test serializers are separated from normal challenge/room payloads, desktop grants contain visible cases only, and room submit responses reduce hidden cases to status/timing rather than inputs/outputs. The backend intentionally retains the full room submission/code and judge details for creator reporting. Local execution is candidate feedback, not score evidence; backend re-execution is the score authority.
- The engine applies source validation, bounded output, process timeout/cleanup, workspace cleanup, a bounded work queue, and JVM memory flags. Docker is disabled by default; a host process is not an OS-level security sandbox, and source-pattern checks are not a substitute for one.
- The engine API-key filter protects non-public routes, but the engine config includes a development master-key fallback. Desktop packaging must not ship a reusable backend secret or rely on the renderer for a local engine credential. Bind the engine to loopback and have the main process own any short-lived local handshake.
- The current renderer stores bearer/refresh tokens in `localStorage`. Electron should keep Node/filesystem/shell access out of the renderer and consider OS-protected token storage; only a narrow preload API should be exposed.
- Monaco is fetched from a third-party CDN at runtime. That prevents a fully self-contained/offline editor and should be replaced by packaged assets for desktop.
- Current proctoring is browser-level: fullscreen, document visibility, window blur, copy/paste/context menu and shortcut events. It immediately disqualifies on a single event. It is not Electron-native focus monitoring and client-reported events can be tampered with. Existing analytics/violation models are useful, but must be treated as signals, not proof.
- Global leaderboard output currently includes candidate email. The desktop weekly individual leaderboard should expose only approved display fields.
- Daily challenge time windows use server time but local `Date` calendar operations rather than configured `Asia/Kolkata`; weekly active-day logic must be explicit and server-authoritative.
- Existing organization scoring is per challenge and updates a shared `Organization` document without a cycle key. The weekly result history requirement needs cycle-scoped immutable snapshots.
- Worktree caution: `secure-code-engine/` is untracked, and several tracked files are already modified/deleted. Confirm ownership and include the engine source intentionally before relying on it for a distributable build.

## 8. Desktop integration plan (Stage 2 onward)

1. **Electron foundation:** Add a separate Electron main/preload build around the existing Vite renderer. Keep the web app runnable. Set `contextIsolation: true`, `nodeIntegration: false` (and sandbox where compatible); deny arbitrary navigation/new windows; expose only allowlisted IPC. Preserve deep links with an app protocol/history fallback compatible with the existing `BrowserRouter`.
2. **Local engine lifecycle:** Package the Java engine and a controlled JDK/compiler runtime. Electron main should start one engine process, bind it to loopback, authenticate local requests without placing a permanent key in renderer assets, await health before enabling execution, and stop/clean it at shutdown. Keep the existing Java implementation and make IPC carry typed run/submit requests and structured progress/results.
3. **Batch judging and renderer boundary:** Adapt the desktop execution path to send all authorized cases in one engine request so Java compiles once and each case runs in the existing workspace. Keep test-case progress as streamed events. Return no hidden inputs, expected outputs, or actual output for hidden cases to React.
4. **Backend connectivity/authentication:** Keep HTTPS backend calls for login, assessment authorization/configuration, result sync, rankings, certificates, and integrity events. Preserve editor drafts on transient disconnect; queue bounded/retryable synchronization, but have the backend decide whether the assessment/session remains valid. Never put MongoDB/JWT signing/API-private secrets in the desktop renderer or installer.
5. **Organization profile:** Extend the authenticated profile flow, reuse existing profile fields, and make the backend derive organization identity for room/assessment participation. Retain existing room-key semantics for normal organization rooms.
6. **Super Admin/RBAC:** Add a distinct server-side Super Admin role and an idempotent password initialization path: create only when absent, hash with existing bcrypt mechanism, never overwrite an existing hash on startup, and require a separately authorized update operation. Keep role checks in every protected endpoint.
7. **Weekly assessment lifecycle:** Add persisted weekly-cycle state with explicit start/end dates, configured `Asia/Kolkata` date boundaries, status, day number, and active question. Build on existing questions/room question authoring where safe; do not introduce duplicate challenge data without checking its schema/contract. Backend—not the client clock—selects the one active daily question and cycle state.
8. **Ranking and history:** Store distinct individual and organization results per cycle, then persist an immutable finalized snapshot containing ranking-rule version, scores, completion/status, statistics, and eligibility. Never overwrite earlier weeks.

   **Candidate organization metric (proposal, not existing behavior):** Normalize each eligible candidate’s cycle score to `pᵢ ∈ [0,1]`; count missed/disqualified eligible candidates as zero so the mean reflects completion as well as performance. For organization `o`, compute its eligible-candidate mean `μₒ` and the cycle cohort mean `μ₀`, then rank by a prior-shrunk average:

   ```text
   org_score(o) = 100 × (nₒ × μₒ + k × μ₀) / (nₒ + k)
   ```

   `nₒ` is the number of candidates in the pre-defined cycle roster for that organization; `k` is the fixed prior strength (an initial proposal is 5 prior candidates). This uses an average rather than a total, so headcount alone cannot boost rank, and shrinkage reduces one-person/small-sample dominance. Freeze the roster definition, `k`, score normalization, and formula version at cycle creation and persist them in the final snapshot. Individual ranking remains separate, based on weekly score with deterministic tie-breaks. The roster and prior parameters are product decisions to confirm before implementation.

9. **Certificates:** Reuse existing server-side PDF generation patterns, but generate weekly certificates only from finalized server snapshots. Keep eligibility and certificate identifiers server-authoritative.
10. **Integrity controls:** Extend current browser signals with Electron main-process fullscreen/focus observations, a server-authorized assessment session, synchronized integrity events, and an authoritative timer/timeout submission path. Avoid OS-invasive monitoring; document that local execution is tamper-resistant, not perfectly secret.
11. **Windows packaging:** Produce one installer containing the UI, engine, and compiler runtime. Verify first-start engine health, second launch/restart, process shutdown/no orphan, temporary workspace cleanup, upgrade-ready resource layout, and behavior during interrupted connectivity.
12. **Regression/acceptance validation:** Preserve web login/profile, room create/join, authoring, visible and hidden judging, scores, leaderboards, reports and existing certificates. Then verify engine one/many/50-case batch execution, compilation/runtime/timeout/resource errors, all weekly boundaries, RBAC, sync recovery, IPC restrictions, hidden-test handling and the Windows installer. The tests listed in the repository are only a subset of the requested acceptance matrix; Stage 1 did not execute them.

## 9. Source navigation

- Frontend entry/routing: `frontend/src/main.jsx`, `frontend/src/routes/AppRouter.jsx`
- Auth/API/profile: `frontend/src/context/AuthContext.jsx`, `frontend/src/services/api.js`, `frontend/src/services/authService.js`, `backend/src/controllers/authController.js`, `backend/src/services/authService.js`
- Room UI/API/data: `frontend/src/pages/BattleRoomChallenge.jsx`, `frontend/src/pages/CreateBattleRoom.jsx`, `frontend/src/services/battleRoomService.js`, `backend/src/routes/battleRoomRoutes.js`, `backend/src/controllers/battleRoomController.js`, `backend/src/models/BattleRoom.js`, `backend/src/models/BattleRoomSubmission.js`
- Daily challenge/leaderboard: `backend/src/controllers/challengeController.js`, `backend/src/utils/challengeWindow.js`, `backend/src/services/leaderboardAlgorithm.js`
- Execution: `backend/src/services/executionService.js`, `backend/src/controllers/executeController.js`, `secure-code-engine/src/main/java/com/amux/engine/controller/ExecutionController.java`, `secure-code-engine/src/main/java/com/amux/engine/pipeline/ExecutionPipeline.java`
- Database references: `backend/src/models/`, `database/schema.prisma`, `database/schema.sql`
