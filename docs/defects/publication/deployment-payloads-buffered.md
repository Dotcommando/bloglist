# Deployment preparation retained complete binary payloads in memory

- ID: `publication/deployment-payloads-buffered`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: PrepareSiteDeployment, Cloudflare-preparation, public-files, streaming, CSP.

The output adapter concatenated each public payload (up to its 25 MiB provider limit) and kept all file bytes in the installed map. A per-file limit did not bound total retained export payload memory.

Cause: The adapter used byte arrays both for copying files and for later static-HTML CSP extraction, instead of separating transfer from the selected HTML metadata read.

Correction: Stream each payload into a private transfer file with bounded size/checksum verification, then move it into the owned preparation tree or discard an identical duplicate. Keep only installed metadata. Extract inline style hashes through the existing streamed file helper; preserve provider size limits, origin fallback, ownership and atomic replacement.

Outcome: Preparation failure preserves the last complete export and active publication. A retry rebuilds only owned temporary output. No live upload/deployment, operator JS-object intervention or silent checksum fallback is introduced.

## Regression and prevention

[Streaming regression](../../../test/adapters/cloudflare-deployment-streaming.spec.ts): `streams public deployment payloads without collecting binary files into Buffer arrays`; [atomic output tests](../../../test/adapters/cloudflare-deployment.spec.ts); [local preparation/Worker integration](../../../test/integration/cloudflare-deployment.integration.spec.ts).

RED observed a 2 MiB Buffer.concat from 32 synthetic 64 KiB chunks. GREEN proves no bulk concatenation, exact on-disk size and independent SHA-256; eight output tests and the real local preparation integration pass. This is a mechanism regression, not a measured complete-process memory benchmark. Cloudflare API was not called.

Follow [streamed I/O](../../arch/streamed-file-io.md) and the
[review verification](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).
The existing transfer policy already covered this adapter; its tests omitted a
large multi-chunk export. No vulnerability or deployment success is asserted.
