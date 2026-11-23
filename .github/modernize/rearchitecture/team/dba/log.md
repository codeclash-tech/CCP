# DBA Team Log

## [t4] Objective evidence, mastery, and persistence design
- Discovered that existing `LearningSession` lacks stage, active objective, and hint state.
- Existing `LearningProgress` stores evidence and attempts embedded, while replay uniqueness is service/index-insufficient.
- Decision: add dedicated evidence and task-attempt collections for database-unique replay identities while retaining embedded compatibility fields.
- Decision: mastery is recalculated from frozen topic rubric thresholds and version-pinned evidence; it is never incremented by hint or provider state.
- Learnings consumed: none.
