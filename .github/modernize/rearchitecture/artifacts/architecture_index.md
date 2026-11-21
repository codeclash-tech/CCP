# Architecture Index

## Implementation Guide

This index is not the full contract. Do not implement from this file alone; follow the artifact paths below.

### Global artifacts
- `unit_graph.yaml` — unit boundaries, source anchors, dependencies, and shared references.
- `migration_boundary.yaml` — implementation scope; `must_rewrite` is authoritative.
- `wire_contracts.yaml` — existing and redesign HTTP/data contracts.
- `shared_modules.yaml` — auth, provider, entitlement, versioning, progress, and execution seams.
- `cross_unit_state.yaml` — persisted session/progress and version-pairing flows.
- `seams.yaml` — frozen boundaries and protocol bridge requirements.
- `project-structure.md` — repository/module layout.
- `tech-stack.md` — existing runtime and framework facts.
- `data-model.md` — existing persistence model inventory.

### Unit: admin-curriculum-authoring
- external trigger: `POST /api/learning/admin/modules/:moduleId/topic-proposals`
- must read:
  - `units/admin-curriculum-authoring/behavior.yaml`
  - `units/admin-curriculum-authoring/bindings.yaml`
  - `units/admin-curriculum-authoring/unit_decomposition.yaml`
- filter: wire `unit: admin-curriculum-authoring`; shared `used_by_units`; flows touching this unit.
- before DONE: list artifacts read, preserve preview/non-publish and approval behavior, report unresolved provider validation details, and tests/build evidence.

### Unit: learner-tutor-conversation
- external trigger: `POST /api/learning/sessions/:sessionId/messages`
- must read:
  - `units/learner-tutor-conversation/behavior.yaml`
  - `units/learner-tutor-conversation/bindings.yaml`
  - `units/learner-tutor-conversation/unit_decomposition.yaml`
- filter: wire `unit: learner-tutor-conversation`; shared refs; session/progress flows; AI/provider seam.
- before DONE: report server-authoritative stage, persistent message, active objective, hint-state, retry, and evidence preservation evidence.

### Unit: task-submission
- external trigger: `POST /api/learning/modules/:moduleId/topics/:topicId/exercises/:exerciseId`
- must read:
  - `units/task-submission/behavior.yaml`
  - `units/task-submission/bindings.yaml`
  - `units/task-submission/unit_decomposition.yaml`
- filter: wire `unit: task-submission`; task/execution/shared refs; cross-unit state; secure execution seam.
- before DONE: report idempotency, mismatch rejection, compatible criterion coverage, Java-only execution, and test evidence.

### Unit: learning-progress-and-resume
- external trigger: learning session start/resume and topic/student retrieval
- must read:
  - `units/learning-progress-and-resume/behavior.yaml`
  - `units/learning-progress-and-resume/bindings.yaml`
  - `units/learning-progress-and-resume/unit_decomposition.yaml`
- filter: wire rows for the unit; shared progress refs; session/progress flows; versioning seam.
- before DONE: report entitlement/version/active-objective resume evidence and no-loss behavior.

### Unit: module-publishing
- external trigger: module status and topic create/update routes
- must read:
  - `units/module-publishing/behavior.yaml`
  - `units/module-publishing/bindings.yaml`
  - `units/module-publishing/unit_decomposition.yaml`
- filter: wire `unit: module-publishing`; version shared refs; publication state flows.
- before DONE: report snapshot/rollback behavior, approval gate, and version preservation evidence.

### Unit: learning-center-ui
- external trigger: React Learning Center page
- must read:
  - `units/learning-center-ui/behavior.yaml`
  - `units/learning-center-ui/bindings.yaml`
  - `units/learning-center-ui/unit_decomposition.yaml`
- filter: wire `unit: learning-center-ui`; shared UI/API refs; cross-unit session state.
- before DONE: report simplified authoring, persistent conversation, no client stage override, responsive/accessibility evidence.

## Upstream Artifacts Consumed
- `.github/modernize/rearchitecture/artifacts/t1-pm.md`
- `.github/modernize/rearchitecture/artifacts/spec.md`
- `.github/modernize/rearchitecture/artifacts/requirements-checklist.md`

## Evidence Mapping
- REQ-001–REQ-006 and User Story 1 → `admin-curriculum-authoring` and module-publishing contracts.
- REQ-008–REQ-013, REQ-019–REQ-022 → `learner-tutor-conversation` behavior and session-state flows.
- REQ-014–REQ-018 → `task-submission`, objective evidence, and idempotency contracts.
- REQ-023–REQ-026 → auth, entitlement, provider, version, and secure-execution seams.
