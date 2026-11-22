# ADR 0031: Apply redirects when saved in administration

Date: 2026-10-28

Status: Accepted through the owner's reported failure to apply a saved redirect
on 2026-10-28.

Saving redirect settings in administration must update the public route when an
active release exists. This supersedes the separate Apply URL changes step for
redirect saves in ADR 0028 and the original administration flow in ADR 0029.
Keep the existing local RedirectUrl command as a working-state mutation.

RedirectPublishedUrl authorizes publication before saving the redirect, invokes
RedirectUrl once, then PublishRoutingRelease. Reuse the existing immutable
routing-only release process, frozen published content, compare-and-swap and
activation receipts. Do not publish drafts or rebuild assets/Build Snippets.
Existing target ownership, cycles, version guards and history remain enforced.

The authenticated redirect POST returns the acknowledged URL, publication and
publicationFailed, following the address-move response. A successful activation
returns 200 and the UI confirms public application. If the redirect saved but
publication failed, return 202 and show pending activation with Apply URL changes
as recovery. Recovery publishes routing without resaving the redirect or adding
history. A stale mutation fails before publication and is never replayed.

If no active release exists, return publication=null and publicationFailed=false.
Keep the saved working redirect and explain that content publication is needed
before routing becomes public. Saving does not create an initial content release.

Verify immediate public GET/HEAD redirect responses after the save, retained
published HTML despite edited drafts, stale-version rejection, and activation
failure/recovery without duplicate routing history through real composition.
