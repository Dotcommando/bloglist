# ADR 0061: JSON-LD entity keys and conditional nodes

Date: 2026-11-06

Status: Accepted through the owner's request to add these settings in the CMS.

## Decision

Extend a profile node with optional keySource and presenceSource. Both reuse
typed Constant, PageField, TemplateVariable and Snippet sources, including
validated property paths. They cannot reference objects, URLs or another node,
execute code or load data. The administration exposes both settings.

Absent settings preserve existing page-and-role identities and unconditional
nodes. keySource must resolve to 1–128 ASCII letters, digits, hyphens or
underscores. It identifies an entity independently of its current page:
the central generator uses entity + role + key beneath the configured origin.
Do not use titles, dates or a changing nearest-item label as entity identity.
Malformed or missing keys on present nodes fail with role/keySource diagnostics.

presenceSource must resolve to a boolean: true includes the node; false, null
or missing omits it before resolving identity and required properties. Other
values fail rather than applying JavaScript truthiness. Optional references to
omitted nodes disappear; required references fail. Current-page references use
resolved identities and reject ambiguous roles. Cross-page references cannot
evaluate another page's dynamic identity or condition: required references to
such nodes fail, optional references disappear. No draft or guessed identifier
is substituted.

Static/Build data remains captured. Request HTML and graphs share prepared
Snippet values once per document; private plans capture definitions and code.
Deferred validation uses placeholders only for unresolved Request values and
still checks known values and graph references. No public request recompiles
definitions or consults editor drafts. Existing published plans remain immutable.

Migration 0006 extends the catalog validator without modifying earlier
checksums. Definitions continue through the normal versioned save, backup,
restore, publication and inspection contracts.

Site snippets select business data using installed add-on APIs; chunks own
markup and profiles own semantic mappings. The CMS includes no Events-specific
logic, content or registrations.
