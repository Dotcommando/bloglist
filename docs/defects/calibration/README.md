# Calibration defect index

Read matching records only, following the [lookup route](../README.md).

| Record | Guarantee and triggers | Regression |
| --- | --- | --- |
| [calibration/partial-resource-journal](partial-resource-journal.md) | Exclusive complete recovery journal before resource changes; tags: beginCalibration, ENOSPC, atomic-publication, retry | [Lease regression](../../../test/adapters/calibration-resource-lease.spec.ts) |
| [calibration/incomplete-step-evidence](incomplete-step-evidence.md) | A positive page/API scenario needs all owned measured steps before recommendation; tags: calibration, stepMetrics, missing/foreign observations, false winner | [Search regression](../../../test/app/calibration-run.spec.ts) |
