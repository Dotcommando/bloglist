# ADR 0021: Automatic element keys and editable names

Date: 2026-10-26

Status: Accepted by the owner in the source editor follow-up.

Name-based chunk references are added by [ADR 0022](0022-chunk-name-references.md),
superseding the statement below that display names do not resolve references.

[ADR 0040](0040-readable-element-backup-names.md) supersedes key-based chunk and
Snippet backup filenames with readable display names.

## Decision

Supersede ADR 0020's caller-chosen keys for new templates and chunks. Creation
accepts site, kind, name and source content; the backend assigns a positive
decimal ordinal key without another request or user confirmation. The browser
does not generate, request or edit a key. Each site and kind has its own sequence,
starting at 1. Keys stay strings in domain state, JSON, paths, references and files.
Opaque elementId remains a separate entity identity.

The rendering capability owns `IElementKeys.reserve`: reserve a unique ordinal
greater than both the persisted sequence and existing numeric catalog keys. The
application authorizes the site and validates content before reserving. The
Mongoose adapter uses one atomic update of `rendering_element_sequences`, scoped
by site/kind with a compound unique index. Ordinals use bigint in application
logic and exact BSON signed 64-bit integers in storage, never JavaScript number.
The range is 1..9223372036854775807. Exhaustion is an explicit conflict. Failed
creation can consume a number; gapless numbering and request-arrival ordering are
not promised. Storage failures do not choose file storage or trigger replay.

The merged catalog supplies the numeric floor so recovered file-only entities
are not overwritten when the sequence is absent. Existing alphabetic registry
keys remain valid and unchanged, including developer sources and ZaryaBasic.
New creation rejects an explicitly supplied key. Numeric chunk references such
as `[[$1]]` and numeric template selection work through publication and preview.
Parameter names, loader names and property paths keep their existing syntax.

Every element also has a required editable name (nonblank, one line, at most 200
characters). Names need not be unique and do not resolve references or determine
paths. Renaming participates in the same version/backup guard as source editing
and cannot rename an incomplete backup. File snapshots include the name.

Migration 0014 adds names and ordinal sequences without modifying migration 0013.
It fills missing database names from existing keys, preserving IDs, keys,
versions, timestamps, source content, page references and activated releases.
Old file snapshots and developer sources without names use their key as the
initial display name; the next save writes the full named snapshot. Migration
backfill is explicit, checksum-verified and rerunnable before its receipt.

## Administration behavior

The source form edits the name and has no key field. The left drawer, editor
heading, usages and page template selector show names. Search matches names and
keys. Numeric keys remain in deep links and source references; renaming does not
change them. Save draft and Save & apply retain their distinct publication
semantics from ADR 0020.

Page, template and chunk rows always have the former hover background. Hover can
slightly emphasize it; selection adds a contrasting border without moving the
row. Existing keyboard focus and accessible selection state remain.
