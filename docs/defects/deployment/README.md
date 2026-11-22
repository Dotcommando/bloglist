# Deployment defect index

Read matching mechanisms only, following the [lookup route](../README.md).

| Record | Guarantee and triggers | Regression |
| --- | --- | --- |
| [deployment/backend-probe-used-admin-route](backend-probe-used-admin-route.md) | Cloudflare-check, backend-health, custom-admin-address, false-delivery-rejection | [Owning regression](../../../test/adapters/cloudflare-delivery.spec.ts) |
| [deployment/resolved-marker-failure-stranded-lock](resolved-marker-failure-stranded-lock.md) | delivery-restore-guard, resolved-marker, cleanup, EACCES, automatic-reconciliation | [Owning regression](../../../test/adapters/delivery-restore-guard.spec.ts) |
