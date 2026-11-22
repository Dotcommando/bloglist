# ADR 0048: Stream file payloads and admit requests before expensive work

Date: 2026-11-01

Status: Accepted through the owner's streaming-upload and security-fix request.

## Decision

File payloads use bounded streams throughout new and changed HTTP, storage,
copy, hashing, processing and publication paths. Do not collect a complete file
into a Buffer, base64 string or JSON body for transport. Use private temporary
files when a format detector or image decoder needs seekable input. Resource
owners release temporary inputs and all derivatives after success and failure.
The detailed contract is in [streamed file I/O](../arch/streamed-file-io.md).

UploadMediaFile and ChangeMediaImage retain their paths and application inputs.
Their HTTP adapters now accept raw application/octet-stream with explicit
Content-Length and a bounded percent-encoded JSON X-Zarya-File-Metadata header.
The browser sends the File directly. The old base64 JSON upload representation
is rejected rather than retained as a buffering fallback. This explicitly
supersedes the binary transport detail of ADR 0026; ordinary administrative
commands and responses remain REST/JSON.

Protected /api/admin requests authenticate before dispatch and before consuming
a body. Login and idempotent logout remain explicit small-body exceptions.
Domain/application authorization still runs in the owning operation.

Login retains its email-based persisted limit and adds the same persisted
failure window for the trusted socket source, with a separate hash namespace.
A source's tenth failed login starts the existing fifteen-minute pause even
when the caller changes emails. Successful authentication clears that source's
counter. HTTP admits at most two concurrent login operations per process,
returning 429 with Retry-After instead of creating an unbounded work queue.
The source identity currently comes from the socket, including behind an edge;
clients sharing that source share its failure budget. Arbitrary forwarded
headers do not change it. No global administrator lockout state is introduced.

Publication metadata lookups are explicit: GetPublishedArtifact.metadataOnly
and the publication-store read metadataOnly argument default to false.
Metadata lookup validates ownership, manifest, file confinement, existence and
declared size without reading file contents. It must not be consumed as a body.
Public routing reads the selected activated release manifest without hashing
every file in that release. HEAD and matching conditional GET use metadata only;
they omit body-derived CSP instead of deriving it from HTML. A cached response's
existing CSP is retained by normal conditional-response semantics.

Full reads retain checksum verification before serving content. Hashing and
CSP extraction run over streams; GET then streams the verified immutable file.
Publication staging/reuse and offline relocation retain their integrity checks
while replacing whole-file buffering with streamed writes and digests.
No schema or content migration, release activation, publication retention or
site-specific capability is introduced.

## Verification

Security regressions model an unfinished oversized anonymous request, email
rotation, concurrent blocked password operations, repeated HEAD/conditional
requests and disconnect during backpressure. Additional stream tests prove
that upload processing starts before the client finishes, storage does not
concatenate files, and image transforms do not use whole-file toBuffer.
Application fake-port tests verify temporary-resource cleanup on write failure.
Focused integration tests use disposable databases, synthetic files and
test-owned servers/browser contexts. No owner application is started.
