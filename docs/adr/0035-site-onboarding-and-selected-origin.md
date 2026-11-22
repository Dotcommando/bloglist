# ADR 0035: Future domain, development address and selected site origin

Date: 2026-10-28

Status: Accepted through the owner's site-onboarding request.

The no-listener scope below is superseded for startup-bound loopback HTTP origins
by [ADR 0090](0090-local-site-http-listeners.md).

## Decision

New-site onboarding asks for the future domain, the complete local development
address with an explicit port, and an explicit choice of the currently available
address. The future domain is a normalized hostname, without a scheme, port or
path; localhost and IP addresses are development addresses rather than future
domains. The production origin initially uses HTTPS. The development address
accepts HTTP(S), with or without the scheme, and requires a port from 1 to 65535.
Paths, credentials, queries and fragments are rejected.

The development address field initially contains `http://localhost:3000/`.
On Create Site submission, the backend also checks this address against serving
authorities already assigned to other sites in this CMS, even when the new site
chooses its public origin. An occupied development address returns Conflict with
the administrative field diagnostic `onboarding.localAddress`; the form preserves
its values and shows a localized error by that field. Changing the field clears
the error; the next submission checks again. This does not probe operating-system
ports or other CMS installations. An unselected address is still not reserved.

The domain remains Site.primaryDomain and names the asset directory. Creation
saves the site, then synchronizes its directory through ISiteAssetDirectory in
both authenticated HTTP and local composition when media storage is configured.
As with domain relocation in ADR 0027, persistence and filesystem writes are not
a distributed transaction. A directory failure is returned, not acknowledged as
success or automatically retried. The saved site remains visible; a subsequent
storage operation or UpdateSite finishes synchronization. Without the optional
media capability, creation stores site metadata without claiming a media folder.

Site.addresses.originMode is Public or Local. Both origins are required once this
choice exists. The chosen origin controls trusted Host authority resolution
(hostname plus nondefault port), public document/media/API site resolution,
administrative public links and newly generated sitemap origins. The unselected
address is configuration, not a second serving alias. Ownership checks reject an
already selected authority; a database unique index handles concurrent claims.
The scheme determines generated links; Host resolution does not trust forwarded
headers or infer proxy configuration. This does not configure DNS, TLS, listeners
or start a local server. The chosen address must reach the configured backend.

Settings can change the selected origin with the existing captured-address
concurrency check, including originMode. Resolution changes immediately after
saving. Immutable sitemap artifacts change only on subsequent publication; saving
settings does not publish drafts. Changing the choice does not rename the domain
directory. This supersedes ADR 0028's link-only interpretation for sites with an
explicit origin choice and permits the chosen local origin in their sitemap.

## Persistence and existing sites

Migration 0024 permits the optional mode and private servingAuthority projection
and creates the partial unique sites_serving_authority_unique index. Adapters
derive this projection from the selected canonical origin on site writes; it does
not enter domain state or API responses. Migration verification checks the
validator and index. Existing records and directories are not rewritten.

Sites without a mode retain their previous primary-host resolution and public
sitemap origin. Existing local sites therefore continue to work. An active
legacy localhost site reserves that hostname; onboarding cannot assign its
address to a different site until the legacy site's ownership is resolved.
New administration forms always submit the onboarding choice; existing local
CreateSite callers can still omit onboarding. Once configured, removing the mode
is rejected rather than silently reverting to legacy routing.

ZIP export/import and deployment-environment selection during restore are future
work and are not implemented here.
