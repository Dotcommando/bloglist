# ADR 0067: Bounded public query data without a name allowlist

Date: 2026-11-07

Status: Accepted through the owner's CMS 0.10.1 referral-link fix and follow-up
instruction to accept arbitrary bounded public query parameters. The owner
selected the 12 KiB / 128 pairs / 256-byte name limits explicitly.

## Context

A public Request document can open with its clean URL but return an empty HTTP
400 when a referring service adds unknown query parameters. Restricting exceptions
to known marketing names merely moves the failure to the next traffic source or
tag-manager change. Public navigation metadata is not the same contract as typed
rendering arguments.

This is independent of a referring platform's redirect/browser failures. A blank
screen on that platform's hostname alone does not prove the destination was reached.

## Decision

Public GET/HEAD document navigation accepts arbitrary query names and values
within resource budgets. There is no marketing-provider allowlist. Only names
explicitly declared in the selected published Request schema enter rendering.
All other values are ignored by the renderer without removing them from the
browser URL or gateway forwarding. Unknown values are opaque text, never parsed
as JSON, expressions or template source.

Declared inputs retain required/type/enum/structured-value validation. Missing or
invalid declared values still fail with 400. Query parameters cannot override
trusted site/release identities. Snippet/Chunk parameter contracts, administrative
endpoints and business API validation remain unchanged.

Apply these technical limits to the query component, excluding the question mark:

| Boundary | Limit |
| --- | --- |
| Complete raw encoded query | 12288 UTF-8 bytes (12 KiB), including separators and percent encoding |
| Query name/value pairs | 128, counting repeated names separately |
| One decoded name | 256 UTF-8 bytes |
| One value | No tighter separate cap; the complete-query budget already bounds it |

Cloudflare's separate 16 KB limit applies to the complete URL, including scheme,
host and path. Node/proxy header and URI limits remain separate and can reject a
request before application handling. These are not response or pagination limits.

Reject query resource overflow as 414 URI Too Long with no-store, without silent
truncation. Check raw bytes before decoding or creating URLSearchParams, and
check pair count before populating the query map. At the origin this precedes
site/database lookup and rendering; the edge checks before proxying/asset reads.
Malformed percent encoding remains 400. Existing host/path validation remains.

Repeated names become arrays. Undeclared arrays are ignored; declared scalar
inputs reject arrays rather than arbitrarily choosing first/last. Explicit array
contracts validate repeated string values using their normal item schema.
Construct maps without prototype setters: names such as __proto__ are inert data
and are ignored unless declared; unsafe rendering declarations remain forbidden.
Empty names/values and flags do not cause a failure merely for being unfamiliar.

Static documents, sitemap and assets ignore unused query data within the same
budgets. No cleaning redirect, history rewrite or injected tracking values is
introduced. GET/HEAD, Markdown, publication identity, frozen Build values and
existing cache policies retain their behavior.

## Responsibility boundaries

The shared public-query helper under inbound gateway/http owns transport parsing
and budgets for both Node HTTP and Cloudflare. It has no Node-only or provider SDK
dependency. The document normalization adapter selects declared rendering inputs
through the existing output port. Domain/application contracts do not gain
marketing names, URLSearchParams, HTTP objects or provider-specific limits.
The shared template/Snippet validator remains strict and unchanged.

## Verification

Regressions cover arbitrary future names, repeated/empty values, inert prototype
keys, exact and excessive encoded-byte/name/pair budgets, malformed encoding and
strict declared values. Isolated real HTTP covers dynamic/static documents,
HTML/Markdown, GET/HEAD, and 414 before renderer execution. Edge and bundle tests
verify the same budget before proxy/assets and preserve upstream URL data.

Local checks do not acknowledge a production rollout or prove a particular
platform redirect/browser failure has also been eliminated.
