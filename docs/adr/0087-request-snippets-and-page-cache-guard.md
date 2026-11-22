# ADR 0087: Preserve per-request Snippet execution when choosing page caching

Date: 2026-11-15

Status: Accepted requirement for future implementation. This documentation change
records the owner's requested behavior; it does not implement the guard or change
existing published cache policies.

## Purpose and current gap

A Request Snippet exists to execute separately for each page request using that
request's validated context and the selected release's frozen code. Identical
inputs on later requests do not by themselves authorize reusing its result.
Within-request dependency scheduling/deduplication remains a separate contract.
Request does not mean an automatically fetched browser fragment.

The current whole-document SharedPublic cache can return complete HTML without
executing its Request Snippets. Background refresh runs on a cache schedule, not
once for each visitor request. Consequently page caching can break a Request
Snippet's expected behavior: current availability, time-dependent state or another
per-request calculation can be skipped or remain stale. HTTP no-store controls
browser/intermediary reuse and does not disable the CMS's internal document cache.

Current implementation permits explicitly cache-declared Request Snippets within
the accepted TTL. Those declarations and ParallelRead do not guarantee per-request
execution. The stricter absence check below is not implemented yet. Until it is,
authors must inspect dependencies manually and keep whole-document caching off
when the page uses Request Snippets. Do not infer a live policy change from this ADR.

## Required future behavior

Before enabling a whole-page cache, resolve the page's complete composition and
check that it contains no Request Snippet invocation. Include nested chunks,
Each targets, both conditional branches, explicit bindings, named/keyed calls,
registered providers and editable Snippets. Classify the invocation's execution
phase, not merely whether a provider supports Request as one possible phase.
Frozen Build-only values are not Request invocations.

When any Request invocation is reachable, refuse the incompatible cache setting
and display an actionable warning identifying the Snippets and include/binding
paths. Explain that full-page cache hits skip their per-request execution. Do not
silently change phases, remove dependencies, disable logic or offer a warning-only
override that leaves the incompatible combination active.

Enforce the same rule on the backend configuration/save and publication boundaries,
not just the editor switch. Recheck after rendering/element/dependency changes so
an enabled cache cannot silently acquire Request dependencies. Invalid changes
must leave the previous valid publication active. Existing cached publications
require an explicit transition design before implementation; this decision does
not silently rewrite their immutable plans or settings.

A public-cache declaration or ParallelRead cannot waive the absence check. Existing
cache admission, isolation, limits and expiry/refresh rules still apply to eligible
pages without Request invocations. Cache compiled plans/assets independently;
this decision does not forbid those caches or automatically cache browser API data.

## Documentation and verification

State both intended per-request semantics and the current full-document-cache
exception in the Snippet guide, cache contract and authoring guidance. Distinguish
stale HTML from a browser form's independent API requests. A successful booking
form does not prove that a skipped server Request Snippet executed.

Future focused regressions must cover direct/nested/conditional/Each Request
invocations, aliases/providers, Build-only pages, API attempts, dependency edits,
failed publication preservation and the visible warning. This change claims no
runtime implementation, migration, deployment or new test results.

Related contracts: [Snippets](../arch/snippets.md),
[document cache](../arch/request-document-cache.md),
[rendering/publication](../arch/rendering-and-publication.md).
This accepted requirement revises the future eligibility policy from ADR 0063;
ADR 0074's refresh mechanism remains the current implemented behavior.
