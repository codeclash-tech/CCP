# Implementation Plan: CodeClash Experience, Brand, and Eligibility

**Date**: 2026-10-25 | **Spec**: Direct user request in this session; no assessment requested

## Summary

Polish the CodeClash desktop and web experience while making certificate and ranking eligibility authoritative on the server. Implement the eligibility rules first: disqualified or incomplete participants receive no certificate; a participation certificate requires at least one passed test case; and a participant is ranked only when all test cases pass. Then update desktop navigation and page spacing, daily-challenge presentation, rankings navigation, registration/legal presentation, and user-facing terminology. Keep the changes within the existing React/Vite frontend, Express/Mongoose backend, and Electron desktop shell.

Do not reset, discard, or overwrite pre-existing work. The initial worktree inspection found changes in:

- `backend/src/controllers/weeklyAssessmentController.js`
- `backend/src/models/WeeklySubmission.js`
- `backend/test/weeklyLocalExecution.test.js`
- `desktop/src/main/desktopSubmission.js`
- `desktop/test/desktopSubmission.test.js`

The controller/model/test and desktop submission changes touch the Daily Challenge submission flow. Before implementation, inspect and preserve those diffs; coordinate any changes to those files rather than replacing them.

## Technical Context

**Language/Version**: JavaScript ES modules; backend requires Node.js `>=20.19.0`; frontend uses React and Vite; desktop shell uses Electron.  
**Primary Dependencies**: Express, Mongoose, React Router, Lucide icons, Electron.  
**Storage**: MongoDB through Mongoose; daily challenge results and certificates are represented by `WeeklySubmission`, `WeeklyRosterEntry`, `WeeklyCycle`, and `WeeklyCertificate`; Battle Room submissions and certificate snapshots have separate models/routes.  
**Testing**: Node’s built-in test runner. Existing relevant suites include `backend/test/weeklyAssessment.test.js`, `backend/test/weeklyCertificateAuthorization.test.js`, `backend/test/battleRoomRanking.test.js`, `backend/test/battleRoomCertificateLibrary.test.js`, plus frontend and desktop `node --test` suites.  
**Target Platform**: Browser and Windows Electron desktop application.  
**Constraints**:

- Server-persisted submission state is authoritative for ranking and certificate decisions; never trust a client-provided eligibility flag.
- Do not conflate a finalized submission with a fully passed submission.
- Hide scrollbar chrome without disabling wheel, touch, keyboard, or programmatic scrolling; do not interfere with the code editor’s own scrolling.
- Remove only demonstrably dead product code. Preserve useful tests, operational docs, source assets, release inputs, and generated/release assets unless evidence establishes they are unneeded.
- Keep operational/internal diagnostics distinct from user-facing copy. Do not erase useful internal logging or technical documentation merely to remove user-facing wording.

## Constitution Check

No project `constitution.md` was found in the inspected planning area. The plan follows the explicit constraints in the user request:

- **Preserve existing worktree changes**: Pass — inspect overlapping diffs before editing and re-check them at completion.
- **Server-side eligibility enforcement**: Pass — calculate eligibility from backend records and enforce it at ranking, issuance, listing, and download boundaries.
- **Avoid destructive cleanup**: Pass — cleanup is evidence-based and limited to clearly dead/unneeded code.
- **Preserve useful tests and operations material**: Pass — retain tests, operational docs, and release assets.
- **Brand consistency and usability**: Pass — use existing shared styles/components and verify responsive and accessible behavior.

## Applied Guidelines

No applicable technology-migration guideline is required. This is a product UI and server-side business-rule change, not a framework or platform migration.

## Implementation Steps

### Phase 1: Setup and preservation

#### Step 1.1: Establish safe implementation baseline
- **Requirements**: REQ-009, REQ-014
- **Description**: Re-read `git status` and inspect the existing diffs in the five modified files listed above. Trace the Daily Challenge result lifecycle and certificate/ranking consumers before changing shared code. Keep the original modifications intact; do not reset, checkout, or replace files wholesale.

Tasks:

- [ ] T001 [Plan:1.1] Reconfirm `git status` and review the existing Daily Challenge and desktop submission diffs in `backend/src/controllers/weeklyAssessmentController.js`, `backend/src/models/WeeklySubmission.js`, `backend/test/weeklyLocalExecution.test.js`, `desktop/src/main/desktopSubmission.js`, and `desktop/test/desktopSubmission.test.js`; record overlap points before edits.

### Phase 2: Server-authoritative eligibility (highest priority)

#### Step 2.1: Define eligibility from finalized server records
- **Requirements**: REQ-009
- **Description**: Trace how final test counts and result status are stored for Daily Challenge submissions and identify the equivalent authoritative fields for any other certificate/ranking flow affected by this request. Define shared server-side eligibility rules: disqualified or incomplete submissions are ineligible for certificates; participation eligibility requires `passed >= 1`; ranking eligibility requires a non-zero total and `passed === total`. Preserve the existing verification boundary and do not use client-only state.

#### Step 2.2: Enforce ranking eligibility
- **Requirements**: REQ-009
- **Description**: Apply the all-tests-passed rule when deriving ranked rows and ranked status, not only when rendering a leaderboard. Update the Daily Challenge ranking calculation in `backend/src/utils/weeklyAssessment.js` and the associated finalization/score synchronization in `backend/src/services/weeklyAssessmentService.js`. Trace `backend/src/services/leaderboardAlgorithm.js` and its controller consumers; update only the ranking flow that uses the requested policy, preserving unrelated ranking semantics.

#### Step 2.3: Enforce certificate issuance and access eligibility
- **Requirements**: REQ-009
- **Description**: Gate certificate creation and certificate-library/download access using server-derived eligibility. For Daily Challenge certificates, issue no certificate to disqualified, incomplete, or zero-pass participants; permit a participation certificate at one or more passed cases; reserve ranked certificate categories for all-tests-passed eligible participants. Inspect the Battle Room certificate path (`backend/src/controllers/battleRoomCertificateController.js`, `backend/src/services/battleRoomCertificateService.js`, and the server-side snapshot/closure path) and enforce the corresponding no-disqualified/no-incomplete rule wherever that path shares the requested policy. Do not delete historical records as a shortcut; prevent ineligible records from being newly issued or served and handle any stale record safely.

#### Step 2.4: Cover eligibility boundaries with backend tests
- **Requirements**: REQ-009
- **Description**: Add/update tests for boundaries at 0, 1, and all test cases passed; disqualification; missing/incomplete results; and repeat finalization/access. Verify API and certificate-library/download behavior as well as the pure ranking calculation.

Tasks:

- [ ] T002 [US1] [Plan:2.1] Trace finalized Daily Challenge and Battle Room result fields and document the authoritative server-side inputs used by ranking and certificate issuance; preserve existing local-execution and request-ID changes.
- [ ] T003 [US1] [Plan:2.1,2.2] Implement a reusable server-side Daily Challenge eligibility predicate based on persisted finalized result counts and disqualification state in `backend/src/utils/weeklyAssessment.js` or the existing domain service boundary; reject zero-total, incomplete, and non-finalized outcomes as ranked.
- [ ] T004 [US1] [Plan:2.2] Update Daily Challenge score synchronization and ranking aggregation in `backend/src/services/weeklyAssessmentService.js` and `backend/src/utils/weeklyAssessment.js` so only all-tests-passed, non-disqualified participants appear as ranked; ensure organization rankings derive only from eligible participants.
- [ ] T005 [US1] [Plan:2.3] Gate Daily Challenge certificate persistence and retrieval in `backend/src/services/weeklyAssessmentService.js` and the certificate endpoints in `backend/src/controllers/weeklyAssessmentController.js`; require at least one passed case for participation and all cases passed for ranked certificate categories.
- [ ] T006 [US1] [Plan:2.3] Trace and enforce the no-disqualified/no-incomplete certificate rule in the Battle Room issuance/list/download flow, using `backend/src/controllers/battleRoomCertificateController.js`, `backend/src/services/battleRoomCertificateService.js`, and the existing server-side certificate snapshot creation path; preserve each flow’s unrelated business rules.
- [ ] T007 [US1] [Plan:2.4] Extend `backend/test/weeklyAssessment.test.js` and `backend/test/weeklyCertificateAuthorization.test.js` with eligibility boundary, disqualification, incomplete-result, finalization-idempotency, and certificate access tests.
- [ ] T008 [US1] [Plan:2.4] Extend `backend/test/battleRoomRanking.test.js` and `backend/test/battleRoomCertificateLibrary.test.js` for any Battle Room behavior changed by the eligibility audit; test API/server behavior rather than UI-only hiding.

### Phase 3: Shared desktop navigation and page layout

#### Step 3.1: Improve desktop title/navigation hierarchy
- **Requirements**: REQ-001, REQ-002, REQ-013
- **Description**: Increase the desktop app navigation/title bar height, improve logo scale/alignment/visibility, and create comfortable separation between the welcome/name treatment and the navigation links. Keep the layout responsive and avoid reducing space needed by the page body.

#### Step 3.2: Standardize gutters and hide scrollbar chrome accessibly
- **Requirements**: REQ-004, REQ-006, REQ-013
- **Description**: Establish shared horizontal page-gutter tokens/rules and apply them consistently to primary page containers. Hide visible scrollbar tracks/thumbs app-wide while retaining scrolling on document, nested page, navigation, and editor surfaces.

Tasks:

- [ ] T009 [US2] [Plan:3.1] Update the shared navbar markup in `frontend/src/components/layout/Navbar.jsx`, desktop welcome/navigation markup in `frontend/src/components/layout/RoleNavigation.jsx`, and shell styles in `frontend/src/index.css` to increase desktop title/navigation height and improve logo alignment/visibility and welcome-to-link spacing.
- [ ] T010 [US2] [Plan:3.2] Define and apply consistent responsive horizontal gutters in `frontend/src/index.css` and `frontend/src/styles/productPages.css`, then reconcile page-specific overrides without changing intentional editor/table layouts.
- [ ] T011 [US2] [Plan:3.2] Replace visible app scrollbar styling with cross-browser hidden-scrollbar styling in `frontend/src/index.css` while retaining `overflow`/scroll behavior; preserve Monaco/editor scrollbar behavior and add verification for touch, keyboard, wheel, and nested scrolling.

### Phase 4: Daily challenge, dashboard, and rankings experience

#### Step 4.1: Refine dashboard language and daily challenge CTA
- **Requirements**: REQ-003, REQ-005, REQ-007, REQ-013
- **Description**: Remove the dashboard section headed “Made for Momentum” without removing adjacent dashboard features. Replace user-facing “Coding Arena” terminology with “coding battle” or other request-aligned wording. Restyle the daily challenge call to action with a visible gold lock/unlock cue near the action label, brighter gold premium typography, and no decorative arrow or top-left shield.

#### Step 4.2: Simplify the daily challenge coding room
- **Requirements**: REQ-010, REQ-012, REQ-013
- **Description**: Reduce nonessential copy and visual clutter so the Daily Challenge room aligns with the Battle Room experience. Remove unnecessary red alert treatment/content, but retain accessible, actionable critical error, disqualification, and verification status messages.

#### Step 4.3: Move ranking type tabs into the leaderboard context
- **Requirements**: REQ-008, REQ-013
- **Description**: Remove the standalone select-leaderboard card. Within the leaderboard, place individual/global tabs after the Daily Global Challenge tab and maintain clear selected, keyboard, and accessible states.

Tasks:

- [ ] T012 [US3] [Plan:4.1] Remove only the “Made for Momentum” dashboard section from `frontend/src/pages/Home.jsx` and its now-unused styles from `frontend/src/styles/productPages.css`; retain the other dashboard sections.
- [ ] T013 [US3] [Plan:4.1,4.2] Replace user-facing “Coding Arena” text and refine Daily Challenge language in `frontend/src/pages/Home.jsx` and `frontend/src/pages/WeeklyAssessment.jsx`; keep internal engine diagnostics and developer-facing test names intact.
- [ ] T014 [US3] [Plan:4.1] Restyle the Daily Challenge CTA and its lock/unlock icon in `frontend/src/pages/Home.jsx` and `frontend/src/styles/productPages.css`: gold icon positioned beside the CTA label, brighter premium typography, no CTA arrow, and no top-left shield decoration.
- [ ] T015 [US3] [Plan:4.2] Simplify the Daily Challenge coding-room content and visual hierarchy in `frontend/src/pages/WeeklyAssessment.jsx` and `frontend/src/pages/WeeklyAssessment.css`; remove only nonessential red alert/duplicative content and retain accessible critical status/error feedback.
- [ ] T016 [US4] [Plan:4.3] Refactor tab placement and accessible labels/state in `frontend/src/pages/WeeklyRankings.jsx` and `frontend/src/pages/WeeklyRankings.css`; remove the select-leaderboard card and place individual/global selection in the requested order within the leaderboard.

### Phase 5: Registration/legal presentation, copy review, and cleanup

#### Step 5.1: Polish registration and terms/policies UI
- **Requirements**: REQ-011, REQ-013
- **Description**: Improve visual hierarchy, spacing, readability, and responsive behavior for desktop registration terms/policy controls and the Terms page. Preserve the legal copy and consent semantics unless a separately approved legal-content change is supplied.

#### Step 5.2: Review user-facing copy and remove only evidenced dead code
- **Requirements**: REQ-003, REQ-012, REQ-014
- **Description**: Search rendered UI and user-visible errors for internal, weakening, or unrelated instructions (including “unofficial” and internal engine explanations). Replace/remove only copy that is actually shown to users and conflicts with the requested product tone. Identify code for deletion through references and tests first; preserve useful tests, operational documents, and release assets.

Tasks:

- [ ] T017 [US5] [Plan:5.1] Improve registration consent layout and desktop policy presentation in `frontend/src/pages/AuthPage.jsx`, `frontend/src/pages/Terms.jsx`, and the corresponding `frontend/src/pages/Terms.css` styles while retaining required consent, links, and keyboard accessibility.
- [ ] T018 [US5] [Plan:5.2] Audit user-facing labels, helper text, errors, and onboarding content in `frontend/src` and the desktop renderer; remove or rewrite only internal/weakening/unrelated user-facing wording, and keep technical logs and internal diagnostics.
- [ ] T019 [US5] [Plan:5.2] Identify and remove only demonstrably dead/unneeded product code or artifacts after reference/test verification; preserve useful tests, operational docs, generated/release assets, and packaging inputs unless concrete evidence proves them safe to remove.

### Phase 6: Validation and final preservation check

#### Step 6.1: Validate functionality, accessibility, and safe scope
- **Requirements**: REQ-001–REQ-014
- **Description**: Run focused frontend, backend, and desktop tests/build checks. Manually verify eligibility boundaries, desktop/browser presentation, scrolling, responsive layouts, and terms consent. Review the final diff to confirm scope and preservation.

Tasks:

- [ ] T020 [Plan:6.1] Run `node --test` in `backend` and confirm all eligibility, certificate authorization, ranking, and existing local-execution tests pass.
- [ ] T021 [Plan:6.1] Run frontend `npm test`, `npm run lint`, and `npm run build`; verify dashboard, daily coding room, rankings, terms, registration, shared gutters, and scrolling at desktop and narrow viewport sizes.
- [ ] T022 [Plan:6.1] Run desktop `npm test` and `npm run build` if renderer/shell integration requires it; do not create, replace, or delete release artifacts as part of validation.
- [ ] T023 [Plan:6.1] Recheck `git status` and the final diff; confirm the five pre-existing modified files retain their unrelated changes, only requested behavior changed, and no useful tests/docs/release assets were removed.

## Project Structure

```text
backend/
  src/
    controllers/
      weeklyAssessmentController.js
      battleRoomCertificateController.js
      leaderboardController.js
    services/
      weeklyAssessmentService.js
      weeklyCertificateService.js
      battleRoomCertificateService.js
      battleRoomClosureService.js        # confirm exact snapshot creation location during trace
      leaderboardAlgorithm.js
    utils/
      weeklyAssessment.js
  test/
    weeklyAssessment.test.js
    weeklyCertificateAuthorization.test.js
    battleRoomRanking.test.js
    battleRoomCertificateLibrary.test.js
frontend/src/
  components/layout/
    Navbar.jsx
    RoleNavigation.jsx
  pages/
    Home.jsx
    WeeklyAssessment.jsx
    WeeklyAssessment.css
    WeeklyRankings.jsx
    WeeklyRankings.css
    AuthPage.jsx
    Terms.jsx
    Terms.css
  styles/
    productPages.css
  index.css
desktop/
  src/main/                                # preserve existing submission behavior/diagnostics
  test/                                    # retain and run existing desktop submission tests
```

## Testing Strategy

- **appType**: Mixed SPA and Windows Electron desktop client with Express/Mongoose API.
- **Critical user journeys**:
  1. A disqualified or incomplete user cannot receive, list, or download a certificate.
  2. A completed result with zero passed cases receives no participation certificate; one passed case qualifies for participation only; all cases passed qualifies for ranking and ranked certificate status.
  3. Daily and other affected leaderboard APIs exclude users who do not satisfy the all-tests-passed rule, regardless of client state.
  4. Desktop and browser users can navigate, scroll the document and nested panels, and use the code editor with scrollbar chrome hidden.
  5. A user can review the terms and complete registration consent on desktop and narrow screens.
- **primaryValidationStack**: Backend/frontend/desktop Node test suites; frontend ESLint and Vite production build; focused browser/manual verification.
- **fallbackMatrix**:
  - `infra-tier`: Existing test doubles/unit tests → configured MongoDB integration environment if already available; do not introduce a new infra dependency for this UI/business-rule work.
  - `browser-tier`: Manual browser and Electron desktop smoke checks → frontend tests, build, and CSS/layout assertions if browser automation is unavailable.
- **Environment requirements**: Node.js versions compatible with package manifests; configured environment for backend tests only where existing tests require it; browser/Electron runtime for visual smoke checks.
- **knownGaps**: CSS-only automated tests may not fully validate scrollbar visibility, keyboard scrolling, or visual alignment; perform manual verification at representative viewport sizes.
- **Test data strategy**: Use isolated fixtures for disqualified, incomplete, zero-pass, partial-pass, all-pass, and finalized/retry states; avoid mutating shared or production data.
- **Acceptance criteria**: Server APIs and certificate endpoints enforce all eligibility rules; existing submission and recovery tests remain passing; requested UI changes render correctly and retain scrolling/accessibility; no useful docs/tests/assets are deleted; pre-existing worktree edits are preserved.
- **Validation review expectations**: Confirm eligibility decisions originate from persisted server data, completion and eligibility are distinct, no browser-only gate exists, no error/status semantics are hidden, and final diff contains no unrelated cleanup.

## Requirement Mapping

| REQ ID | Description | Plan Items | Implementation Evidence |
|--------|-------------|------------|------------------------|
| REQ-001 | Increase desktop title/navigation height and improve logo position/visibility | 3.1 | `Navbar.jsx`, `RoleNavigation.jsx`, `index.css` |
| REQ-002 | Add space between welcome name and left navigation links | 3.1 | `RoleNavigation.jsx`, `index.css` |
| REQ-003 | Replace user-facing “Coding Arena” terminology with coding-battle wording | 4.1, 5.2 | `Home.jsx`, rendered copy in `frontend/src` |
| REQ-004 | Hide right-side scrollbar chrome without disabling scrolling | 3.2 | `index.css`, editor/nested scroll verification |
| REQ-005 | Remove dashboard “Made for Momentum” section | 4.1 | `Home.jsx`, `productPages.css` |
| REQ-006 | Standardize horizontal page gutters | 3.2 | `index.css`, `productPages.css`, page overrides |
| REQ-007 | Restyle Daily Challenge CTA: gold lock/unlock, brighter premium typography, no arrow/shield | 4.1 | `Home.jsx`, `productPages.css` |
| REQ-008 | Remove select-leaderboard card and move individual/global tabs into leaderboard after Daily Global Challenge | 4.3 | `WeeklyRankings.jsx`, `WeeklyRankings.css` |
| REQ-009 | Enforce certificate and ranking eligibility on the server | 2.1–2.4 | `weeklyAssessment.js`, weekly service/controllers, certificate/ranking paths, backend tests |
| REQ-010 | Simplify Daily Challenge coding room, removing unnecessary red alert/content while retaining critical status | 4.2 | `WeeklyAssessment.jsx`, `WeeklyAssessment.css` |
| REQ-011 | Improve desktop registration terms/policies UI | 5.1 | `AuthPage.jsx`, `Terms.jsx`, `Terms.css` |
| REQ-012 | Remove internal/weakening/unrelated instructions from user-facing UI | 4.2, 5.2 | `WeeklyAssessment.jsx`, focused rendered-copy audit |
| REQ-013 | Apply consistent premium brand polish | 3.1–5.1 | shared layout and product-page styles/components |
| REQ-014 | Remove only clearly dead/unneeded code; preserve useful tests/docs/release assets | 1.1, 5.2, 6.1 | reviewed references/tests, final diff and worktree status |
