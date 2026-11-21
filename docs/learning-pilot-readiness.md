# Adaptive Learning Controlled Pilot Checklist

Use this checklist before inviting any real learners. A check is complete only when an operator records dated evidence from the target environment.

## Curriculum and publishing

- [ ] Admin access is limited to authorized curriculum authors.
- [ ] Every topic has ordered objectives, explicit mastery criteria, and reviewed prerequisite links.
- [ ] Tasks are linked to the objectives and criteria they assess; answer keys and hidden Java tests are not included in student payloads.
- [ ] Reviewers approve the topic content, misconceptions, alternative answers, tolerances, and expected completion path.
- [ ] Publish creates an immutable version; a later edit creates a new version without changing enrolled learners' snapshots.
- [ ] Admin preview has been exercised for tutor responses, math, and Java tasks and did not create learner progress, sessions, certificates, or a published version.

## Student onboarding and access

- [ ] Pilot accounts use the normal authentication and authorization flow.
- [ ] Each learner has an active entitlement for the published module; expired, pending, and missing entitlements are rejected.
- [ ] Learner ownership checks prevent another learner from reading or changing sessions, progress, evidence, and certificates.
- [ ] A learner without prior knowledge can start at the first objective; prior evidence is scoped to the objective and published version.
- [ ] Topic and objective prerequisites prevent out-of-order work.

## Learning journey and evaluation

- [ ] Learners can resume an interrupted session and continue on the same published version.
- [ ] Tutor prompts use only the active objective and approved topic knowledge.
- [ ] Evaluation evidence quotes the learner's response, cites an approved criterion, and meets the server confidence threshold.
- [ ] Invalid AI output, unsupported criteria, invalid quotations, timeouts, and provider errors never grant mastery.
- [ ] Duplicate submissions are idempotent; concurrent conflicting submissions do not silently overwrite progress.
- [ ] Mathematics tests cover supported arithmetic, percentages, ratios, roots, units, tolerances, and unsupported symbolic inputs.
- [ ] Java submissions run only through the isolated secure runner. Compilation/runtime errors, timeouts, resource limits, malformed responses, and runner failures never grant mastery.
- [ ] Hidden Java test inputs and expected outputs are not returned in student APIs or feedback.
- [ ] Completion requires all approved objectives and the module's configured requirements; certificate generation is verified.

## Live evaluation gates

- [ ] Run the theory calibration dataset against the exact configured provider and model; attach the report and review each false positive.
- [ ] Require zero false-positive mastery on the pilot calibration set before enrollment; review false negatives and citation validity as well.
- [ ] Record provider latency and prompt/completion tokens when reported. Mark cost unavailable unless provider pricing is configured and measured.
- [ ] Exercise the production-like Java runner with valid, incorrect, malformed, compile-error, runtime-error, timeout, memory-limit, multi-case, hidden-case, duplicate, and unavailable-runner scenarios.
- [ ] Verify deterministic math tasks do not make unnecessary AI calls.
- [ ] Verify provider and runner failures are visible to the learner/admin and produce actionable operational logs.

## Operations and stop conditions

- [ ] Configure certificate email delivery and verify success/failure handling.
- [ ] Confirm rate limits, database backups, access controls, and retention policies in the target environment.
- [ ] Define who monitors AI usage, latency, failures, runner health, completion rates, and certificate delivery.
- [ ] Define a support contact, incident owner, and procedure to pause enrollment without deleting learner evidence.
- [ ] Stop onboarding if any false-positive mastery is observed, hidden tests are exposed, another learner's data is accessible, objective versions drift, or the AI/runner is unavailable without an approved fallback.
- [ ] Review pilot outcomes before expanding enrollment; do not infer production readiness from unit tests or a small pilot.

## Current validation status

- Real MongoDB lifecycle: covered by the opt-in integration test when `MONGODB_TEST_URI` targets a uniquely named `ccp_phase3_test_*` database.
- Live AI provider calibration: requires a reachable configured provider; the harness reports `BLOCKED` when none is reachable.
- Live secure Java runner: requires a reachable configured runner and authorized test environment.
- Certificate email delivery: requires a valid email-provider configuration in the target environment.

The current checkout is not ready for a student pilot until all three live integration gates (database, AI calibration, and secure runner) have evidence from the intended deployment environment.
