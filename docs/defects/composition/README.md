# Composition defect index

Read rows matching the changed mechanism, then open only those records.

| Record | Guarantee and matching triggers | Regression |
| --- | --- | --- |
| [composition/public-only-calibration](public-only-calibration.md) | Public-only composition must not require an absent admin session provider; tags: optional-provider-graph, public-http, admin-auth, calibration, startup | [Composition regression](../../../test/infra/public-calibration-composition.spec.ts) |
