# t5 — Stage, Conversation, Idempotency, and API Contracts

## Summary

This contract freezes the server-owned Tutor state machine, unified conversation API, replay identities, evidence/mastery response shape, and authoring preview/approval boundary. It preserves the existing Express routes, auth/RBAC, entitlement, Mongoose progress model, provider abstraction, module snapshots, and secure Java execution seam.

## Upstream Artifacts Consumed
- `.github/modernize/rearchitecture/artifacts/architecture_index.md` — unit boundaries and implementation handoff.
- `.github/modernize/rearchitecture/artifacts/wire_contracts.yaml` — existing REST and target-contract seams.
- `.github/modernize/rearchitecture/artifacts/cross_unit_state.yaml` — session, evidence/mastery, and version flows.
- `.github/modernize/rearchitecture/artifacts/t3-ux.md` — authoring, conversation, hint, retry, resume, and accessibility behavior.
- `.github/modernize/rearchitecture/artifacts/t4-dba.md` — session, evidence, attempt, index, and reconciliation contracts.
- `.github/modernize/rearchitecture/artifacts/spec.md` — REQ-001–REQ-031 and SC-001–SC-009.
- `.github/modernize/rearchitecture/artifacts/requirements-checklist.md` — preservation and redesign coverage.

## Evidence Mapping
- `t3-ux.md` conversation authoring states → **Authoring preview/approval contracts** below.
- `t3-ux.md` persistent message/hint/resume behavior → **Conversation snapshot and stage contracts** below.
- `t4-dba.md` `LearningSession.stage/activeObjectiveKey/hintState/stateVersion` → **Canonical stage transitions** and server snapshot fields.
- `t4-dba.md` evidence/attempt replay uniqueness → **Idempotency contracts** and `409` scope rules.
- `wire_contracts.yaml` frozen REST routes → existing route paths preserved, with additive response fields only.
- `spec.md` REQ-011–REQ-022 → backend-only transitions, validated evidence, criterion compatibility, and hint safety.
- `spec.md` REQ-023–REQ-026 → existing authenticate/RBAC, entitlement, provider, version, and execution boundaries remain mandatory.

## Contract Freeze

The contracts below are implementation requirements, not suggestions. The following upstream decisions are authoritative:

- `t3-ux.md`: the browser may render stage/objective/progress, but may not provide it as a control or mutate it.
- `t4-dba.md`: session, evidence, and task-attempt identities are persisted server-side; embedded progress arrays remain compatibility mirrors.
- `wire_contracts.yaml`: preserve `/sessions/:sessionId/messages`, `/admin/modules/:moduleId/topic-proposals`, and exercise submission paths.
- `cross_unit_state.yaml`: one versioned session identity and evidence-to-mastery pairing remain the shared-state boundary.
- `spec.md`: auth, entitlement, version snapshots, provider abstraction, and secure Java execution are preservation boundaries, not redesign targets.

The first implementation pass must not add a second verification route or a client stage machine.

## Source Anchors
- `backend/src/routes/learningRoutes.js:44` — persistent tutor message route.
- `backend/src/routes/learningRoutes.js:82` — curriculum proposal route.
- `backend/src/routes/learningRoutes.js:54` — exercise submission route.
- `backend/src/controllers/learningController.js:237` — session start and existing request fields.
- `backend/src/controllers/learningController.js:248` — existing tutor message request fields.
- `backend/src/controllers/learningController.js:283` — existing exercise submission fields.
- `backend/src/services/learningService.js:2547` — session start/resume and version lookup.
- `backend/src/services/learningService.js:2600` — active-objective tutor orchestration.
- `backend/src/services/learningService.js:3002` — exercise idempotency and execution orchestration.
- `backend/src/models/LearningSession.js:19` — existing topic-session identity.
- `backend/src/models/LearningProgress.js:53` — existing embedded task-attempt and evidence summaries.

## 1. Canonical Stage State

The backend persists and owns:

```text
stage:
  INTRODUCTION_DISCOVERY
  OBJECTIVE_TEACHING
  OBJECTIVE_ASSESSMENT
  PROGRESSION
  COMPLETION
  SAFE_RETRY

activeObjectiveKey: string | null
hintState:
  objectiveKey: string
  level: 0..maxLevel
  maxLevel: 3
  issuedCount: integer
  lastHintAt: ISO timestamp | null
stateVersion: integer
lastEvidenceId: string | null
```

Invariant rules:

1. `activeObjectiveKey` is `null` only in `COMPLETION`.
2. In every non-complete stage, the active key must exist in the frozen topic snapshot and be prerequisite-ready.
3. `hintState.objectiveKey` equals `activeObjectiveKey` when `level > 0`.
4. The client never sends or overrides stage, active objective, hint level, completed objectives, or mastery.
5. `stateVersion` increments exactly once for a committed stage/active-objective/hint transition. Replay of the same action returns the same version and never increments it.

## 2. Server Transition Table

| From | Server condition | To |
|---|---|---|
| `INTRODUCTION_DISCOVERY` | A first learner prompt is stored and no prior evidence exists | `OBJECTIVE_TEACHING` |
| `INTRODUCTION_DISCOVERY` | Learner prompt is already compatible with assessment evidence | `OBJECTIVE_ASSESSMENT` |
| `OBJECTIVE_TEACHING` | Server validates at least one criterion-compatible evidence item | `OBJECTIVE_ASSESSMENT` |
| `OBJECTIVE_ASSESSMENT` | Evidence meets all criteria and prerequisites | `PROGRESSION` |
| `PROGRESSION` | Another prerequisite-ready objective exists | `OBJECTIVE_TEACHING` with next server-selected key |
| `PROGRESSION` | No objective remains | `COMPLETION`, with active key `null` |
| any non-complete stage | Provider timeout/interruption or replay collision | `SAFE_RETRY` |
| `SAFE_RETRY` | Stored action replay resolves with an exact key/scope/hash | Return prior stage/active objective |

The provider response may update teaching text, objective evidence proposals, and profile signals. It may not advance state or mastery before server evidence validation succeeds.

## 3. Unified Conversation Snapshot

The existing route `POST /api/learning/sessions/:sessionId/messages` is retained. Additive response fields are:

```json
{
  "session": {
    "id": "ObjectId",
    "moduleId": "ObjectId",
    "topicId": "ObjectId",
    "moduleVersion": 1,
    "language": "en",
    "messages": [
      {
        "messageId": "string",
        "role": "user",
        "content": "string",
        "createdAt": "ISO timestamp"
      }
    ],
    "stage": "OBJECTIVE_TEACHING",
    "activeObjectiveKey": "objective-key",
    "hintState": {
      "objectiveKey": "objective-key",
      "level": 1,
      "maxLevel": 3,
      "issuedCount": 1,
      "lastHintAt": "ISO timestamp"
    },
    "stateVersion": 4,
    "lastEvidenceId": "evidence-id"
  },
  "reply": "string",
  "replyLanguage": "en",
  "activeObjective": {
    "key": "objective-key",
    "title": "string",
    "description": "string",
    "state": "IN_PROGRESS",
    "criteria": []
  },
  "objectiveProgress": [],
  "hint": {
    "issued": true,
    "level": "ORIENT",
    "levelNumber": 1,
    "content": "string"
  },
  "action": {
    "actionId": "string",
    "status": "COMPLETED",
    "replayed": false
  },
  "evaluation": {
    "correctness": "CORRECT",
    "feedback": "string",
    "recommendedNextAction": "string"
  },
  "progress": {}
}
```

Request contract:

```json
{
  "message": "string",
  "language": "en",
  "inputTranscribedFromSpeech": false,
  "studentName": "string",
  "action": "SEND_MESSAGE",
  "actionId": "optional-client-retry-id",
  "hintRequest": false
}
```

Rules:

- `action` allows only `SEND_MESSAGE` or `REQUEST_HINT`; omission means `SEND_MESSAGE` for backward compatibility.
- `actionId` is optional only for backward compatibility. When present, it is server-validated as 1–100 characters and stored by action replay identity.
- `stage`, `activeObjectiveKey`, `hintState`, `mastery`, `objectiveProgress`, and `completedObjectiveKeys` are ignored in the request.
- `hintRequest` must not create evidence or mastery.
- Direct-answer requests receive a safe refusal plus the next allowed hint or learner-demonstration prompt.
- Hint levels are `ORIENT`, `NARROW`, `SCAFFOLD`; level 3 never emits complete answer text or verified final code.
- Message and assistant records remain one persistent ordered history. Refresh returns the same server snapshot and an optional `resumed` boundary.

## 4. Session Start and Resume Contract

Retain `POST /api/learning/sessions` with existing fields:

```json
{
  "moduleId": "ObjectId",
  "topicId": "ObjectId",
  "language": "en"
}
```

The server resolves entitlement, topic prerequisite, module/topic version, existing session identity, active objective, stage, and hint state. The canonical session identity is:

```text
(userId, moduleId, topicId, moduleVersion)
```

If no exact versioned session exists, create one. If an existing session belongs to another version, do not mutate it or select its evidence; return a version-mismatch result and offer only a safe compatible-resume action.

## 5. Curriculum Preview and Approval Contract

Retain `POST /api/learning/admin/modules/:moduleId/topic-proposals`.

Request:

```json
{
  "title": "string",
  "description": "string",
  "referenceContent": "string",
  "subject": "string",
  "supportingContext": "optional string"
}
```

Rules:

- Require title, description, and pasted objectives/content. Supporting context is optional.
- Return a non-published preview only; never create or publish a topic.
- The preview has ordered objectives and per-objective description, expected outcome, required knowledge, mastery criteria, misconceptions, and practice tasks.
- Preview validation failures return `502` with `code: "CURRICULUM_PREVIEW_INVALID"` and an actionable field/message list.
- Rejection or any source/preview edit invalidates the server approval token.
- Publication remains a separate explicit action and must reference a preview approval identity and immutable source hash.
- Publish must use the existing admin topic route and create no learner-progress or enrollment side effects.

Recommended backward-compatible publish payload:

```json
{
  "title": "string",
  "description": "string",
  "approvalId": "UUID",
  "sourceHash": "sha256",
  "curriculum": {}
}
```

The exact status code for preview/publish conflicts is `409`.

## 6. Exercise Submission Contract

Retain `POST /api/learning/modules/:moduleId/topics/:topicId/exercises/:exerciseId`.

Request:

```json
{
  "sessionId": "ObjectId",
  "subtopicId": "ObjectId",
  "idempotencyKey": "string",
  "submission": "string",
  "response": "string",
  "code": "string"
}
```

Canonical normalized response identity:

```text
scopeHash =
  sha256(learnerId + moduleId + topicId + exerciseId + sessionId + moduleVersion)

responseHash =
  sha256(canonical normalized submission: text/theory/math/code)

attemptIdentity =
  (learnerId, scopeHash, idempotencyKey)
```

Rules:

1. `idempotencyKey` is 1–100 characters matching `^[\w.:-]+$`.
2. If key is omitted, use the server-generated hash of exercise and normalized response.
3. Exact key + exact scope + exact response hash returns the stored sanitized attempt/evaluation and does not increment evidence or mastery.
4. Exact key + changed scope or response hash returns `409`, with no attempt/evidence/mastery mutation.
5. Concurrent first writes return the same stored result through the database unique identity; in-process reconciliation remains a fast path only, not the replay source.
6. Version, session, and active-objective mismatch return `409` or `403` per existing route semantics and mutate nothing.
7. Execution/provider unavailable returns `503` with `attemptStatus: "UNAVAILABLE"` and no accepted evidence.
8. Java execution remains behind the existing isolated secure execution service. Sanitized runner status/result only may enter evidence.

Replay response shape:

```json
{
  "attempt": {
    "idempotencyKey": "string",
    "status": "ACCEPTED",
    "accepted": true,
    "feedback": "string",
    "evaluation": {},
    "replayed": true
  },
  "objectiveEvidence": [],
  "objectiveProgress": [],
  "progress": {},
  "stage": "OBJECTIVE_ASSESSMENT",
  "activeObjectiveKey": "objective-key",
  "stateVersion": 5
}
```

## 7. Message Action Idempotency

For `POST /api/learning/sessions/:sessionId/messages`, the action identity is:

```text
messageReplayId =
  sha256(userId + sessionId + moduleId + topicId + moduleVersion
         + action + normalizedPayloadHash)

normalizedPayloadHash =
  sha256(language + normalizedMessage + inputTranscribedFromSpeech + studentName)
```

Rules:

- `actionId` is the externally supplied or server-returned replay key. It is 1–100 characters and matching `^[\w.:-]+$`.
- When `actionId` is present, the complete persisted action identity is `(userId, sessionId, actionId)`. The payload and scope hashes are stored with the first successful or safely pending action.
- When `actionId` is absent for backward compatibility, derive a scoped fallback identity from `messageReplayId`; repeated identical fallback actions may replay only while the stored action remains unambiguous.
- Repeating an exact action and scope returns one assistant message, one evaluation, and one evidence application.
- The evidence identity remains the existing server-derived evidence key semantics or a dedicated SHA-256 replay key tied to session, module version, objective, source, and source identity.
- A changed payload, action kind, session, module, topic, or module version under the same `actionId` returns `409 ACTION_SCOPE_MISMATCH`.
- A provider timeout stores no optimistically mastered state and returns `SAFE_RETRY` with the original draft/action identity still usable.
- The action lifecycle is `PROCESSING -> COMPLETED` or `PROCESSING -> SAFE_RETRY`; a provider retry may reissue evaluation only after the stored action payload is reloaded.
- If provider work completes and the result was not durably stored, the next exact replay may return provider retry guidance rather than inventing a result.
- If storage succeeds, repeated exact replay returns the stored result with `replayed: true`.
- UI `SEND_MESSAGE` and `REQUEST_HINT` actions must have separate replay identities.

The action record is transient but replay-safe and may be embedded in the first implementation pass if it is not persisted:

```json
{
  "actionId": "string",
  "action": "SEND_MESSAGE",
  "scopeHash": "sha256",
  "payloadHash": "sha256",
  "status": "COMPLETED",
  "result": {},
  "providerAttemptCount": 1,
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

The database implementation must not use the in-process map as the only replay authority. A durable session/action record or dedicated action collection is required before exact cross-process retries are guaranteed.

## 8. Evidence and Mastery Contract

Evidence is accepted only after all checks:

1. Learner and session ownership match.
2. Topic snapshot/module version match.
3. Objective and criterion keys exist in the frozen snapshot.
4. Evidence source is a tutor message or a compatible task attempt.
5. Tutor evidence quote is an exact substring of the learner source response.
6. Confidence meets the criterion threshold.
7. Task type and criterion evaluation method are compatible.
8. Replay identity, session, objective, and source identity are exact.

Criterion/task compatibility:

| Task/source | Compatible evaluation methods |
|---|---|
| `CODE_TASK` | `CODE`, `DEBUGGING`, `PRACTICAL` |
| `MATH_TASK` | `CALCULATION` |
| `THEORY_TASK` | Criterion-approved `EXPLANATION`, `THEORY`, or rubric-specific method |
| `TUTOR` | Criterion-approved `EXPLANATION`, `THEORY`, or rubric-specific method |

Mastery remains derived from immutable snapshot criteria and persisted evidence. Hint level, hint count, message count, provider profile text, and task status alone do not add evidence.

## 9. Error Contract

| HTTP | Code | Mutation |
|---|---|---|
| `400` | `VALIDATION_ERROR` | None |
| `403` | `SESSION_SCOPE_MISMATCH` or entitlement/RBAC denial | None |
| `409` | `ACTION_SCOPE_MISMATCH` | No stage/evidence/mastery/attempt mutation |
| `409` | `TOPIC_VERSION_MISMATCH` | None |
| `409` | `CURRENT_OBJECTIVE_MISMATCH` | None |
| `502` | `CURRICULUM_PREVIEW_INVALID` | No topic or preview-publish state |
| `503` | `AI_PROVIDER_UNAVAILABLE` | Preserve draft/session; no mastery |
| `503` | `EXECUTION_UNAVAILABLE` | Attempt unavailable; no accepted evidence |

Errors include:

```json
{
  "code": "ACTION_SCOPE_MISMATCH",
  "message": "This action identity belongs to a different response or scope.",
  "retryable": false,
  "safeAction": "CREATE_NEW_ACTION"
}
```

Provider timeout or interrupted action uses `retryable: true` and `safeAction: "RETRY_ACTION"`. Entitlement and authorization loss remain the existing denial behavior.

## 10. Test Strategy Mapping

Implementers must cover these contract tests before integration is accepted:

1. Stage enum/schema, session default, active-key invariants, and state-version replay.
2. Start/resume exact version tuple reuse; no cross-version session mutation.
3. Identical message replay returns one message/evaluation/evidence result.
4. Same action ID with changed message/scope returns `409` with no state mutation.
5. Hint level is bounded and repeated hint requests increment only hint state.
6. Direct-answer request never contains answer/code/rubric leak and creates no evidence.
7. Quote containment, confidence threshold, objective/criterion existence, and source compatibility.
8. Exact exercise replay returns one attempt/evidence; scope/hash mismatch returns `409`.
9. Concurrent identical task submissions create one attempt/evidence; concurrent mismatch does not advance mastery.
10. `COMPLETION` has no active objective; progression requires every criterion and prerequisite.
11. Provider/execute unavailable returns `503` and leaves progress unchanged.
12. Auth, role, entitlement, publication, version, provider, and Java execution regressions remain passing.

Focused test files named by t4 remain the implementation targets:
- `backend/test/learningIndexes.test.js`
- `backend/test/learningObjectiveEngine.test.js`
- `backend/test/learningTutorConversation.test.js`
- `backend/test/learningTaskSubmission.test.js`
- `backend/test/learningDatabaseIntegration.test.js`

Live provider, live Mongo, and secure Java execution are not claimed by this contract and require later environment-provisioned validation.

## Test Results
- Source and upstream artifacts inspected: yes
- Contracts artifact written: yes
- Code modified: no
- Focused tests run: no
- Live database/provider/execution validation: not run
- Build: not run

## Remaining Gaps
- t7 DBA must implement the session, evidence, attempt, reconciliation, and unique-index contracts before backend replay behavior can be enforced.
- t8 backend must bind these fields to existing controller/service functions and preserve the provider/execution seams.
- t9 frontend must send retry-safe action identities and render only the server snapshot fields.
- t6 teamlead must turn this contract into executable test sequencing and gate coverage.
