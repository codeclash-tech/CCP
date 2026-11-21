# Architect Log

## [t2] Analyzed existing AI Tutor architecture and constraints
- Current runtime is Express/Mongoose with React/Vite authoring and tutoring UI and a separate Spring Boot Java execution engine.
- Existing proposal, persistent session, objective evidence, task attempt, and module/topic snapshot concepts provide reusable seams.
- Existing LearningSession only stores messages/version; no first-class stage, active objective, or hint state.
- Existing evidence validation checks quote text and criterion compatibility, but stage/idempotency/hint contracts need explicit persisted server ownership.
- Learnings consumed: (none)
