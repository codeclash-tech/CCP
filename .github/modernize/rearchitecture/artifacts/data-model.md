# Data Model

## Runtime Persistence
The runtime implementation uses MongoDB with Mongoose.

## Key Entities
- `LearningModule`: program association, topic array, completion rules, status, published version, AI configuration.
- `LearningTopicVersion`: immutable topic snapshot keyed by module/topic/version.
- `LearningModuleVersion`: module snapshot and topic summaries keyed by module/version.
- `LearningSession`: learner/topic-specific message history and module version.
- `LearningProgress`: completion, objective evidence, profiles, task attempts, progress percentage, assessment state.
- `LearningPurchase`: learner purchase/entitlement and expiry state.

## Topic Curriculum
- Topic embeds legacy `objectives`, `explanation`, `questions`, `examples`, `exercises`, and `subtopics`.
- Topic embeds versioned `objectiveDefinitions`, each with key, prerequisites, expected outcome, required knowledge, misconceptions, and mastery criteria.
- Mastery criteria include evaluation method and required evidence count.

## Evidence and Attempts
- `objectiveEvidence` links evidence ID, topic, module version, objective, source, session, message/attempt, criteria, and quote.
- `taskAttempts` links idempotency key, task/topic/version/session, response hash, status, acceptance, and evaluation.
- Task/criterion compatibility is enforced by objective and criterion key in the service model.

## Relationships
- Progress is unique by learner and module.
- Sessions are matched by learner, module, topic, and module version.
- Topic/module versions use unique module/version/topic combinations.
- Evidence and attempts are embedded in progress and reference sessions/topics.
