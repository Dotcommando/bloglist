# ADR 0078: Compare page drafts with the active public snapshot

Date: 2026-11-10

Status: Accepted for 0.12.1

## Context

A retained page version can exist without an activated release, and a full-site
rebuild does not promote page drafts. Neither page status nor save/publication
timestamps establish whether the editable page matches what visitors receive.
Published TVs can also include shared defaults absent from the original choices.

## Decision

The page capability exposes GetPageEditorialStates through an inbound contract.
It authorizes the site, selects one activation and compares page-owned fields
with complete page snapshots from that release. Lifecycle metadata is excluded.
The same pure domain comparison policy supports unsaved form values. HTTP and
administration adapters present the result; they do not infer public state from
database timestamps or retained-version order. If activation changes between
routing and editorial selection, the combined editor read fails with StaleWrite
rather than returning a mixture of two public versions.

New retained publications preserve authoredTvValues alongside effective frozen
tvValues. This optional domain provenance records the original page-owned choices
without changing rendering, restoration or the editable default selection.
Migration 0011 extends the retained-page validator. Existing snapshots without
this optional provenance continue to compare their frozen TV values.

The administration can inspect the active snapshot using copyable read-only
controls while preserving the exact editing buffer. Viewing has no save,
restoration or publication side effect. A changed activation refreshes that view.

Published-page catalogs preserve prepared TVs across full and incremental
publication. Missing legacy projections are prepared from the active catalog's
raw published values, never from editable drafts or another retained page version.

## Boundaries and consequences

Existing publication, authorization and atomic activation operations remain the
authority. A failed activation cannot clear a draft indicator. File adapters
support selecting verified publication artifacts, allowing comparison to read
only the relevant private page snapshots rather than hashing every public asset.
Selection does not weaken complete verification during publication reuse.

The full rebuild action moves to Settings / Main and explicitly describes that
it rebuilds published versions into an independent publication. It is the same
backend operation, with no additional publication workflow.

See [the accepted interface behavior](../arch/0.12.1-page-draft-visibility.md).
