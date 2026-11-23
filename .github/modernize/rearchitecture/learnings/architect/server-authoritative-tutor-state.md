# Server-Authoritative Tutor State

Preserve learner stage, active objective, evidence, and hint state as backend-owned session/progress data in this in-place redesign.

## What Happened
The existing implementation already has persistent `LearningSession` messages and objective evidence in `LearningProgress`, but stage, active objective, and hint state are not first-class server-persisted fields. The AI evidence engine validates quote presence and criterion compatibility, while task submissions already carry idempotency identities and optimistic concurrency.

This was established for CCP in task t2.

## Takeaway
Redesign the existing session/progress models rather than adding a separate client-owned stage machine. Keep auth, entitlement, version snapshots, provider abstraction, and Java execution on their existing boundaries. Treat task attempts and tutor messages as evidence sources only after server-side scope/version/key/criterion validation.

For replay contracts, action identity must include the learner/session/version scope and normalized payload; `actionId` alone is never sufficient to prove an exact replay. Provider retries must preserve the stored prior stage and may advance state only after evidence validation and durable replay state succeed.

## History
- 2026-11-21 (CCP/t2): initial architecture decision
- 2026-11-21 (CCP/t5): frozen the exact stage/action replay/API contract shape, including 409 scope mismatch and 503 non-mutation rules
