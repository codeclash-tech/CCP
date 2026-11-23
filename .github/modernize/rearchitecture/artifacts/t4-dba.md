# Objective Evidence, Mastery, and Persistence Design

## Summary

Preserve the existing MongoDB/Mongoose, `LearningSession`, `LearningProgress`, version snapshots, and optimistic-concurrency model. Add server-authoritative tutor state to `LearningSession`, add replay-safe evidence and attempt identities, and make mastery derivable from persisted, version-pinned evidence plus approved rubric criteria.

No application code or migration is changed in this task; this artifact defines the downstream DBA implementation contract.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/architecture_index.md` — unit boundaries and implementation anchors
- `.github/modernize/rearchitecture/artifacts/data-model.md` — current runtime entities and relationships
- `.github/modernize/rearchitecture/artifacts/cross_unit_state.yaml` — persisted session/progress/version pairing
- `.github/modernize/rearchitecture/artifacts/shared_modules.yaml` — progress-store and shared service seams
- `.github/modernize/rearchitecture/artifacts/unit_graph.yaml` — unit dependencies
- `.github/modernize/rearchitecture/artifacts/units/learner-tutor-conversation/behavior.yaml`
- `.github/modernize/rearchitecture/artifacts/units/learning-progress-and-resume/behavior.yaml`
- `.github/modernize/rearchitecture/artifacts/units/task-submission/behavior.yaml`
- `.github/modernize/rearchitecture/artifacts/spec.md` — REQ-007 through REQ-018 and REQ-027 through REQ-031

## Evidence Mapping

- `.github/modernize/rearchitecture/artifacts/data-model.md` (`LearningSession`, `LearningProgress`, evidence, attempts) → Session/state and evidence schema contracts below
- `cross_unit_state.yaml` `objective evidence to mastery` → `LearningEvidence` plus criterion threshold derivation
- `cross_unit_state.yaml` `persisted tutor session` → unique session identity and server-owned stage/hint fields
- `units/task-submission/behavior.yaml` idempotency branch → `LearningTaskAttempt` scope hash and unique database index
- `spec.md` REQ-014/15/16/17/18 → source/quote/criterion/task compatibility and replay rules

## Persistence Decisions

### 1. Reuse existing session and progress documents

Keep:

- `LearningSession(userId, moduleId, topicId, moduleVersion, language, messages)`
- `LearningProgress(userId, moduleId, moduleVersion, objectiveEvidence, objectiveProfiles, taskAttempts, completedObjectiveKeys)`
- Existing `optimisticConcurrency: true` on `LearningProgress`
- Existing version snapshots and entitlement lookups

Do not store stage or mastery as client-controlled fields in a frontend-only model.

### 2. Extend `LearningSession`

Add persisted fields:

| Field | Type | Rules |
|---|---|---|
| `stage` | enum | `INTRODUCTION_DISCOVERY`, `OBJECTIVE_TEACHING`, `OBJECTIVE_ASSESSMENT`, `PROGRESSION`, `COMPLETION`, `SAFE_RETRY` |
| `activeObjectiveKey` | String/null | Server-selected key; must exist in the topic snapshot and satisfy prerequisites |
| `hintState` | embedded object | `{ objectiveKey, level, maxLevel, issuedCount, lastHintAt }` |
| `stateVersion` | Number | Optimistic state revision, starts at 1 and increments on stage/active-hint changes |
| `lastEvidenceId` | String/null | Replay anchor for the latest accepted evidence decision |

Constraints:

- `activeObjectiveKey` may be null only at `COMPLETION`.
- `hintState.objectiveKey` must equal `activeObjectiveKey` while hints are active.
- `hintState.level` is between 0 and a server-approved maximum.
- `stage`, `activeObjectiveKey`, and hint state are updated only by backend transitions.

Session indexes:

```text
unique: { userId: 1, moduleId: 1, topicId: 1, moduleVersion: 1 }
query:  { userId: 1, moduleId: 1, topicId: 1, updatedAt: -1 }
query:  { userId: 1, activeObjectiveKey: 1, stateVersion: 1 }
```

The existing non-versioned lookup must remain compatible during migration, but the canonical write key becomes the unique versioned four-field tuple.

**Migration note:** Existing sessions may contain duplicates for the same four-field identity. Before creating the unique index, merge each duplicate by retaining the highest `updatedAt`/latest message cursor and append only non-duplicate `messageId` values; archive or delete the losers. A destructive merge is not implicit. Duplicate histories require a DBA-reviewed reconciliation artifact.

### 3. Add `LearningEvidence`

Use a dedicated collection for database-level replay uniqueness; continue mirroring accepted evidence into `LearningProgress.objectiveEvidence` for read compatibility.

Fields:

| Field | Type | Rules |
|---|---|---|
| `evidenceId` | String | SHA-256-derived replay identity, max 100 |
| `learnerId` | ObjectId | Required, refs `User` |
| `sessionId` | ObjectId | Required, refs `LearningSession` |
| `moduleId` | ObjectId | Required |
| `topicId` | ObjectId | Required |
| `moduleVersion` | Number | Required; `>= 1` |
| `objectiveKey` | String | Required and present in frozen topic snapshot |
| `criterionKey` | String | Required and present in approved rubric |
| `sourceType` | enum | `TUTOR`, `THEORY_TASK`, `MATH_TASK`, `CODE_TASK` |
| `sourceId` | ObjectId/null | Task ID when applicable |
| `attemptId` | ObjectId/null | Task attempt relation |
| `messageId` | String/null | Tutor message identity |
| `messageIndex` | Number/null | Non-negative source location |
| `evidenceQuote` | String | For tutor evidence, exact substring from learner response |
| `verifiedOutcome` | Mixed/null | Server verification reference; never hidden test output |
| `demonstrated` | Boolean | Accepted only as `true` |
| `confidence` | Number | Required for AI evidence; `>= 0.70` |
| `evaluationMethod` | String | Must match approved criterion |
| `rubricVersion` | String/Number | Topic snapshot/rubric identity |
| `recordedAt` | Date | Server timestamp |

Indexes:

```text
unique: { evidenceId: 1 }
unique: { learnerId: 1, sessionId: 1, messageId: 1, objectiveKey: 1, criterionKey: 1 }
unique: { learnerId: 1, sessionId: 1, attemptId: 1, objectiveKey: 1, criterionKey: 1 } sparse
query:  { learnerId: 1, moduleId: 1, topicId: 1, moduleVersion: 1, objectiveKey: 1 }
query:  { sessionId: 1, moduleVersion: 1, recordedAt: 1 }
```

Rules:

- AI evidence is advisory until the server checks exact quote containment, approved objective/criterion, confidence, session ownership, and module version.
- Evidence must be inserted before any `completedObjectiveKeys` update.
- A second insert with the same replay identity is an idempotent no-op only if the stored scope and source hash match.
- Scope mismatch is a `409`; no evidence or mastery mutation occurs.
- `demonstrated: false`, misconception findings, hints, and provider tokens are not evidence rows.
- Criterion compatibility is checked by rubric/evaluation method: code tasks only `CODE/DEBUGGING/PRACTICAL`, math tasks only `CALCULATION`, theory/tutor only the approved method for that criterion.

**Irreversibility:** Backfill evidence records from embedded arrays is additive. Do not delete embedded evidence during rollout. If a derived evidence row conflicts with an existing embedded row, stop backfill and reconcile it before enabling unique indexes.

### 4. Mastery derivation

Mastery is not a direct boolean or counter that clients may set. For objective `O` at `(topicId,moduleVersion)`, calculate:

```text
prerequisitesMet = every prerequisite objective is complete
criterionMet(c) =
  validated evidence count for (learner, topic, moduleVersion, O, c)
  >= approved requiredEvidenceCount
mastered(O) = prerequisitesMet && every criterionMet
```

Retain `completedObjectiveKeys` as a denormalized server-maintained cache. On evidence application:

1. Acquire the progress document with optimistic concurrency.
2. Insert evidence with a unique evidence identity.
3. Recalculate the active objective and all criterion thresholds from immutable topic snapshot + evidence rows.
4. Add exactly `topicId:objectiveKey` to `completedObjectiveKeys` if fully mastered.
5. Advance `activeObjectiveKey` and stage only after the recalculation succeeds.
6. Retry `VersionError` by reloading and replaying the same evidence identity; never re-increment counts.

Do not infer mastery from hint level, message count, provider correctness text, task status, or profile estimates.

### 5. Add `LearningTaskAttempt`

Create a dedicated collection while retaining the existing `LearningProgress.taskAttempts` embedded summary for compatibility.

Fields:

| Field | Type | Rules |
|---|---|---|
| `attemptId` | ObjectId | Primary key |
| `learnerId` | ObjectId | Required |
| `moduleId` | ObjectId | Required |
| `topicId` | ObjectId | Required |
| `exerciseId` | ObjectId | Required |
| `sessionId` | ObjectId | Required |
| `moduleVersion` | Number | Required |
| `idempotencyKey` | String | 1-100 characters |
| `scopeHash` | String | Learner/module/topic/exercise/session/version hash |
| `responseHash` | String | SHA-256 of canonical normalized submission |
| `status` | String | Server/runner status |
| `accepted` | Boolean | Verified task outcome |
| `evaluation` | Mixed | Sanitized evaluation data only |
| `createdAt` | Date | Server timestamp |
| `updatedAt` | Date | Replay update timestamp |

Indexes:

```text
unique: { learnerId: 1, scopeHash: 1, idempotencyKey: 1 }
query:  { learnerId: 1, moduleId: 1, topicId: 1, moduleVersion: 1 }
query:  { sessionId: 1, createdAt: -1 }
```

Replay behavior:

- Same key + scope + response hash: increment duplicate count once and return the stored sanitized result.
- Same key + changed response hash or scope: reject `409` and apply no evidence or progress.
- Concurrent first writes: database unique index wins; all losers reload the accepted attempt and return it only for exact matching scope/hash.
- Embedded `taskAttempts` is derived/reconciled state and must not be the source of replay uniqueness.

**Migration note:** Backfill existing attempts by learner, task, topic, version, session, key, and response hash. Reject or quarantine rows lacking a session or canonical response hash instead of inventing identities. Backfilled embedded-only attempts should not increment evidence twice.

### 6. Server stages and hint state

Canonical transition table:

| From | Backend condition | To |
|---|---|---|
| `INTRODUCTION_DISCOVERY` | Tutor receives learner prior knowledge or first prompt | `OBJECTIVE_TEACHING` or `OBJECTIVE_ASSESSMENT` |
| `OBJECTIVE_TEACHING` | Valid evidence for the active objective | `OBJECTIVE_ASSESSMENT` |
| `OBJECTIVE_ASSESSMENT` | Valid evidence satisfies every criterion | `PROGRESSION` |
| `PROGRESSION` | Next prerequisite-ready objective exists | `OBJECTIVE_TEACHING` with new active objective |
| `PROGRESSION` | No objective remains | `COMPLETION` |
| any non-complete stage | Provider interruption/timeout or retry identity collision | `SAFE_RETRY` |
| `SAFE_RETRY` | Replay successfully resolves stored state | Resume prior stage/active objective |

The server recomputes stage from session state plus progress. It must ignore client stage/objective/hint parameters. A provider result must not advance a stage until evidence validation succeeds.

Hint state is persisted per objective. Level advances only on server-recognized hint requests. Hints are generated against the objective and rubric, and must never include complete answer text, final code, verified response, or hidden rubric. The persisted level is used for bounded prompt context, not as evidence.

### 7. Index and migration strategy

Implement in an idempotent startup/index maintenance path, following the existing `ensureLearningIndexes` pattern:

1. Add schema indexes with `syncIndexes`/`createIndex` and no `autoIndex` assumptions.
2. For existing sessions, run deduplication in a dry-run-only script first.
3. For evidence, add fields/collection and backfill; do not delete embedded arrays.
4. Add unique evidence and task-attempt indexes only after conflict reconciliation.
5. Add session stage/hint fields with defaults; fields are non-destructive and additive.
6. Re-run startup/index maintenance safely: stale indexes may be reported and dropped only by named migration code.

Rollback:

- Additive fields and collections: disable the feature after code rollback; retain data.
- Unique session index: rollback can keep the index if duplicates are absent; do not drop without DBA approval.
- Evidence/task-attempt collections: retain for audit/replay; rollback readers ignore new rows after embedded compatibility is restored.
- Do not add foreign-key cascades; Mongo references remain application-enforced.

## Required Schema Changes

Production files downstream:

- `backend/src/models/LearningSession.js`
- `backend/src/models/LearningProgress.js`
- `backend/src/models/LearningEvidence.js` (new)
- `backend/src/models/LearningTaskAttempt.js` (new)
- `backend/src/models/ensureIndexes.js`
- `backend/src/services/learningObjectiveEngine.js`
- `backend/src/services/learningService.js`
- `backend/test/learningIndexes.test.js`
- `backend/test/learningObjectiveEngine.test.js`
- `backend/test/learningTutorConversation.test.js`
- `backend/test/learningTaskSubmission.test.js`
- `backend/test/learningDatabaseIntegration.test.js`

These are recommendations for the implementation task, not changes made here.

## Test Strategy

### Unit and model tests

1. Session schema defaults and stage enum.
2. Active objective cannot be set outside the frozen topic snapshot.
3. Unique session identity index metadata.
4. Evidence quote containment and confidence thresholds.
5. Criterion evidence threshold and prerequisite derivation.
6. Hints do not increase evidence or mastery.
7. Evidence/task duplicate replay and mismatch scope rejection.

### Database integration tests

- Real Mongo test database only when `MONGODB_TEST_URI` is configured.
- Create one session, resume it, retry identical message/attempt, and verify one evidence row and one attempt row.
- Reuse an evidence/attempt key for a different session, objective, response, or version and verify `409` plus unchanged evidence/mastery.
- Concurrent identical task submissions verify one attempt/evidence row and no duplicated criterion count.
- Publish module v1 and v2; learner v1 retains v1 evidence and state.
- Version mismatch rejects state/evidence mutation.
- Run index creation twice and verify no duplicates or startup failure.

### Existing focused regressions

Reuse the existing `learningIndexes.test.js`, `learningObjectiveEngine.test.js`, `learningTutorConversation.test.js`, `learningTaskSubmission.test.js`, and `learningDatabaseIntegration.test.js`; extend rather than replace them.

Primary data-fidelity tier:

- Docker/real Mongo integration where available
- Fallback: Mongoose/schema tests plus an isolated Mongo-compatible test instance only if explicitly provisioned

No provider, live database, or secure execution claim is made in this task.

## Compatibility and Security

- Authentication and entitlement checks remain in `LearningService`/middleware; persistence design adds no unauthenticated path.
- Published topic snapshots remain the source of objective and rubric keys.
- Evidence quote/source fields must never include hidden test output or secrets.
- Task evidence uses only sanitized runner status/output and compatible rubric criteria.
- Provider/model fields remain server-side; no provider secret is persisted in evidence or session state.
- Optimistic concurrency remains on progress; new evidence/attempt collections use unique indexes as database-level replay protection.

## Test Results

- Source and upstream artifacts inspected: yes
- Code modified: no
- Focused tests run: no
- Database migration or live Mongo validation: not run
- Build: not run

## Remaining Gaps for t5/t7

- t5 must freeze exact API fields for stage, active objective, hint state, and mismatch response codes.
- t7 must implement the schema/index/backfill code and reconcile existing embedded evidence/attempt duplicates.
- t7 must decide whether MongoDB supports transactions in the deployment; if not, use evidence/attempt unique indexes plus optimistic progress reconciliation.
- t7 must provide a dry-run reconciliation report before the unique session index is enabled.
