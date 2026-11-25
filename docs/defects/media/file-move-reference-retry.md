# A failed link update had no durable retry

- ID `media/file-move-reference-retry`.
- Confirmed bug, fixed in the 0.17.0 candidate.
- Discovered 2026-11-25. Affected candidate `84eec60`. Earlier range unknown.
- Read for move, draft rewrites, publication activation, recovery.

Movement committed before link replacement, and failure left no explicit durable link plan or
retry action. An operator could not tell which work remained.

Persist the plan with the moved file. Reapply content and publication work by file ID,
checking that every old path is still free of other owners. Clear the plan after completion.

The Files HTTP regression interrupts content and publication separately, checks a reclaimed
old address, restarts CMS and retries without a second move.
[Executed regression](../../../test/integration/file-library.integration.spec.ts).

[Candidate evidence](../../changes/0.17.0/files-library/50-verification.md).
