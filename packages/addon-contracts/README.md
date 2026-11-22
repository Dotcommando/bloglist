# Zarya add-on contracts

The SDK supplies framework-independent extension contracts shared by CMS Zarya
and independently built add-ons. Read its current version/toolchain from this
package's package.json; SDK and CMS versions are independent.

- addons: definition/configuration metadata, site connection state, operation access
  classes, captured permits and the typed browser administration host.
- business-error, validation, cursor-page, snapshot-entity: portable errors/value
  checks, paged results and defensive business snapshots.
- cms: portable ICmsApi data contracts without core/domain/framework imports.
- cms-extensions: ICmsAddonApiHost, ICmsAddonExtension, Query/Command kinds and
  JSON method contracts. Runtime methods are code-owned; the host scopes site/actor
  and rechecks connection availability, including query-only restrictions.

The SDK contains no NestJS providers, Mongoose types, repositories, service
locators or permission grants. The host authorizes actors/sites and enforces
captured permits at write commit; add-ons own business rules and persistence.

See [build and pin the SDK](../../docs/addon-development/runtime-packages.md#bind-the-sdk)
and the [add-on code standards](../../docs/addon-development/code-standards.md). The
[server API guide](../../docs/guide/en/README.md) describes the portable CMS
operations. The [add-on contracts](../../docs/arch/site-addons-contracts.md) and
[live update contract](../../docs/arch/live-addon-updates.md#execution-and-failure-boundaries)
own the host behavior, including shutdown and disposal.
