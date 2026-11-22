# ADR 0090: Listen on database-configured local site origins

Date: 2026-11-17

Status: Accepted through the owner's request for reachable local site addresses.

## Decision

On HTTP startup, read the sites through the database repository. Failure to read
the database cancels startup; there is no substitute list in environment settings
or files. For active sites explicitly selecting Local mode, bind their HTTP
loopback origins (`localhost`, IPv4 127/8, or IPv6 `::1`). Map `localhost` to
127.0.0.1. Reuse a covering primary socket and deduplicate shared local sockets.

The coordinator owns these listeners and passes requests to the existing gateway
with their original Host authority. No additional process is created. Extra site
ports reject foreign authorities and administrative/health paths; administration
continues at its configured origin. Existing site authorization, publication,
public API and worker-pool routing remain the delivery boundary.

Readiness requires every required local listener to bind successfully. A bind
failure cancels startup and closes earlier listeners and supervisor resources.
Shutdown stops admissions, drains admitted work and closes remaining connections,
including incomplete requests. Report the local origin responsible for a bind
failure without exposing private error details.

List site origins alongside the administration links. Mark bound local origins
as ready and other origins as requiring external routing. Listening does not
publish a home page: an unpublished path still returns 404.

## Limits and superseded scope

This supersedes ADR 0035's no-listener statement only for startup binding of
selected loopback HTTP origins. Public mode, HTTPS, remote addresses, DNS and TLS
still require external routing. Origin selection changes trusted resolution
immediately; adding a site or changing its local port requires an HTTP restart
to open the new socket. Immutable sitemap changes still require publication.
Local origins must be reachable inside the same network namespace as the CMS;
container host exposure remains explicit Docker configuration.
