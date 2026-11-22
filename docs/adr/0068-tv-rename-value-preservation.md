# ADR 0068: Preserve TV values on rename in CMS 0.11.0

Date: 2026-11-07

Status: Accepted for CMS 0.11.0 through the owner's explicit request.
Implementation and regression verification are pending.

## Decision

Renaming a template variable must preserve its existing page values and media
associations. Changing its display caption must never clear or replace values.
A technical-name change must migrate the association to the new name instead of
being treated as deletion followed by creation of an unrelated empty field.
Preserve template assignments, type, defaults, ordering and other settings unless
the editor explicitly changes them. Preserve the distinction between absent
overrides, explicit null, empty text and selected media references.

The rename must be guarded against concurrent edits and name collisions. A failed
rename leaves the old definition and its values usable. Do not silently discard
values or resolve collisions by overwriting another TV. Define and verify the
atomic rename boundary before implementation, including page values and catalog
readers. Existing immutable publications remain intact; subsequent publication
and restoration of retained page versions must preserve the original association.

## Required verification for 0.11.0

- Regressions for both a caption change and a technical-name change, using Image,
  File, Text and Markdown TVs, overrides and defaults, null and absent values.
- Reload the page editor after the rename: selected media, text and assignments
  remain visible and saveable. Verify more than the database reference alone.
- Preview and publish the affected page and a dependent Build-generated catalog;
  both continue to display the selected image and text. Verify image responses
  and browser decoding, rather than only document HTTP 200 or card counts.
- Restore a retained page version without losing renamed TV values. Preserve
  site isolation and previously activated immutable releases.
- Cover stale versions, duplicate target names and partial-failure recovery.

This release requirement records the owner's reported data-loss symptom. It is
not a claim that the root cause has been reproduced or the core fix implemented.
