# Design

Use existing Vitest plus playwright-core with the explicitly configured Chromium
executable. A separate release configuration selects relevant browser/real HTTP
specifications and allows bounded file parallelism without changing the general
integration suite's execution policy. The connected journey owns a unique guarded
zarya_test_* database, temporary sources/media/artifacts, loopback listener and
browser context. Only initial administrator provisioning may bypass the UI.

All tested editorial mutations go through the built administration and real HTTP
composition. Public responses, DOM metadata, redirects and sitemap are independent
oracles. No mocked publication/media endpoint may make the connected journey pass.
Use condition/response waits rather than arbitrary sleeps. Capture private local
browser traces on failure, close owned resources and guard deletion targets.

Security assessment: synthetic administrator and content only, no external peers,
no production data or paid services. Test settings are explicit. Cleanup authority
is limited to the unique test database and temporary directory. Authentication and
file safety implementations are unchanged; existing denial regressions remain.

Coverage follow-up: use existing source-editor fixtures for control serialization,
validation and recovery cases. Add separate real-composition browser files for
TV/publication, page metadata, Files and URL operations so independent domains can
run concurrently. Synthetic fixtures never establish publication/storage effects.
Capture real HTTP responses/public documents or file bytes for those guarantees.

Remaining-scenario continuation: seven additional real browser specification files
own independent resources; existing general integration execution policy is
unchanged. The release selection additionally includes existing real TV and
Request-cache runtime suites. Evaluate a six-worker cap for the expanded set.

Background delivery is disabled in the test-owned journey compositions so an
unrelated hook pump cannot race their editorial setup/mutations. Actual admission,
database transactions, source compilation, media processing and activation remain
real. Lazy local composition configures Request delivery or adds a site language
only where no control exists in the requested workspaces; it is setup, never a
replacement for the UI operation under assertion. Close that composition too.

Recovery uses real browser fetch: abort before server admission, expire a controlled
AbortSignal while the selected mutation is held, or forward the mutation to the
real server and then drop its acknowledgement. Observe one attempt, retained
input, actual unchanged/committed state and explicit reload/retry. No success
response is fabricated. Session tests expire valid session intervals in the
guarded synthetic database while preserving the cookie, then exercise real 401
admission/login and prove the rejected edit did not commit. No wall-clock sleeps,
automatic replay, fake database or changed production timeout is introduced.
