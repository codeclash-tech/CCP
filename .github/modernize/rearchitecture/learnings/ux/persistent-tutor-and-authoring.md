# Persistent Tutor and Simplified Authoring UX

Keep authoring source inputs separate from AI curriculum review and keep tutoring, evidence, hints, and exercise feedback in one persistent conversation.

## What Happened

The CCP AI Tutor redesign was specified for task t3. PM requirements and architecture artifacts establish proposal generation as non-publishing and tutor stage state as backend-authoritative.

## Takeaway

The default administrator flow should expose only title, description, pasted objectives/content, and optional supporting context. The generated curriculum is a review-only preview until explicit approval and a separate publish action. Learners should see a persistent topic conversation with server-reported objective progress, hint state, and attempt feedback; browser state must never control stage or mastery.

Use text plus icons for progress and hint levels, semantic live regions for new messages, and no separate verification route.

## History
- 2026-11-21 (CCP/t3): initial
