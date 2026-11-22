# Design

Reuse the installed manifest routes and the existing authenticated site list
and add-on request path. No new permission, unauthenticated operation, storage
schema or SDK dependency is needed. The route is constructed from the trusted
site and registered add-on key. Keep count queries bounded and discard stale
responses at the UI boundary. Preserve the existing 0.16 site permission gates.
