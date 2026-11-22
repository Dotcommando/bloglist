# ADR 0046: Name publication directories after the primary domain

Date: 2026-10-31

Status: Accepted through the owner's request for readable site folders.

Publication artifacts live in `artifacts/sites/<primaryDomain>/<releaseId>/`.
Use the trusted registered, normalized hostname (ASCII IDNA form), never the
incoming Host header. Site and release identities and source registry keys remain
unchanged. This supersedes the siteKey-based physical publication layout.

Reuse the domain-directory ownership marker, private index and per-site writer
lock already used by media. Publication buckets contain releases only. Site
updates synchronize both configured storage roots; failure is reported and the
same synchronization can be repeated. Immutable release contents and activation
are unchanged. Unknown owners, escaping paths and symbolic links fail explicitly.

Old source-key/siteId release paths remain readable. The offline command
`npm run migrate:publications` checks that the configured HTTP listener is stopped,
verifies complete manifests and artifact checksums, and moves individual releases
to the current registered domain. It neither updates database records nor
publishes pages. It refuses occupied nonempty destinations; an empty legacy
restore placeholder may be removed. Each successful move is independently
durable and the conversion can be repeated after failure. Do not run other local
publication writers or a second application during conversion.

Dumps capture actual domain or legacy paths. Restore accepts exactly one owned
path per retained Ready release in either layout, validates its bytes and retains
the existing scoped database/file journal recovery. It restores ownership markers
and invalidates the private domain index after commit. Empty displaced release
directories do not shadow restored legacy content. Existing archives remain
usable without a database/schema migration.
