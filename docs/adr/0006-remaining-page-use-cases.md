# Remaining page use cases

Status: Accepted

## Context

The owner requested the remaining page operations: archive, get and list.
The existing work established required siteId checks and page business errors,
without users or roles. Archive and get still accepted only pageId.

## Decision

Extend the agreed site-scoping rule to archive and get with required siteId.
Keep existing result semantics: archive returns the saved page; get returns a
page or null; list returns all matching pages. Reuse PageScopeService to detach
the owned archive target. Get and list check ownership before returning data.
List passes an explicit copy of supported filters to its site-scoped repository
operation and rejects mixed-site results without partial success.

Export all seven page operation tokens from PagesModule using its existing
registration through AppModule. This extends ADR 0005 and supersedes the
empty-use-case requirement of ADRs 0001 and 0002 for the remaining pages.

## Consequences

Archive/get callers supply siteId. Existing errors, persistence timestamp
ownership, provider configuration and publication workflow boundaries remain
unchanged. No new adapters, schema changes, user roles or REST endpoints are
introduced. Tests cover archive invariants, missing pages, site isolation,
complete lists, supported filters, provider exports and persistence failures.
