# Architect Log

## [t2] Analyzed existing AI Tutor architecture and constraints
- Current runtime is Express/Mongoose with React/Vite authoring and tutoring UI and a separate Spring Boot Java execution engine.
- Existing proposal, persistent session, objective evidence, task attempt, and module/topic snapshot concepts provide reusable seams.
- Existing LearningSession only stores messages/version; no first-class stage, active objective, or hint state.
- Existing evidence validation checks quote text and criterion compatibility, but stage/idempotency/hint contracts need explicit persisted server ownership.
- Learnings consumed: (none)

## [t5] Defined stage, conversation, idempotency, and API contracts
- Backend-owned state is the source of truth; client stage/objective/mastery/hint fields are ignored rather than trusted.
- Exact replay identity must include action scope plus normalized response/hash; scope or response changes are non-mutating 409 conflicts.
- Stage transitions occur only after evidence validation and prerequisite/mastery derivation; provider/execution interruption returns SAFE_RETRY or 503 without mastery mutation.
- Action replay is not durable across processes unless an action record is persisted; the in-process map is only an optimization.
- Learnings consumed: [architect/server-authoritative-tutor-state]
