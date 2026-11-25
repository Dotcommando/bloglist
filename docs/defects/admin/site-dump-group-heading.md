# Site dump cards have no group heading

Confirmed bug `admin/site-dump-group-heading` in candidate `e5b7694`, recorded
2026-11-25 and fixed for 0.17.0. The earlier affected range is unknown.

On the site's Dumps tab, a system administrator saw the labeled installation
group followed by two site cards with no group heading. Export and Import
could read as more operations on the whole installation. The Site archive
heading now names the section containing both forms. Its explanation of
partial dumps follows the heading.

The [browser regression](../../../test/integration/admin-users-http.integration.spec.ts)
opens Dumps under both roles and verifies the new section and its heading
hierarchy. See the [verification record](../../changes/0.17.0/site-dump-heading/50-verification.md)
and the [Dumps contract](../../arch/site-dumps.md#operations).
