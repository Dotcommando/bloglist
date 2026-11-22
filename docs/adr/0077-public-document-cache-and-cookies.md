# ADR 0077: Public document cache and cookies

Date: 2026-11-10

Status: Accepted through the owner's implementation request.

## Decision

Public GET/HEAD requests remain eligible for the explicitly enabled SharedPublic
document cache when they carry cookies. This replaces the blanket Cookie-header
bypass described in the original Request document cache contract.

The public rendering boundary receives only the selected published site/release,
path, representation and normalized typed parameters. It receives neither raw
HTTP cookies nor a session or caller identity. SharedPublic Snippets already
prohibit private, entitlement-dependent and cookie-dependent data. Cookie names
therefore need neither an allowlist nor entries in the document cache key;
administration, analytics and unrelated preference cookies reuse the same public
document as an anonymous request.

Authorization headers retain the existing bypass. Pages without an approved
SharedPublic policy, previews, failures and uncacheable fallback results retain
their existing behavior. Browser responses remain Cache-Control: no-store.
No administration or API authentication boundary changes.

Future rendering that consumes cookie-dependent or personalized inputs must
define its own explicit application inputs and cache eligibility/variation
contract before using shared storage. It cannot inherit this public-only policy.

## Verification

HTTP adapter tests cover admin, arbitrary and empty cookies, preserving the
Authorization bypass and excluding headers/identity from rendering inputs.
Isolated HTTP integration covers a cookie-bearing cold fill, anonymous and
cookie-bearing hits, HEAD, separate Markdown entries, Authorization bypass and
unchanged uncacheable/error behavior.
