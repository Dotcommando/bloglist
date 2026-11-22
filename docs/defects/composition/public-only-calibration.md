# Public-only composition required an administration provider

- ID: `composition/public-only-calibration`.
- Kind: confirmed composition bug; no authentication bypass is asserted.
- Status: fixed according to historical evidence; not re-executed in this
  documentation change.
- Affected/fixed release: corrected in CMS 0.15.0; earliest affected version and
  exact fixing revision are not established by the source audit.
- Record date: 2026-11-18.
- Read for: optional provider graphs, public-only HTTP composition, adminAuth,
  calibration dependencies and startup/token resolution.

## Symptom, cause and prevention

The long-request drain fixture exposed public-only HTTP composition requiring an
administrator session service through calibration providers, although that
administrative boundary was absent. PublicHttpModule now registers the
administration-only provider graph only when adminAuth is present.

Optional capabilities must not make an unrelated supported composition resolve
providers from a missing authority boundary. Do not repair this by injecting a
fake administrator/session fallback or disabling meaningful resolution checks.

This is startup/composition failure, not an interactive business rejection. It
must remain an explicit failure to the invoking operator; there is no authenticated
admin UI in the public-only composition. The historical correction restores the
supported configuration rather than inventing a user retry action.

## Regression and evidence

[The composition regression](../../../test/infra/public-calibration-composition.spec.ts)
failed before the correction and passed alongside local-operator resource
composition according to the [shutdown audit](../../audits/0.15.0-worker-shutdown.md).
The exact test-title filter must be confirmed before execution. This record
summarizes existing evidence and does not claim a new test/build run.

Current prevention requirements: [backend boundaries](../../cms-development/feature-design.md#backend-structure-and-dependencies)
and [composition/testing proof](../../cms-development/testing-policy.md#select-the-level-that-proves-the-guarantee).
The historical audit has no linked remediation dossier; no missing history is
reconstructed here.
