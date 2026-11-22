# ADR 0043: CMS hooks and durable handlers

Date: 2026-10-29

Status: Accepted by the owner in the hooks design conversation.

## Decision

Hooks are a shared CMS capability inside the existing layer-first backend.
Their domain owns definitions, applied implementations, subscriptions and delivery
semantics. Application operations own configuration, checks and processing;
source capabilities continue to own their business mutations. A source prepares
checks through a port, then commits its change and immutable event recipients in
one database transaction. Technical sessions stay inside persistence adapters.

Checks run sequentially before a mutation and may deny it. A missing or failed
required check fails closed. Events describe committed facts and enter a durable
outbox. Workers evaluate pure handler source in a bounded worker, persist the
complete command plan, then execute explicitly granted commands through owning
application operations. Snippets retain their rendering responsibility. User
hook handlers have separate drafts and explicitly applied immutable versions.

Add-ons declare versioned definitions and pure-source handler descriptors through
SDK 0.3.0. Their source operations use the host preparation and transactional
recording bridge. Code-owned bindings and user bindings share deterministic
priority ordering. An add-on cannot declare CMS or another add-on's namespace.
The clean distribution keeps both business registries empty.

For one event, a following handler waits until the previous runnable handler's
attempt finishes. Failure releases other handlers to proceed. Retry ordering is
strict per logical consumer and subject, across subscriptions and code versions.
An erroneous consumer cannot hold another consumer's lane. Disable stops new
recipient capture and suspends existing work. Enable resumes old captured work;
events from the disabled interval are not backfilled.

Installation setup completes with the first administrator's successful creation.
Site setup completes after the site and its directories have been created.
Both completion markers and events are transactional and emitted once. User
handlers are site-scoped; installation hooks are available to add-on code and
shown read-only in the site hook catalogue.

Hook configuration is site content. Events, deliveries, command receipts, lanes,
execution journals, installation identity and registration projections are not
portable site content. Full restore rotates the site's generation, invalidates
old unfinished deliveries and captures the restored subscriptions atomically.
Unresolved effects prevent restore. Aborted restore retains the old generation.

## Baseline migration exception

The owner explicitly requested adding the collections, validators and indexes to
the pre-release main migration and recalculating its expected fingerprints.
This intentionally changes its checksum. Existing installation receipts will
reject the modified baseline. The separate disposable katerina-bloom installation
is reset without a dump as explicitly requested. No other database is reset.

## Consequences

At-least-once delivery requires stable command keys and a persisted command plan.
The supplied page commands commit their source effect and command receipt in the
same transaction. Expired ownership and revoked current grants prevent commit.
Unknown results are reconciled from these receipts before an explicit retry;
other command providers must supply equivalent recovery before registration.

The initial command registry deliberately contains page create/update and a
read-only page query. There is no unrestricted host service, filesystem,
environment or network API for handler source. Add-on business actions require
explicitly registered command adapters and their idempotency contracts.

See [runtime contracts](../arch/hooks.md) for implemented events, ports and limits.
