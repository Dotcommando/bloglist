# Restricted pickers rejected MIME types after saving

- ID `media/picker-mime-after-save`.
- Confirmed bug, fixed in the 0.17.0 candidate.
- Discovered 2026-11-25. Affected candidate `84eec60`. Earlier range unknown.
- Read for file picker, MIME inspection, streamed upload.

An upload accepted by Files but excluded by the current picker could be stored before the
picker rejected it. The rejected item remained in the library.

Compare the picker allowlist with the server-inspected MIME type before writing the asset and
let the ordinary Files upload use its full supported list.

The Files HTTP regression sends a valid PNG through a JPEG-only restriction, checks the error
and absence of persisted rows, then uploads the same PNG without that restriction.
[Executed regression](../../../test/integration/file-library.integration.spec.ts).

[Candidate evidence](../../changes/0.17.0/files-library/50-verification.md).
