# Persistence adapters

Collections have explicit plural snake_case names; fields use camelCase. Map
MongoDB `_id`/BSON values to stable opaque entity IDs at the boundary. Every
site-owned document/query/uniqueness constraint has trusted `siteId`; validate
reference ownership. Document any explicitly global scope.

Use explicit Mongoose schemas. Domain invariants do not depend on schema
validation. Construct allowed filters/updates explicitly. Do not use ref/populate
as integrity enforcement or cascade deletion implicitly.
Choose embedding by aggregate ownership, bounded growth and atomicity.

Money uses integer minor units and business bigint, explicit currency and a
lossless documented BSON/transport representation. Never pass money/64-bit IDs
through number. Rates use exact arithmetic and deterministic rounding. Timestamps
are BSON dates with explicit lifecycle/version/audit/retention rules.

Prefer atomic aggregate writes. Cross-document invariants use a transaction port
with sessions confined here.
Enforce uniqueness with indexes, not pre-insert checks. Add required business
indexes first; justify extra indexes with query diagnostics. Large lists use
stable keyset pagination with a unique tie-breaker; preserve accepted API pagination
contracts and document consistency for financial reads.

Index/schema rollout follows [migration instructions](../../../../migrations/AGENTS.md);
read them before changing or packaging migrations.
