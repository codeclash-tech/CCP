## [t3] Specified simplified authoring and persistent tutor UX
- Discovered that the current learning UI behavior already separates proposal generation from publication and can support a read-only preview plus explicit approval.
- Chose a one-conversation learner experience with server-reported progress because arbitrary client stage values would create inaccessible and unsafe navigation.
- Chose progressive hint levels in the conversation rather than a separate hint or verification screen.
- Preserved existing auth, entitlements, versioning, provider, and execution boundaries.
- Learnings consumed: none; architect/server-authoritative-tutor-state cross-cutting.
