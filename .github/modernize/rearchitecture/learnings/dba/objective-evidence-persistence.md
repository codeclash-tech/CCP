# Objective Evidence Persistence

One-sentence description: Use database-unique evidence and attempt identities plus version-pinned rubric snapshots for replay-safe tutor mastery.

## What Happened

The existing embedded evidence and task-attempt arrays in `LearningProgress` are compatible but cannot independently enforce replay uniqueness. This was decided for CCP task t4.

## Takeaway

Keep embedded arrays for compatibility, but add dedicated `LearningEvidence` and `LearningTaskAttempt` collections with unique replay scopes. Mastery must be derived from approved rubric thresholds and exact evidence rows, and session stage/hint state must remain server-owned.

## History
- 2026-11-21 (CCP/t4): initial persistence and migration contract
