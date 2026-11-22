# Local probe-key failure was reported as an invalid administration address

- ID: `installation/probe-key-storage-error-masking`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, not published.
- Read for: administration-address changes, installation verification keys,
  reachability, dependency failures and Validation/technical error classification.

The real reachability adapter loaded its private installation key inside a broad
catch that mapped every rejection to address Validation. A storage failure became
"Administration is unavailable at the new address", incorrectly directing the
administrator to correct the destination instead of reporting the local dependency
failure. Settings were not committed; no authorization bypass was demonstrated.

Load the required local key before starting remote verification, within the same
ten-second total budget. A key-store failure propagates through the existing technical
failure route before DNS/transport; settings remain unchanged. Expected candidate
DNS/TLS/status/proof failures retain the established Validation outcome. No remote
request, credentials, blind settings retry or dead-end JS-resource notification
is introduced. Local storage availability is owned by the existing dependency
lifecycle, not repaired by inventing another hostname.

Executed regression: [installation-settings.spec.ts](../../../test/adapters/installation-settings.spec.ts),
`propagates key-store failure before attempting remote address verification`.
RED returned a BusinessError/Validation instead of the injected storage Error;
GREEN preserves the same Error and proves DNS/transport never start. Adjacent
address/proof and use-case checks passed (35 tests including no-op, post-probe
revocation and pending-key total-deadline coverage). Fake DNS/transport keeps
this adapter test deterministic; all three real singleton/HTTP installation
integration scenarios passed. Late key rejection stays observed and cannot start
DNS/transport after the deadline.

Prevention: [error outcomes](../../cms-development/feature-design.md#error-outcomes-and-recovery),
[authentication/installation contract](../../arch/admin-authentication.md),
[review evidence](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).
An existing rule covered this distinction; the previous adapter fixture omitted
the local key-provider failure and only checked candidate rejection.
