# qa/admin-release-fixture-drift

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-18.
Affected: baseline 8a5e693 (0.15.3); earlier range unknown. Fix target: 0.16.0.
Tags: browser-fixtures, accessible-names, localization, hidden-panels, current-contracts.

The first administration release selection failed existing UI scenarios because
fixtures/locators retained previous contracts: broad `.element-help` matched hidden
JSON-LD help; file headings acquired an accessible Rename action; renamed files
report through a snackbar and reference changes require an explicit choice;
mobile draft save moved to More. Required onboarding language was unfilled and
background administration reads were absent from synthetic HTTP handlers, producing
unhandled rejections. Source tests also expected obsolete unknown-query rejection
and deferred Snippet publication.

Correction: use current accessible roles/names in both languages, exercise actual
menus and confirmations, fill required inputs, provide explicit unavailable
responses for unrelated background settings reads, and assert current declared
query/automatic Snippet publication behavior. An unrelated hook pump is disabled
only during the bulk rendering fixture, preventing legitimate write conflicts
with its synthetic setup; actual page/storage/rendering implementations remain.

Regressions: [release selection](../../../vitest.config.admin-release.ts), especially
the source editor, Files, MIME, page tree and Snippet suites. Initial bounded run:
15 failed, 91 passed, 5 skipped, 11 unhandled rejections. Final unfiltered selection:
113 passed in 14 files, no skips or unhandled errors. Do not turn a fixture
failure into a product change or remove meaningful failed assertions.

Related, separately canonical mechanisms: [system-document setup assumptions](system-document-fixture-assumptions.md)
and [selection of unrelated media](media-tests-selected-unrelated-resources.md).
Their records are reused, not counted as new discoveries here.

Follow-up baseline 084c36b: adding the existing hierarchy-scroll suite to the
release gate exposed the same mechanism: two Files cases expected a bare file
heading, and omitted addon/TV background reads produced 30 unhandled rejections.
Use current Rename file names and explicit empty background catalogs. This is a
rediscovery of this QA defect, not another product bug. Final follow-up evidence
is recorded in the linked verification.

The expanded full gate also observed an intermittent 409 during the existing
URLs fixture's sequential page creation (139/140 passed); the standalone file
then passed 8/8. Page creation records a hook scope inside its transaction while
the background dispatcher updates that same scope. This is consistent with the
already observed unrelated hook-pump contention in the Snippets fixture, rather
than evidence of a new routing defect. Set this bulk URLs fixture's supported
`backgroundWork: false`, retaining real routing/publication/storage and all
explicit conflict assertions. Keep the fresh-site and four additional real
journeys with normal background work. Response-body diagnostics on identity
creation make any future conflict visible. No automatic test/mutation retry.
Final expanded gate: 140/140 passed in 19 files, zero skips/unhandled errors.

Second continuation at f5f09c7: observing pageerror on every child page exposed
the journey's own locale init script touching localStorage on an opaque about:blank
document. The expanded run failed 13 cases with SecurityError despite successful
editorial assertions. Scope that script to the actual administration origin/path;
keep all-page error observation enabled. An old URL field assertion also used
Vitest's short default poll budget instead of its browser action budget; use the
existing six-second budget while waiting for the asynchronous parent URL lookup.
This is QA fixture drift, not a new product bug. The final expanded gate and
intermediate setup corrections are recorded in the same verification dossier.

[Testing policy](../../cms-development/testing-policy.md),
[evidence](../../changes/0.16.0/admin-site-journeys/50-verification.md).

A four-worker comparison of the 164-case gate also observed 409 during the old
publication fixture setup and 404 after address switching in the old Files
fixture. Disable unrelated background delivery in both test compositions from
startup, matching the existing isolated editorial fixtures. Remove redundant
manual hook-worker shutdown from the Files case; no such provider is registered
when background work is disabled. Publication and onboarding then passed in a
selected real-composition run. The final full gate is recorded in verification.

Follow-up at `f59800a` on 2026-11-20. The page-tree regression received an
empty current-session response and could not reach the tree after RBAC. Supply
the synthetic actor's administrator authorization in that response. The
[focused page positioning run](../../changes/0.16.0/rbac-abac/50-verification.md#interface-recommendation-1-page-positioning)
passed the original tree interactions and separate delegated-role checks.

The deterministic rendering editor suite also returned an empty session and
could not reach Save & apply. Supply its administrator authorization and keep
both existing keyboard-save and publication-lock assertions. The delegated
source writer is verified separately against real authentication and storage.

The Files layout fixture also needed an explicit administrator session. With
that response restored, the long-reference dialog checks passed in English
and Russian. The delegated file-move journey verifies its own permissions
through real sessions.

Follow-up at `51e186e`: use the shared current administrator fixture for the
hierarchy, document MIME and TV suites. Bind page title assertions to the
actual page input and use the virtual-folder link's address in the site
journey. Observe each folder command's completion and read published metadata
over HTTP to remove incidental browser navigation waits. See the
[release gate remediation](../../changes/0.16.0/release-gate-failures/50-verification.md).
