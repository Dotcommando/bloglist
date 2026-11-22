# Verification

Checked baseline `d0cba85` plus this focused patch. Source behavior checks complete;
the local installation rebuild consumes the resulting committed source artifact.
First RED executed on unchanged component: both widths left details visible after
Escape and timed out at the hidden-state assertion. Browser build/setup succeeded.
The mobile case now attempts outside click first to independently reproduce both
reported paths before the production correction.
Second RED confirmed both independently: 1440px Escape and 320px outside click
both left the actual component visible and failed hidden-state assertions.

GREEN: `npm run test:integration -- test/integration/cms-build-info.integration.spec.ts`
passed both 1440/320px scenarios in CMS and again from the copied site checkout.
`deployment-ui.integration.spec.ts` passed both explicit-origin variants after
fixture maintenance. Four distinct core browser scenarios passed; repeated runs
are not added to that count. The latter also checks 17 widths, both languages,
metadata provenance, viewport containment/hit testing and deployment recovery.
Screenshots at 320/1440px were inspected. These use real Vite/Svelte/Bits UI and an
explicit Chromium-family browser; HTTP is synthetic, no backend/database is claimed.
An additional hit-test checks every metadata label/value after floating layout
settles, rather than only the popup's bottom edge. Both responsive variants passed
with this stronger assertion; settled screenshots show the complete commit/hash.
This verification-only refinement does not change the installed runtime source.

The newly written regression initially sampled the first-site redirect while
asserting navigation preservation. It now starts at explicit `/admin/sites/new`;
the expected URL is the settled starting route. This is test development, not a
newly discovered production bug. Popover hit testing polls observable positioning
instead of asserting the first floating-layout paint.

`npm run format`, `npm run lint`, `npm run typecheck`, `npm run build` passed after
the component change. An intermediate lint overlapped fixture edits and reported
indentation; edits were then serialized, formatted and lint/typechecked/built
successfully. The final new-test URL-only adjustment passed targeted ESLint and
browser checks. No full suite, Safari or production browser session was run.
No dependency, backend, schema, migration, session or site-content change.

Defect inventory: two newly confirmed bugs, zero confirmed vulnerabilities;
two new cards, both fixed:

1. [admin/build-info-not-dismissed](../../../defects/admin/build-info-not-dismissed.md):
   product bug; independent executed Escape/outside RED, browser GREEN.
2. [qa/deployment-ui-fixture-drift](../../../defects/qa/deployment-ui-fixture-drift.md):
   QA bug; missing current read routes/unhandled fixture callbacks and obsolete
   heading/tab assertions; corrected explicit responses and meaningful UI checks.

All temporary browser contexts/build fixtures close or remove their owned roots.
The local HTTP listener was identified by its exact built administration entry
and stopped for the installation update; its database was not stopped.
