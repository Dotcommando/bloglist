# Remaining interaction scenarios requested after f5f09c7

Target/branch 0.16.0, approved by owner. Baseline f5f09c7, clean tree.
The owner requested all gaps enumerated in the follow-up answer, fixes for
observed bugs, inclusion in the parallel local release gate and a commit.

| ID | Acceptance / proof |
| --- | --- |
| N01 | Manual page order save/reload updates real tree order; invalid input cannot write |
| N02 | OG website selection and resetting to default survive save/reload and real publication |
| N03 | Request-page cache TTL rejects invalid bounds in the UI; valid correction and real cache delivery |
| N04 | Nested Template/Chunk contracts authored through controls persist with real server and affect public output |
| N05 | Invalid browser TypeScript save/apply reports failure; corrected source compiles and publishes |
| N06 | Snippet rejects no enabled phase without losing inputs; correction succeeds |
| N07 | UI-authored Snippet phases/cache/structured result/defaults execute in actual Build/Request rendering |
| N08 | Reassign TV templates and verify actual page forms; sort order changes field order |
| N09 | Invalid TV catalog (no templates, duplicate name) rejects unchanged storage; correct and retry |
| N10 | Page editor opened before TV catalog change receives a conflict without losing edits; explicit recovery |
| N11 | Page editor opened before media change receives a conflict without losing edits; explicit recovery |
| N12 | UI replaces documents and responsive images; stable identity/address, new original and all actual variants |
| N13 | Nested folder creation and name collision refusal/correction |
| N14 | Competing file rename/move editors preserve losing input and actual winning state |
| N15 | UI rejects redirect cycles and preserves the previous public routing; correction succeeds |
| N16 | Child promotion destination collision is atomic and preserves form input; correct and retry |
| N17 | Malformed URL refusal/validation with preserved input and corrected submission |
| N18 | Connection loss during admin mutation: visible error, retained input and explicit reconciliation/recovery |
| N19 | Deterministic timeout during admin mutation with the same guarantees; no arbitrary sleeps or auto retry |
| N20 | Expired actual session during mutation routes to login, prevents write and permits explicit recovery |
| N21 | Existing coverage outside gate: include meaningful TV/media/version and Request-cache runtime checks; prove page language through real UI |

Design: real browser journeys own unique DB/files/listeners via adminJourney.
Keep existing deterministic control tests. Failure injection may gate/abort a
transport or advance a browser request timer, but must not fake a successful
mutation/publication. Assert actual server/public state. Independent files run
in bounded parallel workers, dependent operations remain sequential. Test-owned
application only; owner application and dependency services are not operated.

State: complete; all 164 cases in 28 files passed in the final unfiltered gate. This is a coverage task; only an executed
behavioral failure establishes a new bug. Record RED before production fixes,
use existing defect records for matching mechanisms, and map final test names
and results here and in 50-verification.md.

## Executable mapping

| IDs | File / meaningful assertions |
| --- | --- |
| N01-N03/N21 language | [Page details](../../../../test/integration/admin-page-details-journey.integration.spec.ts), 3 cases: invalid order/no writes, actual tree order/reload, website/default OG output, rejected TTL bounds, real cache miss/hit and draft/publish disabling, selected additional language/public text |
| N04-N07 | [Elements runtime](../../../../test/integration/admin-elements-runtime-journey.integration.spec.ts), 3 cases: Object/Array/Enum defaults, zero/false/null through real save and Build/Request execution, no-phase refusal/correction, structured result/cache declarations, invalid browser TS leaves the active release unchanged then corrected JS actually runs (Template and Chunk) |
| N08-N11 | [TV interactions](../../../../test/integration/admin-tv-interactions-journey.integration.spec.ts), 3 cases: no-template/duplicate refusal, correction and persisted assignments/sort in actual forms, other-template value retention, real stale catalog and referenced-media conflicts, explicit reload/correct/publication |
| N12-N14 | [Media mutations](../../../../test/integration/admin-media-mutations-journey.integration.spec.ts), 4 cases: actual document/replacement bytes, all responsive output bytes/geometry/stable URLs, nested folder identities and name collision, both losing name/folder actions preserve both buffers and recover |
| N15-N17 | [Routing rejections](../../../../test/integration/admin-routing-rejections-journey.integration.spec.ts), 2 cases: server-invalid path and promotion collision preserve working/public routing, corrected submission, excluded self/redirect targets and an actual stale-picker cycle refusal followed by safe target |
| N18-N20 content | [Content recovery](../../../../test/integration/admin-content-recovery-journey.integration.spec.ts), 5 cases: Templates, Chunks, Snippets, Pages and TV catalog |
| N18-N20 files/URLs | [File/URL recovery](../../../../test/integration/admin-file-url-recovery-journey.integration.spec.ts), 2 cases: rename and move; saved routing/public document/file bytes verified |
| N21 lower real boundaries | Existing [TV persistence/version suite](../../../../test/integration/template-variables.integration.spec.ts) and [Request cache runtime suite](../../../../test/integration/request-cache.integration.spec.ts) now included |

Every recovery case covers four separate faults: pre-admission disconnect,
deterministically expired request signal, real commit with lost acknowledgement,
and actual stored-session expiry while the cookie remains. Assertions prove
retained input, unchanged or exactly acknowledged real state, no automatic replay,
successful explicit reconciliation and authenticated recovery. A controlled signal
tests timeout handling without waiting a production deadline; it does not claim
measurement of the wall-clock deadline duration.

Twenty-two new browser cases plus two existing real-boundary cases expand the
gate from 140/19 files to 164/28 files. Final results are owned by verification.
