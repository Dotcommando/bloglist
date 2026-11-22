# Executor readiness depended on a fixed administration path

- ID: `deployment/backend-probe-used-admin-route`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: Cloudflare-check, backend-health, custom-admin-address, false-delivery-rejection.

The provider adapter probed /admin/ while the current installation supports a configurable administration address. A healthy backend with /api/health=200 and /admin/=404 was falsely rejected before upload.

Correction: Use the same bounded HEAD /api/health contract as deployment inspection, without redirects, cookies, installation-address coupling or new credentials.

Outcome/recovery: Healthy installations can deliver with their approved administration address. Real health/network failure retains the existing typed retryable Backend diagnostic and no upload; no administrator must revert an unrelated address setting.

## Regression and prevention

[Owning regression](../../../test/adapters/cloudflare-delivery.spec.ts).
Executed RED returned Backend for the healthy independent endpoint. GREEN checks accepted health, HEAD/manual/no-store request and no upload/preparation during check. Requests are controlled peers; no live Cloudflare outage/API call is claimed.

Follow [current contract](../../arch/deployment-contracts.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing lifetime/error/recovery rules already required this outcome; earlier
fixtures omitted this fault boundary. Keep the demonstrated regression and cite
the owning rule instead of duplicating global instructions. No vulnerability,
production outage or external deployment success is asserted.
The [actual loopback health integration](../../../test/integration/deployment-backend-health.integration.spec.ts)
also verifies HEAD, healthy/unhealthy status and absence of provider credentials/cookies.
