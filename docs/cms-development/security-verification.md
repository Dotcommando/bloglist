# Security design and verification

Apply this standard during the [feature lifecycle](feature-lifecycle.md), including
application-only changes that affect request admission or file/stream safety.
Use [testing policy](testing-policy.md) for test levels, execution and evidence.
Capability contracts own exact mechanisms and limits; this document owns general
security controls and the adversarial checks used to verify them.

## Assess the changed trust boundaries

Before implementation, identify entry points (including indirect/background
invocation), actors, untrusted inputs, sensitive outputs, owned data and expensive
effects. Trace where identity/scope becomes trusted and which checks run before
each effect. Select applicable rows below; explain inapplicable categories and
identify unverified requirements. A visual-only change can have a short assessment.
Do not claim whole-product security from a focused review.

| Boundary | Design questions and negative checks |
| --- | --- |
| Identity/session | Missing, forged, expired, revoked or blocked identity; no local-operator fallback; recheck authority at the owning operation and long-lived subscription as required |
| Object/site authority | Another site's IDs, paths, references, versions and cache keys; unauthorized global operations; no foreign read/write or existence disclosure contrary to the contract |
| Browser boundary | Cookie/session protections, trusted Host/Origin, CSRF, duplicate/malformed headers; test real routing and upgrade paths if present |
| Input/storage | Explicit allowed fields, types and bounds; reject unchecked MongoDB operators and prototype keys; malformed/nested/oversized inputs leave invariants and built-ins intact |
| Output/rendering | Escaping in the actual HTML/attribute/URL/JSON context; stored/reflected XSS, unsafe URL schemes and closing-tag injection; data is not executable template syntax |
| Files/archives | Encoded traversal, absolute/foreign paths, links where relevant, private/public separation, malformed/truncated input, actual byte/pixel bounds and temporary-output cleanup |
| External requests/execution | If present: user-controlled destinations/redirects and SSRF, executable arguments/imports, hook/snippet grants and capability confinement; do not introduce network/code authority implicitly |
| Resource admission | Authentication before expensive work, independent rate/concurrency/queue bounds, cancellation and cleanup; no attacker-controlled key bypass |
| Data visibility/cache/publication | Draft/private data never enters public output or another site's/release's cache; failure does not activate incomplete artifacts or expose private staging data |
| Mutations/recovery | Unauthorized or stale requests cannot commit; concurrent/replayed/uncertain requests follow owning receipts and guards, without duplicate effects |
| Dependencies/packaging | For affected packages/artifacts: known advisories and actual reachability, pinned versions, service-user access, secret/private-file exclusion and existing provenance checks |

Resolve trusted site identity from registered domains/authorized context. Scope
site-owned data, authorization, caches, assets, jobs and publication by `siteId`.
Normalize trusted domains; accept proxy metadata only from configured proxies.
Public delivery never inherits local-operator authority. Server authorization is
independent of frontend visibility. Optional purchased access is a server-side
entitlement, never granted by a redirect or unchecked callback.

## Authenticate before spending resources

A protected endpoint validates its current session and trusted administrative
boundary before consuming a request body, parsing large JSON/contracts, staging
a file, decoding an image or compiling content. Origin/custom headers are not
credentials. Lazy creation of a session-bound operation is not authentication.
An early HTTP guard does not replace owning-operation actor/site authorization.
Explicit public/small-body auth operations require their own bounded contract.

Keep a permanent regression sending an unfinished oversized request without a
valid session. Prove rejection before the first body read or operation, cover
equivalent endpoint families and verify real dispatcher wiring. A 401 assertion
after full upload is not proof of early rejection.

## Bound expensive authentication independently of email

An attacker controls email, so an email-only counter cannot protect password
derivation. Preserve persisted account limits and enforce the trusted source's
failure budget before password work. Keep source keys separately namespaced and
hashed; reject untrusted forwarded identity. Limit concurrent expensive operations
and reject excess work without an unbounded queue. Release admission slots in
finally. Preserve unknown-account timing behavior.

Regressions rotate unknown emails from one source, hold concurrent password
operations open and prove excess requests cannot start more expensive work.
Verify expiry/recovery and persistent counters using isolated dependencies.

## Separate file metadata from content

Use streams for file payloads end to end. Never assemble a complete file into a
Buffer, base64/JSON string or byte array merely to transfer/store it; wrapping a
preloaded file in a stream does not satisfy this rule. Stage private temporary
files for seekable processing, enforce actual byte/pixel limits and keep
framework/filesystem types inside adapters. Dispose temporary inputs and all
derivative outputs in finally after success or failure.

HEAD and matching conditional reads use scoped metadata/existence checks without
loading file bodies, hashing every release artifact or processing images. Full
reads still enforce integrity before exposing bytes. Explicit metadata-only
results are never treated as verified content.

Every backpressured response cancels its drain wait and closes its source when
the request/response disconnects or fails. Never await drain alone without
close/error cancellation. Release temporary files even when later writes fail
or prepared variants remain unconsumed. Permanent file/stream regressions are
listed once in testing-policy.md. When one file endpoint changes, inspect the
other file endpoints for the same defect. Exact I/O behavior is maintained in
[streamed file I/O](../arch/streamed-file-io.md) and [ADR 0048](../adr/0048-streamed-file-io-and-request-admission.md).

## Verify controls, their wiring and absence of effects

Use adversarial unit tests for the owning policy and isolated integration tests
for real HTTP/session/adapter composition as applicable. Check status/error and
also forbidden effects: no write, private bytes, body read, password derivation,
external operation or leaked resource. Include a legitimate success/recovery
case so a control that rejects everything cannot appear correct.

Inspect equivalent entry points and alternate encodings/methods for bypasses.
Keep every corrected vulnerability as an observable permanent regression.
Document its cause, applicable boundaries and prevention through the
[defect-record procedure](../defects/record-format.md); link it from every relevant
area index so future work can find it without loading unrelated findings.
Distinguish a reachable exploit from defense-in-depth tests of impossible states.
Use synthetic data and controlled fault injection under testing-policy.md;
security testing inherits no authority to attack a live installation/service.

For dependency changes, review advisories relevant to the exact affected versions
and runtime usage. Static analysis, dependency/secret scanning and bounded
fuzzing/HTTP scanning supplement behavior tests where applicable; select a scope,
tool and isolated target before execution. Scanner silence does not prove secure
authorization, site isolation or business logic. No particular scanner is mandated
or claimed installed by this document.

[OWASP ASVS](https://asvs.owasp.org/) supplies a reference catalog of security
requirements; [OWASP WSTG](https://wstg.owasp.org/) supplies testing methods. Select
applicable requirements rather than copying the whole catalog. If an audit cites
requirement IDs, record the standard version. Source inspection, automated tests,
scanner results and penetration testing are distinct evidence; do not claim ASVS
compliance or comprehensive security from this checklist alone.
