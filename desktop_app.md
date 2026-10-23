# CodeClash Platform and Desktop Application

## 1. Purpose and scope

CodeClash is a coding-assessment platform for candidates, organization
participants, assessment creators, and administrators. It combines:

- A React web application and a Windows Electron desktop application.
- A Node.js and Express API that owns authentication, assessment rules,
  persistence, authorization, scoring, and reporting.
- A separate Java execution engine used by the API and bundled with the
  desktop client for immediate local feedback.
- MongoDB as the application database.

The desktop app is the primary installable product, but it is not a standalone
or offline replacement for the platform's backend. Users sign in to the
configured CodeClash API; authoritative assessment state and final scores are
server-owned. The web app and desktop app share the React renderer and most of
the same API contracts.

This document describes the implementation in this repository. It does not
describe hypothetical features or treat the local desktop execution engine as
a trusted server.

## 2. Product capabilities

### Candidate and participant experience

- Create and verify an account using an email verification code, or sign in
  with an existing email and password.
- View the authenticated dashboard and profile.
- Join and participate in scheduled Battle Rooms.
- Read questions, edit Java code in the Monaco-based editor, run visible test
  cases, and submit solutions.
- View Battle Room results and leaderboards, global assessment rankings, and
  available certificates.
- Participate in the current daily global challenge and review cycle history,
  recoverable submissions, and certificates where applicable.
- Use organization membership and rankings when associated with an active
  organization profile.

### Organization experience

- Use an organization account and organization-specific navigation.
- Create or maintain an organization profile where authorized.
- Create and manage the creator-owned Battle Rooms exposed by the current room
  APIs.
- Review organization assessment history, rankings, and certificates.

### Super Admin experience

- Configure the server-owned global challenge and weekly assessment cycle.
- Manage question assignments, rosters, candidate and organization status,
  organization assignments, disqualifications, finalization, rankings, and
  certificates.
- Manage the platform's challenge catalog and access administrative pages.

Super Admin privileges come from the persisted server-side `ADMIN` role, not
from a client-provided email, display name, or role claim.

### Battle Room creator experience

- Complete creator verification where required.
- Compose a room with question text, signatures, starter code, examples,
  constraints, visible and hidden tests, and reference-solution tooling.
- Configure room scheduling, duration, participation settings, and related
  room controls supported by the creation flow.
- Start, share, reuse, close, and inspect rooms through the authorized creator
  APIs.
- Review participants and results, and use available reports, exports, email
  delivery, and room certificates.

The precise editable fields and lifecycle rules are implemented by the
frontend room workflows and backend room validators/controllers.

## 3. Applications and service boundaries

```text
Windows desktop app                          Web app
┌───────────────────────────────┐     ┌──────────────────────────┐
│ Electron main process         │     │ React 19 + Vite          │
│  ├─ packaged React renderer   │     │  ├─ React Router         │
│  ├─ isolated preload bridge   │     │  ├─ Axios API client     │
│  ├─ secure token persistence  │     │  └─ Monaco code editor   │
│  └─ bundled Java 21 runtime   │     └────────────┬─────────────┘
│       └─ local Java engine    │                  │ HTTPS/REST
└──────────────┬────────────────┘                  │
               │ HTTPS/REST                        │
               └──────────────────┬────────────────┘
                                  ▼
                     ┌────────────────────────┐
                     │ Node.js / Express API  │
                     │ Auth, policy, scoring, │
                     │ judging, reporting     │
                     └───────┬────────┬───────┘
                             │        │ HTTP + server credential
                             ▼        ▼
                         MongoDB   Secure Code Engine
                                   (Spring Boot / Java)
```

### React renderer

`frontend/` contains the React single-page application. Its route tree,
role-specific access checks, and navigation are under `frontend/src/routes/`.
The renderer uses the same API client and application screens in browsers and
Electron. It detects the desktop preload bridge and uses hash-based routing
for Electron; browser builds use browser-history routing.

Important frontend areas:

| Area | Responsibility |
|---|---|
| `src/pages/AuthPage.jsx` and auth services/context | Login, registration, email verification, session restoration, profile and sign-out flows |
| `src/pages/BattleRoom.jsx` | Room discovery, join and creator room actions |
| `src/pages/CreateBattleRoom.jsx` | Creator onboarding and room/question authoring |
| `src/pages/BattleRoomChallenge.jsx` | Timed room, question/editor workflow, run and submit |
| `src/pages/BattleRoomLeaderboard.jsx` | Room result and ranking presentation |
| `src/pages/WeeklyAssessment.jsx` | Candidate-facing daily global challenge |
| `src/pages/WeeklyRankings.jsx` | Global assessment rankings |
| `src/pages/CertificateLibrary.jsx` | Candidate/organization certificate library |
| `src/pages/GlobalChallengeAdmin.jsx` and `AdminQuestions.jsx` | Super Admin challenge, cycle, question, roster, and results surfaces |
| `src/pages/Profile.jsx` | User profile management |
| `src/services/api.js` | Axios transport, bearer token attachment, refresh handling, request IDs, and safe API error messages |
| `src/services/localExecutionService.js` | Routes supported local execution requests through the desktop bridge when running in Electron |

### Electron desktop shell

`desktop/` packages the renderer and starts the bundled Java engine. The
Electron main process owns engine startup/shutdown, the API key for the local
engine, local execution IPC, desktop assessment submissions, and encrypted
authentication-token persistence.

The main process exposes a deliberately small preload bridge rather than
enabling Node.js access in the renderer. Browser-window isolation, navigation
checks, context isolation, sandboxing, and window-open restrictions protect
the renderer boundary.

Packaged renderer files are served from the privileged, secure custom origin
`codeclash://app`. The backend explicitly allows this origin for credentialed
desktop API requests. The origin is intentionally not `file://` (which
serializes to the opaque browser origin `null` and fails the production CORS
allowlist).

### Node.js backend

`backend/src/server.js` creates the Express API, connects to MongoDB before
accepting application traffic, initializes the configured Super Admin and
assessment eligibility history, starts cleanup work, and mounts API routes.
The backend is the authority for account roles, access policy, assessment
windows, hidden cases, submissions, ranking and certificate records.

### Secure Code Engine

`secure-code-engine/` is a separate Maven/Spring Boot Java service. The backend
uses it for server-side execution; the desktop package contains a built engine
JAR and a trimmed Java 21 runtime including `javac` for local execution. This
is a separate Git repository nested in the workspace, not a backend module
managed by Node.

In the packaged desktop app, Super Admin global-question authoring runs the
reference solution against its visible and hidden cases using this local engine
and sends the generated outputs to the API. The backend stores the result
without running that reference solution again for this trusted desktop-origin
admin request. Web authoring retains server-side reference validation. The
local authoring check is a workflow check, not a substitute for server-side
judging participant submissions.

## 4. Desktop assessment and judging workflows

### Local Run (feedback)

1. The renderer requests execution through the narrowly scoped preload bridge.
2. The Electron main process validates and bounds the Java request.
3. The packaged Java engine runs on a dynamically selected loopback port
   (`127.0.0.1`) with a random API key held in the main process.
4. Local Run executes the visible test cases and returns feedback to the
   renderer.

The local run is for responsive feedback. Because the candidate controls their
own computer and desktop process, client-generated results are not trusted for
awarding marks.

### Battle Room Submit

1. The authenticated participant requests a one-use desktop execution grant
   from the backend.
2. The grant contains only data required for local visible-test feedback and
   is bound to the authorized source/submission context.
3. The desktop executes the visible cases locally and submits the source and
   authorization to the backend.
4. The backend validates and consumes the one-use authorization, independently
   judges the source with the server-side engine against server-held visible
   and hidden tests, and persists its own final result.
5. The candidate receives their permitted results; hidden inputs and expected
   outputs are not sent to the renderer. Participant serialization exposes
   only allowed hidden-case summaries.

The same server-authoritative model applies to final weekly assessment
submissions. A manipulated local engine or client result must not determine a
score.

### Web assessment execution

The browser client continues to use the existing backend execution routes.
Local desktop execution does not replace or change the web execution path.

### Desktop trust and security boundary

Local runtime hardening includes a managed workspace, bounded execution
requests, restricted inherited environment, and process lifecycle handling.
These controls reduce accidental exposure and misuse but are **not an
operating-system sandbox**. A local user can inspect or alter files and
processes on their own machine. Keep secret test data, final scoring, and
administrative decisions on the server.

## 5. Identity, authentication, and authorization

### Account and session lifecycle

- Registration stores a bcrypt-hashed password and uses an email OTP to verify
  the account.
- Password login checks the normalized account email, verified account state,
  and password hash.
- The API issues login/access and refresh credentials with server-managed
  sessions, refresh rotation, logout, logout-all, and session-list support.
- The desktop stores authentication tokens encrypted using Electron
  `safeStorage` under the user's application-data directory. It does not
  store the account password.
- Token restoration and refresh use the shared renderer API client and
  backend session APIs.
- Password reset and creator verification use separate OTP purposes.

Super Admin bootstrap is performed by the backend at startup, after the
database is connected. `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` belong
only in the backend environment or deployment secret store; they must never be
embedded in the renderer or desktop package. When configured, the backend
creates or synchronizes the designated account, sets its administrator role,
and ensures it is verified and active.

### Assessment roles

The frontend uses the assessment-role vocabulary below for navigation and
client-side route presentation:

| Assessment role | Typical capabilities |
|---|---|
| `CANDIDATE` | Take assessments, join permitted rooms, inspect own results and profile |
| `ORGANIZATION_USER` | Organization participant/creator flows, organization history and rankings |
| `SUPER_ADMIN` | Global challenge administration, roster/candidate/organization management, rankings and finalization |

The persisted user schema uses `USER` and `ADMIN`; `ADMIN` maps to
`SUPER_ADMIN`. Organization-user access is based on server-owned user and
organization attributes. The backend performs authorization independently;
frontend route guards are usability controls, not the security boundary.

Creator capabilities additionally depend on creator verification, ownership,
and room authorization rules. A client role claim alone is insufficient.

## 6. Main user journeys

### Sign in or register

Open the desktop app or website, register and verify an email account if it is
new, or sign in with the existing password. The API restores the session and
returns the server-derived account/assessment role. A Super Admin must already
be provisioned by the backend deployment configuration.

### Create and run a Battle Room

1. A verified creator opens the Battle Rooms area and starts room authoring.
2. The creator prepares questions and test cases and configures the room.
3. The backend validates and saves the room and its room code.
4. The creator shares the room credentials with participants and starts or
   schedules the assessment.
5. Candidates join, work within the server-authoritative room window, run
   visible tests, and submit solutions.
6. The server records final results; room participants can view permitted
   results and rankings. The creator can close the room and use available
   reports/certificate/result-delivery workflows.

### Run the global challenge

Super Admin configuration identifies the global challenge, timezone, start
time, and questions. The assessment service resolves the active 24-hour cycle
in `Asia/Kolkata`, freezes eligibility/roster data for a cycle, accepts
server-validated submissions, supports eligible retry/recovery paths, and
finalizes results after the recovery window when applicable. Candidate and
organization rankings and certificates are generated from persisted
server-side records.

Although some UI terminology calls this a weekly assessment, the current cycle
implementation uses a 24-hour recurring cycle and assigns exactly one question
per cycle/day. Cycle models retain the weekly assessment feature naming.

### Scoring and ranking

- Battle Room order is based on authoritative persisted submission outcomes
  and the room-ranking tie breakers (score, passed/failed results, solve time,
  then name).
- Global assessment individual ranking uses score, completed questions,
  submission time, and candidate ID for deterministic tie breaking.
- Organization rankings use a fixed shrinkage value `k = 5` to blend the
  organization's mean with the cycle mean:

  ```text
  final organization score =
    (eligible candidates × organization mean + 5 × cycle mean)
    / (eligible candidates + 5)
  ```

- Eligibility and organization/member snapshots preserve the cycle's ranking
  basis. Missed participants remain in the frozen eligible roster; a
  disqualified participant's score is zero.
- Certificate issuance and access are controlled by the backend and persisted
  cycle/assessment records.

## 7. Screens and navigation

The current route tree is in `frontend/src/routes/AppRouter.jsx`.

| Route | Purpose |
|---|---|
| `/login`, `/register` | Sign-in, registration, verification, and related account flows |
| `/` | Role-aware platform/dashboard entry |
| `/about`, `/terms` | Product and legal information |
| `/battle-room` | Joined and creator-owned room hub |
| `/battle-room/create` | Room and question authoring |
| `/battle-room/:roomCode/edit` | Creator room edit surface where supported by the current API |
| `/battle-room/:roomCode/participants` | Authorized room participant management |
| `/battle-room/:roomCode` and `/challenge` | Timed room assessment and editor |
| `/battle-room/:roomCode/leaderboard` | Room results and leaderboard |
| `/weekly-assessment` | Candidate-facing daily global challenge |
| `/rankings` | Global/cycle rankings |
| `/certificates` | Available certificate library |
| `/profile` | User profile |
| `/admin/weekly-assessment` | Super Admin global challenge/cycle administration |
| `/admin/questions` | Super Admin question catalog |
| `/admin/rankings` | Super Admin ranking/results views |

The desktop application uses the same React route/screens; it does not
implement a separate second assessment frontend.

## 8. HTTP API overview

The backend base prefix is `/api`. The shared controllers, middleware,
validators, and route definitions are under `backend/src/`.

| Route group | Main responsibilities |
|---|---|
| `/api/health` | API/database readiness |
| `/api/auth` | Registration OTP, password login/reset, refresh, session management, profile |
| `/api/creator-verification` | Creator verification OTP |
| `/api/platform` | Public platform stats/partners and creator-profile operations |
| `/api/challenges` | Challenge list/details, daily challenge, stats, and Super Admin-authorized challenge CRUD |
| `/api/execute` | Nonce, authenticated run/submit, judge health |
| `/api/submissions` | Submission history/results and administrative disqualification/callback handling |
| `/api/leaderboard` | Global, candidate, and challenge leaderboard queries |
| `/api/analytics` | Authorized submission/editor analytics and suspicious-activity review |
| `/api/battle-rooms` | Room authoring, ownership, join, participation, run/submit, results, reports and certificates |
| `/api/weekly-assessments` | Daily-cycle submissions/history, rankings, certificates, organizations, and Super Admin operations |

Route-level authorization and request validation are defined in backend routes
and controllers. API paths are versionless; clients are configured with an
`/api` base URL.

## 9. Data and persistence

MongoDB is the platform's application store, accessed through Mongoose models
under `backend/src/models/`. Important collections include:

| Model | Purpose |
|---|---|
| `User` | Account, password hash, verification, role, organization references and eligibility history |
| `Otp` / `CreatorVerificationOtp` | Hashed, expiring verification and recovery codes |
| `Session` | Refresh-token/session lifecycle |
| `Challenge` | Challenge descriptions, starter code, signatures, and visible/hidden tests |
| `BattleRoom` | Room configuration and question/authoring snapshots |
| `BattleRoomSubmission` | Authoritative participant attempts/results and certificate snapshots |
| `Submission` | Challenge submission data |
| `Nonce` | One-use execution and desktop submission authorizations |
| `GlobalChallenge` | Configured global challenge and question set |
| `WeeklyCycle` | 24-hour assessment cycles, assignments, roster snapshot, and rankings |
| `WeeklyRosterEntry` / `WeeklySubmission` | Per-cycle participant eligibility and submissions |
| `OrganizationProfile` / `OrganizationMembership` | Organization ownership, status, and dated membership history |
| `WeeklyCertificate` | Server-issued cycle certificate records |
| `AuditLog`, `Violation`, `SuspicionScore`, `EditorAnalytics` | Auditing, proctoring, and assessment integrity signals |

Mongoose schemas and model validations define the current runtime data
contract. The SQL and Prisma files in `database/` are reference artifacts; they
are not used as the active backend persistence implementation.

## 10. Integrity, security, and privacy

### API protections

- HTTPS for deployed clients and services.
- Helmet security headers and a restricted Content Security Policy.
- Explicit CORS allowlist for the web app, configured client, development
  origins when permitted, and the exact `codeclash://app` desktop origin.
- Request IDs, bounded JSON bodies, input sanitization, route validation, and
  rate limits.
- Password hashes (bcrypt), hashed one-time verification codes, JWT checks,
  refresh sessions, revocation, and server-side role/ownership checks.
- One-time nonces/grants and atomic consumption to deter replayed execution
  and desktop submission requests.
- Audit and activity records for selected authentication, admin, and
  assessment actions.

### Assessment integrity

- Assessment window, enrollment, ownership, roster, eligibility, and
  disqualification checks are enforced by the backend.
- Hidden test inputs and expected outputs remain server-side.
- Desktop local execution is never the score authority.
- The server independently executes final submissions and persists its own
  outcomes.
- Participant-facing serializers redact hidden source data and protected
  diagnostics.
- Browser proctoring and behavioral analytics provide integrity signals. They
  are not a substitute for server-side authorization or score validation.

### Operational secrets

Do not commit `.env` files, database connection strings, JWT secrets, email
provider keys, engine API keys, signing certificates, or administrator
passwords. Configure secrets using the backend's local ignored environment
file for development and the hosting provider's secret configuration for
production. The desktop package contains the public API URL and local engine
resources; it must not contain server credentials or super-admin passwords.

## 11. Repository layout

```text
coding-challenge-platform/
├── backend/                 Express API, Mongoose models, services, tests
├── frontend/                Shared React/Vite web and desktop renderer
├── desktop/                 Electron main/preload, packaging, desktop tests
├── secure-code-engine/      Separate nested Git repo; Java/Spring execution engine
├── database/                Reference SQL and Prisma schemas
├── docs/                    Architecture and desktop feature-parity research
├── render.yaml              Current Render static-frontend service configuration
├── README.md                Existing broad platform readme
├── SETUP.md                 Local setup instructions
└── desktop_app.md           This platform and desktop implementation guide
```

Backend and desktop have separate Node package manifests and lockfiles. The
frontend has its own manifest and lockfile. `secure-code-engine/` has an
independent Maven build and Git history/remote.

## 12. Local development

### Prerequisites

- Windows for the supported packaged x64 desktop installer.
- Node.js 20.19 or newer for the backend; the current installed Node version
  must also be supported by Electron/Vite dependencies.
- MongoDB, locally or remotely.
- Java 21 JDK and Maven for building/running the execution engine.
- Resend configuration when testing OTP and email-delivery flows.

### Install dependencies

Run commands from the repository root in PowerShell:

```powershell
Set-Location frontend
npm ci
Set-Location ..\backend
npm ci
Set-Location ..\desktop
npm ci
```

Build or run the engine separately:

```powershell
Set-Location secure-code-engine
mvn test
mvn package
```

### Configure and start services

1. Configure the required backend environment variables. Keep all real values
   in an ignored local environment file or deployment secrets.
2. Start MongoDB.
3. Start the execution engine using its documented Spring configuration.
4. Start the API:

   ```powershell
   Set-Location backend
   npm run dev
   ```

5. Start the web renderer:

   ```powershell
   Set-Location frontend
   npm run dev
   ```

6. Start the desktop application:

   ```powershell
   Set-Location desktop
   npm run dev
   ```

The desktop development workflow uses the renderer's development API URL and
requires Java 21. The packaged desktop build embeds its API URL at build time.

## 13. Production builds and deployment

### Web application

The current root `render.yaml` describes a Render **static frontend** service:
it installs frontend dependencies, runs the Vite production build, publishes
`frontend/dist`, and rewrites application routes to `index.html`. It does not
provision the backend, MongoDB, Resend, or the secure engine.

### Backend and execution engine

The Node API and Java execution engine are separately deployed services. They
require service-specific deployment configuration, network access, and
secrets. Backend production settings include MongoDB, distinct JWT secrets,
HTTPS client origin, mail configuration when email flows are enabled, and
engine URL/API-key configuration. Do not infer successful backend deployment
from the static frontend Render configuration.

### Build a Windows desktop release

The desktop release script builds the production React renderer, packages the
Java engine, prepares a reduced Java 21 runtime with `jlink`, and invokes
electron-builder to create the x64 NSIS installer:

```powershell
$env:JAVA_HOME = 'C:\Path\To\Java\jdk-21'
Set-Location desktop
npm ci
Set-Location ..\frontend
npm ci
Set-Location ..\desktop
npm run package:win
```

The default packaged API is:

```text
https://ccp-backend-qylz.onrender.com/api
```

For an intentional alternate API, set the build-only variable before packaging:

```powershell
$env:CODECLASH_API_URL = 'https://your-api.example/api'
npm run package:win
Remove-Item Env:CODECLASH_API_URL
```

`CODECLASH_API_URL` is embedded in the renderer bundle; it is not a runtime
backend override. Rebuild and redistribute the installer to change the
endpoint. The installer and unpacked application are emitted under
`desktop/release/` and must not be committed to the source repository.

For customers, provide a signed installer where possible. Without a trusted
Windows code-signing certificate, Windows may show publisher/SmartScreen
warnings. Signing credentials must be stored in the release environment, not
in source.

### Deployment checklist

- Deploy compatible backend and engine versions and check their health.
- Configure the deployed super-admin account and other secrets in the backend
  host, not in desktop build variables.
- Confirm the API CORS allowlist includes the web app and `codeclash://app`.
- Build the desktop renderer with the intended public API URL.
- Confirm the package includes the renderer, engine JAR, `java.exe`, and
  `javac.exe`.
- Install on a clean Windows x64 machine; test sign-in, restart/session
  restoration, local Run, server-authoritative Submit, Battle Rooms, global
  assessment, rankings, and certificates.
- Validate upgrade/install behavior and code signing before public distribution.

## 14. Configuration reference

Variable names below describe configuration inputs only; never place secret
values in this document or in client-side files.

### Backend

| Variable | Use |
|---|---|
| `MONGODB_URI` | Required MongoDB connection |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Required, distinct signing secrets |
| `PORT`, `NODE_ENV`, `CLIENT_URL`, `API_PUBLIC_URL` | Service/runtime and public-origin configuration |
| `SECURE_CODE_ENGINE_URL`, `SECURE_CODE_ENGINE_API_KEY`, `SECURE_CODE_ENGINE_TIMEOUT_MS` | Server-side engine connection and request bounds |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Server-owned Super Admin bootstrap/synchronization |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email/OTP delivery |
| `JUDGE_CALLBACK_SECRET` | Optional judge callback authentication |
| `JWT_EXPIRY`, `JWT_REFRESH_EXPIRY`, `JWT_ISSUER` | Token policy |
| `OTP_EXPIRY_MINUTES`, `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS` | Verification-code policy |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `LOG_LEVEL` | API request control and logging |

Production configuration additionally validates the HTTPS client URL, JWT
secret strength/separation, and email settings.

### Desktop and renderer builds

| Variable | Use |
|---|---|
| `JAVA_HOME` | Java 21 JDK for development and the `jlink` release-runtime build |
| `CODECLASH_API_URL` | Optional build-time packaged API base URL; defaults to the hosted CodeClash API |
| `CODECLASH_RENDERER_URL` | Development-only Electron renderer URL |
| `VITE_API_URL` | Frontend development or build-time API base URL |

Never place service credentials in `VITE_*` values: Vite embeds them into
public browser/desktop assets.

## 15. Build, test, and validation commands

```powershell
# Backend API tests
Set-Location backend
npm test

# Renderer tests, lint, and production build
Set-Location ..\frontend
npm test
npm run lint
npm run build

# Electron tests
Set-Location ..\desktop
npm test

# Java engine tests
Set-Location ..\secure-code-engine
mvn test

# Windows installer
Set-Location ..\desktop
npm run package:win
```

Tests primarily exercise backend controller/service policies, desktop request
validation/local integration/auth storage, frontend role navigation, and Java
execution isolation. Passing unit tests do not replace end-to-end checks against
the deployed services and a clean Windows installation.

## 16. Current limitations and operational notes

- The desktop app requires network access to the configured backend for
  authentication and platform data. Bundled local Java execution does not make
  assessment records or scoring available offline.
- The desktop API endpoint is compile-time configuration. An installed
  customer build cannot be redirected to a different backend without a new
  build/release.
- Local code execution is defense in depth, not a sandbox against the local
  device owner.
- The code-signing certificate is not included in the repository; the built
  installer must be signed by the release pipeline/customer publisher if a
  trusted publisher identity is required.
- `render.yaml` configures the static frontend only. Backend, data store,
  email provider, and Java engine lifecycle must be provisioned and operated
  separately.
- The global cycle implementation uses 24-hour `Asia/Kolkata` bounds and a
  fixed single-question cycle assignment; “weekly” remains in some feature and
  model names.
- The Prisma and SQL files are reference schemas and may not mirror the current
  Mongoose models.
- The worktree includes a separately versioned secure engine repository;
  coordinate its source/deployment release independently from the CCP repo.

## 17. Source map

| Concern | Main source |
|---|---|
| Express initialization and route mounts | `backend/src/server.js` |
| Backend environment and persistence configuration | `backend/src/config/` |
| Authentication, sessions, roles, Super Admin bootstrap | `backend/src/services/authService.js`, `backend/src/services/tokenService.js`, `backend/src/services/superAdminBootstrapService.js`, `backend/src/middleware/` |
| HTTP contracts | `backend/src/routes/` |
| Battle Room rules/results | `backend/src/controllers/battleRoomController.js`, `backend/src/services/battleRoomRanking.js`, `backend/src/models/BattleRoom*.js` |
| Daily/weekly global assessment | `backend/src/services/weeklyAssessmentService.js`, `backend/src/utils/weeklyAssessment.js`, `backend/src/models/Weekly*.js` |
| Server-side engine adapter | `backend/src/services/executionService.js` |
| Shared renderer screens and route access | `frontend/src/pages/`, `frontend/src/routes/` |
| Shared API client and session handling | `frontend/src/services/api.js`, `frontend/src/services/authService.js`, `frontend/src/context/AuthContext.jsx` |
| Electron lifecycle, renderer protocol and local engine | `desktop/src/main/index.js`, `desktop/src/main/rendererProtocol.js`, `desktop/src/main/localEngine.js` |
| Electron preload bridge and secure token store | `desktop/src/preload/index.cjs`, `desktop/src/main/secureAuthStore.js` |
| Desktop packaging scripts | `desktop/scripts/`, `desktop/package.json` |
| Java engine | `secure-code-engine/src/main/java/com/amux/engine/` |
| Static frontend hosting configuration | `render.yaml` |
