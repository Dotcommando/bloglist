# Rendering adapter

Read the relevant maintained contracts: `docs/arch/rendering-and-publication.md`,
`rendering-element-editing.md`, `snippets.md`, `template-variables.md` and
`public-site-frontend.md`. The CMS authoring skill describes site composition;
these instructions govern engine changes.

Template/chunk markup is a constrained typed composition language, not executable
server configuration. Resolve the complete include/binding graph before asset
extraction; validate references, cycles, input/result contracts, phases and lexical
scope. Forward child inputs explicitly; whole-value tags preserve object/array
types. Escape once at final output; apply the output controls in
[security verification](../../../../docs/cms-development/security-verification.md#assess-the-changed-trust-boundaries).

Read editable entities first; fall back to complete backups/file sources only
when absent, never on a database error. Preserve guarded atomic private backups
and explicit incomplete states. Snippets return typed view models; browser TS
stays browser-only. No DB, environment, DI or arbitrary HTTP access from markup.
Do not introduce a MODX/PHP runtime or an independent template interpreter.

Use saved immutable Request plans, frozen Build values and prebuilt assets.
`ParallelRead` is an explicit effect-free query-only contract, never inferred from
source. Preserve dependencies, barriers, deduplication, deterministic output order,
required-failure cancellation and bounded per-render/process admission. Thread-pool
capacity is separate; see `parallel-snippet-execution.md` and `snippet-worker-pool.md`.

Preserve structural CSS in head and visual CSS before body close, common external
hashed files before page-inline overrides. The frontend contract owns exact
classification, cascade, asset and responsive rules. No runtime compilation occurs
on page requests.
