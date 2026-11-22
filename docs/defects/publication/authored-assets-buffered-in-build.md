# Authored binary assets were buffered by the frontend builder

- ID: `publication/authored-assets-buffered-in-build`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: frontend-build, local-assets, memory, streaming, checksums.

## Failure, guarantee and recovery

The build copied an entire referenced local SVG/image/font/PDF through readFile and retained it in an in-memory artifact. Transfer memory grew with total binary asset size, violating the current streamed-I/O boundary.

Cause: The builder reused the byte-array artifact helper for binary file transfer instead of a scoped lazy file-content source.

Correction: Hash the verified canonical file through bounded reads; publish matching size/MIME/checksum metadata and repeatable chunked content. The staging writer still validates the eventual bytes; changing source files cannot silently activate a checksum-mismatched release.

Outcome: Successful builds preserve public paths/content. Storage or integrity failure rejects staging and leaves the active release unchanged; no output is reported as published merely because metadata was prepared.

## Regression and prevention

[Asset lifetime regression](../../../test/adapters/frontend-asset-lifetime.spec.ts): `keeps authored binary assets lazy and transfers them in bounded chunks with matching metadata`; nearby frontend/named-media/release URL/raw-document checks.

RED observed readFile of the entire synthetic 2 MiB asset. GREEN proves no bulk readFile call for that path, transfer chunks at most 64 KiB, exact size and independent SHA-256. The six-file frontend selection passed 14 tests. This proves the selected I/O mechanism, not a measured whole-build memory benchmark.

Follow the [owning guarantee](../../arch/streamed-file-io.md) and
[scoped verification log](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).
Existing standards already covered this boundary; the missing fault/transfer
assertion allowed it to escape. Windows/synthetic fixture evidence does not
claim whole-product security or live-installation verification.
