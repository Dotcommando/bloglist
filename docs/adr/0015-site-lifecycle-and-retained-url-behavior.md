# ADR 0015: Site editing, archival and retained URL behavior

Date: 2026-10-25

Status: Accepted by the owner for the remaining five operations.

Implement UpdateSite, ArchiveSite, ArchivePage, RebindUrlToPage and RedirectUrl
through the existing trusted local AppModule contracts. Remaining administrative
REST adapters are separate work, as described when selecting this batch.

The owner explicitly forbids removing a site language while any page uses it,
including drafts and archived pages. Do not translate, migrate or delete pages.
Update order is add languages, replace default, remove languages. Domain changes
replace the registered hostname without creating aliases or redirects.

Serialize page creation and site-language edits using a site-owned transactional
content guard. Page insertion rechecks the enabled language under this guard;
site edits check page usage through an explicit page-owned query port bound to
the same transaction. Technical transaction factories stay in composition and
adapters. Neither capability accesses the other's collections directly.

ArchiveSite and ArchivePage change editorial state only and preserve content,
URLs, history, retained publications, files and requests. Existing ResolveSite
excludes archived sites. ArchivePage does not retire a public route or change
the active release. Full removal/unpublication is a separate future workflow.

URL rebinding and redirection retain identity/path/parent/publication time,
record the previous behavior and compare the caller's expected URL version.
Use explicit history IDs, versions and UTC time from a values port. Extend the
existing routing adapter with the complete behavior-store port, reusing its
site-wide write guard and relationship validation. Revalidate redirect chains
inside the transaction so concurrent commands cannot create cycles. Preserve
single-current-PAGE uniqueness; occupied replacement pages are conflicts.

An optional persistence-only URL version supports existing documents without a
data rewrite: legacy snapshots use a deterministic version until first mutation.
Every routing mutation assigns a fresh version. Return the prepared URL after
acknowledgement; never replay an uncertain write automatically.
