# Dropped system document role in add-on page summaries

ID `admin/addon-page-system-role-dropped`. Fixed in CMS 0.16.1.

The add-on browser host copied each page ID and title but lost its existing
system document role. Consumers could not distinguish system documents from
regular pages. Retain the role alongside the two existing fields.

The [browser regression](../../../test/integration/addon-card-ui.integration.spec.ts)
checks all three roles and a regular page in the mounted runtime. See
[verification](../../changes/0.16.1/addon-system-document-metadata/50-verification.md)
for the failed and passing runs.
