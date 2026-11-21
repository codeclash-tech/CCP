# Feature Specification: CodeClash AI Tutor Redesign

**Feature Branch**: `rearchitecture/ai-tutor-redesign`
**Created**: 2026-11-21
**Status**: Requirements Complete
**Input**: Implement a simplified, persistent, objective-based AI Tutor redesign while preserving existing platform behavior.

## Scope Baseline

- **Discovery method**: Inspected existing Learning Center authoring and learner conversation behavior, AI Tutor tests, learning models, routes, and project topology.
- **Total items discovered**: 12 existing AI Tutor workflow areas
- **Items in scope**: 12

### Existing Workflow Inventory

1. Administrators create and edit courses, modules, and topics.
2. Topic authoring currently exposes many low-level fields and objective/rubric editing controls.
3. Administrators can request an AI-generated topic proposal and receive objectives, knowledge, and practice tasks.
4. A proposal is previewed before publishing and must not itself publish the topic.
5. Learners start a topic session and exchange messages with the AI Tutor.
6. Learners may enter English or Tamil language preferences.
7. Topic and module progress can show completed objectives and topics.
8. Objective mastery is supported by objective-level evidence and criterion results.
9. Learners can submit theory, math, and code exercises separately from conversation messages.
10. Repeated exercise submissions are intended to return the same accepted result rather than duplicate progress.
11. Published module versions preserve topic snapshots for later learners.
12. Existing authentication, purchases/entitlements, provider abstraction, and secure code-execution boundaries remain platform behavior.

## User Scenarios & Testing

### User Story 1 - Simplified Topic Authoring (Priority: P1)

An administrator enters only a title, short description, pasted learning objectives/content, and optional supporting content. The system presents an AI-generated curriculum preview containing ordered objectives, teaching knowledge, mastery criteria, misconceptions, and practice tasks. The administrator reviews the preview, edits it only where needed, previews the learner experience, and explicitly approves or rejects it before publication.

**Why this priority**: This is the entry point for creating quality tutor experiences and directly removes authoring complexity.

**Independent Test**: With no prior topic draft, an administrator can create a preview from title, description, and pasted content, approve it, and observe the resulting topic available for learners.

**Acceptance Scenarios**:

1. **Given** an administrator enters a title and description, **When** the administrator pastes objectives/content and requests an AI curriculum, **Then** a non-published preview is displayed for review.
2. **Given** the curriculum preview is displayed, **When** the administrator edits or approves it, **Then** the preview and approval state reflect the review while no enrollment-visible topic changes occur before approval.
3. **Given** AI output is incomplete or malformed, **When** the preview is generated, **Then** the administrator receives a clear validation result and no topic is published.
4. **Given** the administrator approves a valid preview, **When** the topic is saved, **Then** the approved curriculum becomes the published topic version.

### User Story 2 - Persistent Single Tutor Conversation (Priority: P1)

A learner starts or resumes one conversation for a topic. Teaching, questions, learner answers, hints, objective verification, task attempts, and objective advancement appear in the same conversation and resume without losing prior context.

**Why this priority**: It unifies the learner experience and prevents teaching and verification from becoming disconnected flows.

**Independent Test**: A learner starts a topic, answers and requests hints, leaves and returns, and continues the same topic conversation with prior messages and mastery state preserved.

**Acceptance Scenarios**:

1. **Given** a learner starts a topic with no session, **When** the learner opens the tutor, **Then** the conversation begins with a question-first prompt that identifies the active objective.
2. **Given** a learner resumes a topic, **When** the conversation is reopened, **Then** prior messages, active objective, hints, and mastery progress are still visible and usable.
3. **Given** an objective is not mastered, **When** the learner answers or asks for help, **Then** teaching and evidence evaluation continue in the same conversation.
4. **Given** a learner submits a code or exercise task, **When** the verified outcome is received, **Then** compatible objective evidence and feedback appear in the conversation.

### User Story 3 - Backend-Authoritative Tutor Stages (Priority: P1)

The learner cannot force stage transitions or objective completion from the browser. The server determines the current stage, allowed objective, mastery state, and next stage after validated evidence.

**Why this priority**: Correct stage progression and mastery must remain secure and consistent across retries and clients.

**Independent Test**: Repeated requests and conflicting client stage values do not alter server-authoritative state or advance objectives without sufficient evidence.

**Acceptance Scenarios**:

1. **Given** a learner sends a message, **When** stage or objective information is absent or conflicting, **Then** the server resolves state from stored session and progress.
2. **Given** an objective lacks sufficient validated evidence, **When** a response is sent, **Then** it remains the active objective.
3. **Given** all required evidence is validated, **When** the learner continues, **Then** the server advances to the next objective or completes the topic.

### User Story 4 - Safe Idempotency and Evidence Integrity (Priority: P1)

Retries, duplicate messages, and repeated exercise submissions do not duplicate evidence or falsely increase mastery. Evidence is tied to the objective, topic version, learner, session, message or attempt, and approved rubric.

**Why this priority**: Retrying network requests must be safe and objective mastery must be reproducible.

**Independent Test**: The same submission key or identical message replay is processed once and produces the same evidence and progress state.

**Acceptance Scenarios**:

1. **Given** a learner retries the same request with the same submission key, **When** processing is repeated, **Then** no duplicate evidence or progress is created.
2. **Given** a retry changes the learner response or request scope, **When** the same submission key is reused, **Then** the request is rejected or handled safely as a mismatch rather than mutating progress.
3. **Given** evidence quotes a learner response, **When** the response text is not actually present in the quoted source, **Then** the evidence is not accepted.
4. **Given** a verified task proves a criterion, **When** the criterion is compatible with that task, **Then** only the compatible criterion is affected.

### User Story 5 - Adaptive Question-First Teaching (Priority: P2)

The tutor adapts to prior knowledge and learner responses, begins with a question or prompt when appropriate, then teaches only what is needed. Hints become progressively more useful without revealing the complete answer or final solution.

**Why this priority**: This makes tutoring effective while protecting against direct-answer leakage.

**Independent Test**: Learners at different knowledge levels receive different prompts, and repeated hint requests reveal progressively more guidance while still requiring an independent learner response.

**Acceptance Scenarios**:

1. **Given** a learner demonstrates prior knowledge, **When** the tutor responds, **Then** it advances or reduces unnecessary explanation rather than repeating known material.
2. **Given** a learner misses a concept, **When** the tutor responds, **Then** it teaches or probes the missing concept instead of declaring mastery.
3. **Given** the learner requests hints, **When** hints are issued in sequence, **Then** each hint adds support without revealing the full answer, solution code, or verified response.
4. **Given** the learner asks for a direct answer, **When** the tutor can only provide a safe hint, **Then** the tutor declines to leak the answer and prompts the learner toward independent demonstration.

### User Story 6 - Preservation and Regression Safety (Priority: P1)

The redesign preserves existing authentication, entitlement checks, module versioning, AI provider selection, and secure Java execution behavior.

**Why this priority**: Redesigning the Tutor must not weaken platform access or execution boundaries.

**Independent Test**: Existing authorized and unauthorized user flows, purchases, version snapshots, provider configuration, and code execution constraints remain observable and pass focused regression checks.

**Acceptance Scenarios**:

1. **Given** an unauthenticated or unauthorized user, **When** they access protected Tutor or authoring actions, **Then** access is denied as before.
2. **Given** a learner lacks an active entitlement, **When** they start or continue a topic, **Then** access remains unavailable.
3. **Given** a published module is later changed, **When** an enrolled learner resumes, **Then** the learner continues against the approved published version.
4. **Given** a code task is submitted, **When** it is evaluated, **Then** execution remains within the existing secure Java boundary.

## Edge Cases

- The AI proposal is unavailable or returns incomplete, overlong, duplicate, or contradictory objectives.
- A learner retries a message after a timeout or provider interruption.
- A learner resumes after publishing a new module version.
- A learner has partial objective evidence across several sessions.
- A learner repeatedly asks for answers or hints.
- A learner submits a response in an unsupported or mixed language.
- A task submission arrives before a matching tutor session exists or belongs to another version.
- A code, theory, or math task provides evidence that does not match its linked objective or rubric.

## Requirements

### Functional Requirements

- **REQ-001**: Administrators MUST be able to author a topic by supplying a title, short description, pasted objectives/content, and optional supporting context.
- **REQ-002**: The authoring interface MUST NOT require manual entry of low-level curriculum structures for the default topic-authoring flow.
- **REQ-003**: The system MUST generate a curriculum preview for human review without publishing it.
- **REQ-004**: A preview MUST identify ordered objectives, objective descriptions, expected outcomes, mastery criteria, required knowledge, misconceptions, and practice tasks.
- **REQ-005**: Malformed or incomplete previews MUST be rejected and reported without creating a published topic.
- **REQ-006**: Publishing MUST require explicit administrator approval of the generated or edited preview.
- **REQ-007**: Published topic objectives and rubric criteria MUST remain fixed for a module version.
- **REQ-008**: Learners MUST have one persistent conversation for each topic session.
- **REQ-009**: Conversation state MUST preserve prior messages, active objective, hint state, and objective progress across resume and network retries.
- **REQ-010**: Teaching and objective verification MUST occur in the same conversation rather than requiring an unrelated verification mode.
- **REQ-011**: The server MUST determine the active stage and objective; client-supplied stage or objective values MUST not override stored state.
- **REQ-012**: The system MUST support stages for introduction/discovery, objective teaching, objective assessment, progression, completion, and safe retry.
- **REQ-013**: Objective progression MUST require validated evidence that satisfies all approved criteria for the active objective.
- **REQ-014**: Evidence MUST be objective-level and MUST identify the source, session, message or attempt, topic version, rubric criterion, result, and source quote or verified outcome.
- **REQ-015**: The system MUST reject evidence that quotes text not present in the learner's response or cannot be tied to an approved criterion.
- **REQ-016**: A code, theory, or math task MUST affect only mastery criteria compatible with that task and objective.
- **REQ-017**: Duplicate or retried requests with the same safe submission identity MUST not duplicate evidence or progress.
- **REQ-018**: Reusing a submission identity for a different response or scope MUST fail safely and without applying evidence.
- **REQ-019**: The tutor MUST begin with or adaptively ask a question first before extended explanation when the objective permits it.
- **REQ-020**: The tutor MUST adapt teaching to demonstrated prior knowledge and missing concepts.
- **REQ-021**: Hints MUST be progressive, topic-bounded, and non-leaking across repeated requests.
- **REQ-022**: Hints MUST not reveal a complete answer, final code solution, verified response, or hidden rubric.
- **REQ-023**: Authentication and entitlement checks MUST remain mandatory for all learner and administrator Tutor actions.
- **REQ-024**: AI provider selection and configuration MUST remain abstractions usable by the existing Tutor without exposing provider secrets to clients.
- **REQ-025**: Module publication and learner progress MUST preserve existing versioned behavior.
- **REQ-026**: Code exercise evaluation MUST remain inside the existing secure execution boundary.

### Non-Functional Requirements

- **REQ-027**: A learner MUST be able to resume a conversation after reopening or refreshing the application.
- **REQ-028**: Duplicate actions MUST be safe under normal network retry conditions.
- **REQ-029**: Tutor and authoring validation messages MUST be understandable and actionable to users.
- **REQ-030**: The learner conversation and objective state MUST remain usable at desktop and mobile widths.
- **REQ-031**: The redesign MUST provide observable acceptance evidence through focused tests for authoring, conversation, stages, evidence, mastery, hints, retries, and preservation boundaries.

## Key Entities

- **Topic Draft**: Administrator-entered title, description, objectives/content, and optional supporting context before approval.
- **Curriculum Preview**: Generated, non-published reviewable proposal with ordered objectives and practice tasks.
- **Tutor Conversation**: Persistent topic-specific message history and active learner session state.
- **Objective**: Versioned learning outcome with prerequisite relationships and mastery criteria.
- **Mastery Evidence**: Source-linked objective result tied to a learner, session, message or task attempt, and topic version.
- **Mastery State**: Server-authoritative objective, criterion, hint, and topic progression status.
- **Task Attempt**: Idempotent learner exercise submission and verified result.
- **Published Topic Version**: Snapshot of approved topic and curriculum used by enrolled learners.

## Assumptions

- Existing authentication, entitlement, module versioning, provider abstraction, and secure Java execution are baseline features that must be preserved rather than redesigned.
- English and Tamil remain supported learner language preferences unless a later product decision says otherwise.
- One objective is active at a time; prerequisite objectives are complete before later objectives become active.
- Hints are not evidence of mastery unless an objective's rubric explicitly allows such evidence.
- AI-generated curriculum and evidence remain advisory until validated and, where applicable, approved by a human or the server.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of valid title/description/pasted-content submissions produce a reviewable curriculum preview or a clearly actionable validation result.
- **SC-002**: No curriculum preview becomes learner-visible or changes progress until explicitly approved and published.
- **SC-003**: 100% of repeated identical submissions in focused tests create no duplicate message, evidence, or mastery update.
- **SC-004**: 100% of conflicting retry scopes are rejected or remain unchanged rather than advancing mastery.
- **SC-005**: 100% of mastered objectives have sufficient linked, validated evidence for every required rubric criterion.
- **SC-006**: A learner can resume prior conversation and objective state after closing and reopening the topic with no loss of existing evidence.
- **SC-007**: A hint sequence never exposes the full answer or final code solution in focused no-leak tests.
- **SC-008**: Existing authorized and unauthorized access behavior, entitlements, version snapshots, AI provider configuration, and secure Java execution remain passing in focused regression tests.
- **SC-009**: Learners complete the primary topic flow without a required separate verification screen in accessibility and responsive testing.
