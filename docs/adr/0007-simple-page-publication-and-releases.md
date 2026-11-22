# ADR 0007: Direct page publication and site releases

Date: 2026-10-24

Status: Accepted owner corrections to the third-five proposal.

Physical directory naming is superseded by [ADR 0046](0046-primary-domain-publication-directories.md).

## Decision

Build for maintaining small and medium content sites. PublishPage publishes the
current draft directly. There is no reviewer, approval state, sourceRevision
input, persisted source-revision registry or command to approve a snapshot.

Keep one editable Page record and the three most recently published versions per
page. Publishing updates the editable page and prepends its published content to
a bounded versions array in one transaction. Remove the oldest version in that
same transaction when the array would exceed three. Editing a published page
creates the next draft in that same editable record; it does not modify retained
published versions. Preserve the original first-publication instant.

ConfigurePageRendering validates the registered template, chunk arguments and
loader declarations before saving. PublishPage validates rendering configuration
and copies the draft to published content without executing loaders or building
the whole site. These are ordinary editor actions, not an approval workflow.

PreviewPage renders current editable content, compiles real CSS/JS and returns a
browser URL. The local preview listener binds 127.0.0.1, uses an unguessable URL
per preview, serves only that preview's public build outputs, sends no-store and
noindex headers, and closes with the Nest application context. Its files never
become part of an active site release. A new preview replaces the previous local
preview of the same page. Request-mode preview accepts typed sample requestValues.

PublishSiteRelease reads current published page versions, routing and trusted
file sources into invocation-local input. This input is not a separately managed
revision. Build loaders run for that build; their values are frozen in static
HTML or private Request plans. A build does not reread editable drafts as a
fallback. Registered custom loaders remain optional and read-only.

Redirect existence, ownership and cycle policies are enforced on routing writes.
Publication preserves saved destinations. A redirect may point to the address of
a page that has not yet been published; that does not introduce an editorial
publication gate. Manifest/file consistency checks still detect corrupt saved
data and invalid build output. Existing working routes are never rewritten by a
build.

Add no archival restrictions to these five operations. In particular an archived
site can be configured, previewed and published under the same local editor
access. Previously implemented ResolveSite domain-selection semantics are
unchanged; this does not create another archival workflow.

Store page versions and release metadata in MongoDB. Store publication artifacts
in a configured filesystem root at sites/<siteKey>/<releaseId>/. Only public/ is
a public web root; manifest.json, diagnostic maps and Request plans are private.
This filesystem adapter does not replace the accepted S3 media-library adapter.

Write and verify a complete immutable release before switching one MongoDB active
pointer. Compare expectedActiveReleaseId at activation. Commit an activation
receipt together with the pointer so a lost acknowledgement can be reconciled
without replaying the switch. Retain previous releases; deleting old page versions
does not delete their independently built release artifacts.

ResolvePublishedPath reads the active pointer once and resolves that release's
exact path to a stored document, redirect, Request plan or NotFound. It does not
read drafts, compile resources or execute Request loaders. Public HTTP document
delivery and request rendering are subsequent work; administrative calls remain
inside the trusted local AppModule boundary.

## Consequences

The owner can edit, preview and publish without revision-management or approval
steps. PublishPage changes stored published content; PublishSiteRelease makes a
complete site build active. A future UI can compose those actions behind its
publish action without moving authoritative business logic into the browser.

Filesystem staging and MongoDB are not a distributed transaction. A failed or
uncertain metadata write can leave inactive files; do not delete possibly active
output or silently retry the business command. No automatic release garbage
collection or rollback command is introduced. A caller keeps the local context
open while using a preview and closes it when finished.
