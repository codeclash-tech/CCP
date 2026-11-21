## User Input

> Implement the user's requested CodeClash AI Tutor redesign end-to-end in the existing repository. The full request is in the parent conversation: simplify topic authoring to title/description/pasted objectives/content with AI curriculum preview and approval; make teaching and objective verification a single persistent conversation; add backend-authoritative stages, safe idempotency, objective-level validated evidence/mastery, adaptive question-first teaching, progressive non-leaking hints; preserve existing auth, entitlement, versioning, provider abstraction and secure Java execution. Inspect before editing, reuse architecture/models/services, modify backend/frontend/database/tests together, and run focused tests/builds. Work only in current workspace. Make precise changes; do not claim unrun tests or real provider/database/execution validation. If scope cannot be implemented fully in one pass, deliver the highest integrated safe implementation and explicitly report remaining gaps. Do not generate unrelated planning docs. Return concise summary with exact modified files, tests/results, and limitations. Bounded objective: one implementation pass and verification; do not broaden into unrelated cleanup.

**Project started**: 2026-11-21T10:23:01Z

## Tasks

### Phase: Requirements
- ⏳ t1 [pm] Inventory AI Tutor workflows and define acceptance criteria (retry: charter preflight unavailable)

### Phase: Design
- ⏳ t2 [architect] Analyze current AI Tutor architecture and constraints [deps: t1]
- ⏳ t3 [ux] Specify simplified authoring and persistent tutoring conversation [deps: t1]

### Phase: Contracts & Test Strategy
- ⏳ t4 [dba] Design objective evidence, mastery, and persistence changes [deps: t2]
- ⏳ t5 [architect] Define stage, conversation, idempotency, and API contracts [deps: t2, t3, t4]
- ⏳ t6 [teamlead] Define focused regression and runtime-validation strategy [deps: t2, t3, t4, t5]

### Phase: Implementation
- ⏳ t7 [dba] Implement safe objective-evidence and mastery persistence [deps: t4]
- ⏳ t8 [backend] Implement authoritative tutoring stages and safe conversation orchestration [deps: t4, t5, t7]
- ⏳ t9 [frontend] Implement curriculum approval and unified persistent tutor UX [deps: t3, t5, t8]

### Phase: Review
- ⏳ t10 [architect] Review implementation against contracts [deps: t7, t8, t9]
- ⏳ t11 [security] Audit auth, entitlement, idempotency, evidence, and execution boundaries [deps: t7, t8, t9]
- ⏳ t12 [ux] Review tutor workflows, accessibility, and responsive behavior [deps: t9]
- ⏳ t13 [architect] Run full build and startup smoke verification [deps: t7, t8, t9]

### Phase: Runtime Validation
- ⏳ t14 [tester] Run focused regression, integration, and tutor-flow validation [deps: t6, t10, t11, t12, t13]

### Phase: Sign-off
- ⏳ t15 [pm] Verify AI Tutor acceptance criteria and feature parity [deps: t1, t14]
- ⏳ t16 [teamlead] Verify test-strategy conformance and final completeness [deps: t6, t14, t15]



