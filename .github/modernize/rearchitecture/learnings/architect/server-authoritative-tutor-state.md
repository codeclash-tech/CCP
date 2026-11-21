# Server-Authoritative Tutor State

Preserve learner stage, active objective, evidence, and hint state as backend-owned session/progress data in this in-place redesign.

## What Happened
The existing implementation already has persistent `LearningSession` messages and objective evidence in `LearningProgress`, but stage, active objective, and hint state are not first-class server-persisted fields. The AI evidence engine validates quote presence and criterion compatibility, while task submissions already carry idempotency identities and optimistic concurrency.

This was established for CCP in task t2.

## Takeaway
Redesign the existing session/progress models rather than adding a separate client-owned stage machine. Keep auth, entitlement, version snapshots, provider abstraction, and Java execution on their existing boundaries. Treat task attempts and tutor messages as evidence sources only after server-side scope/version/key/criterion validation.

## History
- 2026-11-21 (CCP/t2): initial architecture decision
