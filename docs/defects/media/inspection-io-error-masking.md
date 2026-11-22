# Media inspection blamed file content for a system read failure

- ID: `media/inspection-io-error-masking`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: inspection, temporary-file, system-I/O, error-classification.

## Failure, guarantee and recovery

A standard staged-file EIO/open error was converted into FileImageContent/Validation. The client was told the uploaded image was invalid despite a local system read failure.

Cause: The catch classified every non-domain inspection exception as bad content, including Node system errors with code/syscall metadata.

Correction: Continue releasing inspected temporary bytes, but propagate identified system-operation errors through the existing technical route. Preserve the precise existing media validation outcomes for malformed content.

Outcome: The failed upload has no accepted library/public entry; retain the selected input and permit a fresh upload after storage is available. Do not ask the author to repair valid image bytes or hide a storage problem as success.

## Regression and prevention

[Inspection regression](../../../test/adapters/media-inspection-errors.spec.ts): `propagates staged-file system errors and releases temporary content`; nearby actual file-type/geometry tests.

RED returned MediaValidationError rather than injected EIO. GREEN preserves that same technical error and proves the temporary directory was removed; the three-file type/geometry selection passed 15 tests. File-type rejection is controlled, staging/cleanup and fixture PNG generation are real.

Follow the [owning guarantee](../../arch/site-files.md) and
[scoped verification log](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).
Existing standards already covered this boundary; the missing fault/transfer
assertion allowed it to escape. Windows/synthetic fixture evidence does not
claim whole-product security or live-installation verification.
