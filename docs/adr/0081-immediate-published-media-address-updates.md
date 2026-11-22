# ADR 0081: Immediate published media address updates

Status: Accepted, 2026-11-11

## Context

Renaming a file while choosing Update addresses must keep the public site usable
immediately. Updating editable sources alone leaves frozen publications pointing
at missing files. Publishing current drafts would expose unrelated unfinished
changes. The owner requires immediate cache invalidation, without media aliases
or redirects, and safe cancellation of scheduled cache refreshes.

## Decision

MoveMediaFile owns the sequence: guarded catalog move, editable reference updates,
then an address-only publication. Reference updates include recorded historical
paths unless another file currently owns them. A repeated move to the same name
can repair references after an interrupted attempt. Each output keeps its profile
suffix under the new filename stem. Similar images with different file identities
are independent.

PublishMediaAddressRelease captures the active ready release and creates a new
immutable release from its artifacts. Its outbound builder replaces exact owned
media URL literals in compiled text, frozen Request plans, saved Build values and
published page summaries. It rebases copied compiled assets into the new release
namespace and recalculates artifact checksums and inline style hashes. It never
reads editable source, compiles code, executes Build loaders, or publishes a draft.
Routes and unrelated published content remain unchanged. Text artifacts are read
within the existing 64 MiB document bound; binaries remain streamed.

Activation compares the captured active release ID. Lost acknowledgements are
reconciled through the normal activation receipt. After confirmed activation,
the application purges the site's Request document cache before returning success.
Release-scoped plan/catalog caches select the new immutable release identity.
There are no media redirects; obsolete media URLs return 404.

Invalidation clears scheduled timers and aborts running background refreshes.
Generation checks and active-release checks reject late old results. A queued
obsolete callback cannot remove a newly scheduled timer for the same key. Every
producer Promise is observed even if cancellation precedes waiter attachment;
admission failures also become observed rejections. Completion, failure and module
shutdown release refresh bookkeeping and event listeners.

## Failure and concurrency

Catalog, editable-source saves and publication are separate guarded commits. A
later failure rejects the operation and can leave earlier steps committed; no
success is acknowledged. Historical paths support retry. Concurrent publication
activation rejects instead of replacing a newer release. Unaffected publications
do not create a release. Retained historical releases/page versions remain
immutable; site-wide configuration and dynamically assembled URLs are outside
literal replacement. Keep old addresses deliberately leaves links broken.

## Consequences

This supersedes ADR 0079's requirement to publish separately after choosing
Update addresses. Other draft changes still require normal explicit publication.
Focused tests cover historical paths, ownership, guarded page fields, frozen
static/Request output, retained Build values, HTTP composition, immediate cache
invalidation, obsolete callbacks, late rejection and cancellation before admission.
