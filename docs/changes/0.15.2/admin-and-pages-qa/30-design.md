# Review boundaries

Trace each operation through inbound authorization/context, domain policy,
outbound ports, actual adapters and composition. Keep business and framework
boundaries current; do not add compatibility/fallback authority paths.

Select deterministic application/adapter unit scenarios for decisions and failure
cleanup, plus real HTTP/MongoDB integration for actual scope, transaction/index,
session invalidation and concurrent-write guarantees. Use only isolated synthetic
dependencies, preserve all observed Promises and close temporary servers/resources.

For each test deletion, record why its asserted guarantee is absent, redundant or
obsolete and where any valid guarantee is retained. A failing test is not useless
just because it exposes production behavior that needs fixing.
