# ADR 0022: Chunk references by display name

Date: 2026-10-26

Status: Accepted by the owner in the chunk usage follow-up.

## Decision

Extend the MODX-shaped chunk reference syntax without changing entity identity,
automatic key allocation or persistence. In addition to `[[$1]]`, support the
chunk's display name: `DateChunck` resolves as `[[$DateChunck]]`; `Date Chunk`
resolves as `[[$Date_Chunk]]`. Each Unicode whitespace character becomes one
underscore; case and all other supported characters remain unchanged. Repeated
spaces remain repeated underscores. Names and references are case-sensitive.

Name aliases support Unicode letters, combining marks, numbers, underscores,
dots and hyphens, up to 200 characters. A display name containing tag delimiters
or other unsupported characters remains valid but is referenced by key. No
characters are silently removed, transliterated or treated as executable code.
Dots in a chunk alias are literal, unlike property paths in value placeholders.
Names are not paths, and reference resolution does not access the filesystem.

The publication domain owns normalization and resolution. Exact registered chunk
keys take precedence, preserving existing references even when another chunk's
name matches that key. Otherwise, resolve one normalized display name. Missing
or ambiguous names are explicit validation errors. Duplicate display names remain
allowed by ADR 0021; callers can use unique keys when names collide. An unused
duplicate name does not prevent publication.

Apply this rule to direct and request-phase includes, nested chunks, Each/If
targets, dependency collection, asset selection, cycle checks and usage discovery.
Existing typed parameter contracts, escaping and local scope isolation remain.
Templates still select their page binding by key; loaders and parameters retain
their existing naming syntax.

Resolve against the captured site's source catalog, and against frozen template
metadata during Request-plan execution. Persist and decode optional source names
in immutable private plans, with backward compatibility for older unnamed plans.
Incoming public requests never look up current draft names. Renaming a draft does
not mutate an activated release. A future publication must update named callers;
the engine does not rewrite caller content or retain old-name aliases. Key-based
references survive renaming. A failed name resolution leaves the previous release
active under the existing publication contract.

## Administration

The live hint shows the current normalized name reference and the immutable key
reference after the chunk is saved. It follows unsaved name changes, explains
collisions/unsupported characters and identifies the key as the stable alternative.
When a collision is known from the loaded catalog, the hint offers the key instead
of a name tag that could resolve to another chunk.
The parameter example declares `title` as String in Parameters, reads it inside
the chunk with `<span>[[+title]]</span>`, and forwards the page title from a template:

```html
[[$Date_Chunk? &title=`[[*title]]`]]
```

The same parameter syntax works with ``[[$1? &title=`[[*title]]`]]``. No schema
migration, alias collection or new administration endpoint is required.
