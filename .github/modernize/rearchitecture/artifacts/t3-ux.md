# t3 — Simplified Authoring and Persistent Tutor UX

## Summary

This specification replaces the default topic-authoring complexity with a three-step review flow and makes the learner conversation the single persistent surface for teaching, hints, exercise attempts, objective verification, and completion.

The design preserves existing authentication, entitlement, module version snapshots, AI-provider configuration, and secure code-execution boundaries. It does not allow the browser to set an active stage or master an objective.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t1-pm.md` — task scope and requirement boundaries.
- `.github/modernize/rearchitecture/artifacts/spec.md` — REQ-001–REQ-031 and learner/administrator scenarios.
- `.github/modernize/rearchitecture/artifacts/requirements-checklist.md` — redesign and preservation coverage.
- `.github/modernize/rearchitecture/artifacts/project-structure.md` — Learning Center and backend boundaries.
- `.github/modernize/rearchitecture/artifacts/tech-stack.md` — existing React UI and runtime constraints.
- `.github/modernize/rearchitecture/artifacts/units/learning-center-ui/behavior.yaml` — existing in-page validation behavior.
- `.github/modernize/rearchitecture/artifacts/units/admin-curriculum-authoring/behavior.yaml` — proposal generation and non-publishing behavior.
- `.github/modernize/rearchitecture/artifacts/units/learner-tutor-conversation/behavior.yaml` — server-authoritative state and evidence constraints.
- `.github/modernize/rearchitecture/artifacts/cross_unit_state.yaml` — persisted session and version pairing.
- `.github/modernize/rearchitecture/artifacts/wire_contracts.yaml` — existing proposal, tutor-message, and exercise contracts.
- `.github/modernize/rearchitecture/learnings/architect/server-authoritative-tutor-state.md` — stage and objective state ownership.

## Evidence Mapping

- REQ-001–REQ-006, User Story 1 → **Authoring flow**: simple inputs, non-published preview, edit, approval, and publish gate.
- REQ-007, REQ-025 → **Published curriculum snapshot**: approved objective and rubric content shown consistently with module version.
- REQ-008–REQ-013, REQ-027 → **Persistent conversation**: resume state, server-resolved stage/objective, and no separate verification route.
- REQ-014–REQ-018, SC-003–SC-004 → **Attempt and retry states**: repeat-safe feedback and mismatch/error handling without optimistic mastery.
- REQ-019–REQ-022, SC-007 → **Question-first teaching and hints**: concise prompt-first response and progressive non-leaking hint affordances.
- REQ-023–REQ-026, SC-008 → **Preservation notices and boundaries**: existing access, entitlement, provider, version, and execution behavior remains unchanged.
- REQ-029–REQ-030 → **Validation and responsive behavior**: actionable in-page messages, keyboard support, and one-column mobile layout.

## 1. Simplified Topic Authoring

### Authoring entry

Replace the default authoring form with exactly these visible fields:

1. **Title** — single-line text field, required.
2. **Description** — short multiline field, required.
3. **Learning objectives and content** — large paste/edit area, required.
4. **Supporting context** — optional paste/edit area.

Do not expose curriculum-objective editors, rubric criterion editors, misconception fields, or practice-task builders in the default flow. Advanced editing is available only after preview generation.

### Primary action

- Label: **Generate curriculum preview**.
- Disabled until title, description, and pasted objectives/content are non-empty.
- Show a single concise inline reason when disabled.
- Do not submit with a missing field or silently publish.

### Authoring states

#### Draft

- Preserve text while navigating between fields.
- Show character or size guidance only after the relevant limit is approached.
- Keep supporting context visually secondary.

#### Generating

- Disable only generation and publish controls.
- Preserve editable draft fields.
- Show an inline status: **Generating a curriculum preview…**
- Do not display a false success or partially generated curriculum.

#### Preview ready

Present a read-only-first curriculum card with this order:

1. Ordered objectives.
2. For the selected objective: description and expected outcome.
3. Required knowledge.
4. Mastery criteria.
5. Common misconceptions.
6. Practice tasks.

Use an objective navigator instead of a dense table. The first objective is selected on entry. Selecting an objective changes only the detail panel.

#### Preview validation failure

- Keep the draft and supporting content visible.
- Show the specific actionable problem in the preview region.
- Offer **Try again** and **Edit draft**.
- Never show **Publish**.

#### Approved preview

- Show a persistent **Approved for publication** state.
- Require a separate explicit **Publish topic** action.
- Before publication, show: topic title, objective count, version-impacting statement, and publish confirmation.
- Display no publish action while the preview is unapproved or invalid.

#### Rejected preview

- Keep the preview and draft available for editing.
- Clear approval state.
- Label the curriculum as **Not approved**.
- Any edit to title, description, source content, supporting content, or preview content invalidates approval.

### Hidden low-level fields

Backend-generated structure may still be exposed as review/edit details after preview generation, but it must remain subordinate to the four-source-fields-first workflow. Advanced details must be reversible and must not publish in the same action as preview generation.

## 2. Persistent Learner Tutor

### Conversation as the single surface

The topic page has one persistent conversation region. It contains:

- Tutor and learner messages.
- The question or prompt for the active objective.
- Objective progress.
- Progressive hint controls and hint history.
- Text, theory, math, or code exercise attempts.
- Server feedback and evidence status.
- Completion state.

Do not add a separate verification page, mastery quiz route, or disconnected objective-completion modal.

### Page structure

Desktop layout:

- Left rail: topic/objective progress.
- Main column: conversation.
- Right rail, when space allows: active objective summary and compact hint state.
- Mobile: single conversation column; objective progress is a collapsible **Objective status** region above it.

The objective rail is informational and read-only to the learner. It must not offer arbitrary stage jumps or manual objective completion.

### Initial message

On a new session, begin with:

1. Active objective label.
2. A brief question or prompt-first tutor message.
3. A text response input.
4. Optional exercise affordances when the objective has compatible practice tasks.

Do not place long prerequisite teaching ahead of the first question. The server may shorten or deepen the prompt based on stored evidence.

### Resume

When reopening or refreshing:

- Restore message order and loaded history.
- Restore the server-reported active objective and progress.
- Restore hint count or hint state where permitted.
- Place a visible **Resumed conversation** divider at the first newly loaded boundary.
- Scroll to the latest unread or active prompt, not an unrelated page position.

If stored state cannot be matched to the published topic version, show a preserved-history notice and offer a safe version-compatible resume action. Do not advance or complete objectives from the mismatch.

### Message and response behavior

- Send button is disabled for empty or already-in-flight text.
- Disable repeated submit of the same in-flight action.
- Show a sending state and keep the learner text visible.
- On timeout or provider interruption, show **Response pending or interrupted** and preserve the draft.
- Offer one retry action; do not submit a duplicate after the original action completes.
- Never optimistically mark an objective complete or advance the stage.
- When feedback arrives, update objective status only from the server response.

## 3. Hint and Teaching UX

### Hint affordance

Place a **Request hint** action beneath the active prompt or response area. Show the current hint level without exposing hidden rubric content.

Progressive sequence:

1. **Orient** — point toward the concept or relevant model.
2. **Narrow** — identify a useful distinction or next step.
3. **Scaffold** — provide a worked structure or partial prompt, not the verified answer or complete code.

Repeated hint requests add one level only. A hint may stop at the safety limit even if requested repeatedly.

Direct-answer requests receive a safe tutor response:

- State that the direct solution will not be provided.
- Give the next non-leaking hint or ask for a learner demonstration.
- Preserve the active objective and do not award evidence merely for requesting help.

Hints remain visible in the conversation in the order issued. Refreshing must not reset already-issued hint state.

## 4. Objective Evidence and Exercise Feedback

The active objective rail must show only:

- Objective name.
- Progress such as **Not started**, **In progress**, or **Mastered**.
- Required evidence count or criterion labels, if needed for learner understanding.
- Completion status for the topic.

Do not expose internal criterion keys, hidden confidence scores, evidence quote reconstruction, provider secrets, or client stage values.

### Exercise attempt in conversation

For text, theory, math, or code tasks:

- Render the task as a normal conversation card.
- Open the existing code editor or submission control inside the conversation only.
- Show attempt status: **Submitted**, **Processing**, **Accepted**, **Needs revision**, or **Unavailable**.
- Show brief criterion-compatible feedback from the server.
- Keep prior attempts readable and distinguish the latest attempt.

Do not show a separate success overlay that replaces the conversation. Retried submissions return the same feedback and attempt state and must not visually duplicate the attempt.

### Evidence mismatch or retry conflict

- Keep learner content unchanged.
- Display an actionable in-conversation error.
- Do not advance or update mastery.
- Offer **Retry this action** only when the server indicates retry is safe.
- For a submission identity mismatch, clearly state that a conflicting prior submission exists and require a new scope or action.

## 5. Accessibility

The authoring and tutor surfaces must meet the following:

- All fields have persistent visible labels and programmatic names.
- Validation errors are associated with fields and announced once.
- Preview objective selection is operable by keyboard and exposes the selected state.
- Send, hint, edit, approve, and publish actions are native buttons with visible focus rings.
- Conversation history uses a semantic list or region with per-message author labels.
- New tutor messages and status updates use polite live regions; urgent conflicts use an assertive alert only.
- Hints do not depend on color; use text labels and ordered level names.
- Progress states include text, not only icon or color.
- The code editor has a labelled editor region and keyboard-accessible submit control.
- Mobile layout uses 44 px minimum touch targets and avoids horizontal scrolling.
- Text remains usable with browser zoom to 200%.

## 6. Responsive and Failure Behavior

### Desktop

- Authoring preview uses a two-column review layout: objectives at left, selected details at right.
- Conversation uses the topic rail, message column, and optional objective/hint rail.
- Dense tables and horizontal conversation controls are not used.

### Mobile

- Authoring fields and preview details use one column.
- Objective preview is one vertically ordered card at a time with a compact objective stepper.
- Conversation occupies the full width.
- The objective status and hint history are collapsible, closed by default after active prompt is visible.
- Long code or attempt text wraps or scrolls inside an enclosed region rather than expanding the page horizontally.

### Loading and unavailable states

- Every asynchronous action has a text label and loading state.
- AI-provider unavailable: do not publish or advance; show retry guidance.
- Session unavailable: preserve draft and do not invent a new session silently.
- Entitlement or authorization loss: show the existing access denial behavior and stop all tutor actions.
- Execution unavailable: mark the exercise attempt unavailable; do not present it as accepted evidence.

## 7. Interaction Acceptance Scenarios

1. **Given** an administrator opens authoring, **When** the title, description, and pasted content are present, **Then** only the simple source fields are required and **Generate curriculum preview** becomes available.
2. **Given** generation completes, **When** the preview is displayed, **Then** no topic or enrollment state changes and approval remains required.
3. **Given** a preview or curriculum is edited after approval, **When** the user resumes authoring, **Then** approval is invalidated and publication is unavailable.
4. **Given** a learner starts or resumes a topic, **When** the page opens, **Then** one conversation shows the server-reported objective and current progress.
5. **Given** a learner requests successive hints, **When** a new hint is issued, **Then** each hint is visible in the conversation and the sequence never exposes full-answer or final-solution content.
6. **Given** a learner retries a message or task, **When** the same identity and scope are repeated, **Then** the UI shows one resulting action and server-equivalent progress.
7. **Given** an exercise is rejected or unavailable, **When** feedback arrives, **Then** the conversation remains active and the objective is not advanced.
8. **Given** the viewport narrows, **When** the learner uses objective status or the conversation, **Then** content remains readable and all actions stay reachable.

## 8. Role Boundaries and Implementation Handoff

**Frontend must implement**

- Simple authoring fields and preview/approval state.
- Persistent conversation layout and server-snapshot rendering.
- Accessible hint, exercise, retry, resume, and error states.
- Responsive topic progress and mobile conversation behavior.
- No client-owned stage, objective, or mastery mutation.

**Backend must provide**

- Server-resolved stage and active objective in conversation responses.
- Safe hint state and preview-approval state.
- Scope/version/key-aware idempotency results.
- Validation failure messages suitable for in-page display.

**Do not add**

- A standalone quiz or verification route.
- Browser-controlled stage/objective fields.
- Optimistic objective completion.
- Full-answer hint rendering.
- Reuse of a preview as a published topic before explicit approval.

## Test Design — UX Acceptance

- Verify keyboard and screen-reader authoring and preview flows.
- Verify desktop and mobile layouts at narrow and wide widths.
- Verify resume after refresh, provider interruption, timeout, and exercise submission.
- Verify no publication, mastery, or stage changes occur from preview or client-only state.
- Verify hint progression and direct-answer refusal in the conversation.
- Verify repeated actions do not create duplicate message or attempt cards.

## Remaining UX Decisions

None requiring a clarification marker. All significant authoring and tutoring choices have a safe default grounded in the PM requirements and existing architecture.
