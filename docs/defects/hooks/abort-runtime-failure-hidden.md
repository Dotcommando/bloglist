# A hook transaction hid a fatal abort failure and replayed writes

- ID: `hooks/abort-runtime-failure-hidden`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: hook-transaction, abort, MongoRuntimeError, retry, cause-preservation.

The host swallowed all abortTransaction rejections before considering a write-conflict retry. A supported fatal driver abort rejection disappeared and the operation could return a successful replay.

Correction: Preserve the operation and abort failures together and stop that invocation before replay. Ordinary supported driver abort handling remains inside the pinned driver; successful abort/write-conflict retry and uncertain commit rules stay unchanged.

Outcome/recovery: The source call fails truthfully; no success, blind replay or operator session-object intervention is invented. Its caller can reread the owning business state under existing guarded retry rules after the technical fault is resolved.

## Regression and prevention

[Owning regression](../../../test/adapters/hook-transaction.spec.ts).
Executed RED returned 'must not replay' after an injected MongoRuntimeError abort rejection. GREEN preserves both causes, one write, no commit and awaited session completion. The pinned method was inspected: this error class is propagated; an arbitrary post-commit leak is not claimed.

Follow [current contract](../../arch/hooks.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing lifetime/error/recovery rules already required this outcome; earlier
fixtures omitted this fault boundary. Keep the demonstrated regression and cite
the owning rule instead of duplicating global instructions. No vulnerability,
production outage or external deployment success is asserted.
