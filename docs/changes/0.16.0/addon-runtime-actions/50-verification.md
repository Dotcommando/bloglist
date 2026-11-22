# Verification evidence

ADDON-ACTION-01 RED used `npm test -- test/adapters/addon-package-registry-install.spec.ts -t 'routes differ from its Actions'`.
All three cases reached activation and incorrectly resolved. Missing route metadata,
a different HTTP method and an extra route were each accepted.

ADDON-ACTION-01 also failed at preparation when the packaged route inventory
declared the wrong method. All nine package registry cases passed after the
coordinator validated the checksummed inventory and the worker validated the
module export. A runtime registration failure leaves no selected manifest and
can be retried with the intact immutable package files.

ADDON-ACTION-02 RED used the existing `explains unbound add-on screens` fixture
with real package installation. The declared Actions were absent from the
catalog. GREEN verified that publication preserves a grant for the same Action
ID, rejects that ID when an effect expands, and rolls back the catalog and digest
on an aborted activation transaction. Matching compatible overlap admitted the
old runtime. An unrelated digest and exclusive overlap were rejected.

ADDON-ACTION-03 RED exercised the registered read Action through the real HTTP
dispatcher. A site administrator received 403. GREEN verified admin admission,
403 for the delegated actor, 200 after granting the same Action, and 403 on an
HTTP method without a registered Action. A raw request with the body withheld
received 403 from the CMS before the add-on consumed any body.

ADDON-ACTION-04 held a request open after admission, revoked its write grant,
and allowed the body to finish. The new authorization inside the MongoDB
transaction returned 403. The committed record count was unchanged. A scoped
read used Own and Groups together, excluded other tenants and owners, and
applied those filters to rows and totals before pagination.

ADDON-ACTION-05 RED reached Playwright under a delegated role and timed out
waiting for the allowed add-on menu entry. GREEN proved the UI with a real
delegated session. The read-only view showed the saving hint. An administrator
checked the save grant in the role editor. The delegated tab saved one record.
After grant withdrawal, the same open tab received a refusal and the count
remained one. The existing unbound administrator guidance also passed.

The supplied full site archive restored in `cms-test-site` on the exact
matching `0.15.3` schema with Events `0.4.5` and Inbox `0.1.3`. Its 28 collection
schemas matched the archive signature. The restored site has 15 pages,
184 Events sessions, three participation requests, and both connections.
The source archive has no Inbox requests. The site uses its own MongoDB volume
and the restoration app ran with background work disabled.

ADDON-ACTION-06 ran the final Exclusive updates of both `1.0.0` candidates on
the restored site. It matched both active digests with the built manifests.
HTTP and headless Chrome passed for a temporary custom role. Events calendar
and details opened under read grants. Create and reschedule succeeded once
granted. A subsequent write was rejected after revocation. Inbox read-only
showed its marking hint, badge and marking required their separate grants,
and revocation rejected the next marking request. The test event and Inbox
record were removed after verification. The original owner data was kept.

The CMS server, admin build, lint and type checks passed. Twenty-five focused
architecture, package and update tests passed, as did four real Synthetic
update and admission cases. The five Synthetic update fixture packages were
rebuilt from their source in an isolated scratch directory with Mongoose
`9.11.4`. The original fixture files and migration bytes were retained.
Events passed its build, lint, type check and package fidelity test. Inbox
passed its build, lint, type check, eight unit tests and real-host script for
public submissions, cross-site separation, marking, badge and paging.

The full CMS unit suite also covers the migration list, core request admission,
and disconnects while streaming assets from both add-on workspace paths. Two
Snippet failures were reproduced on the unchanged baseline `76aea86`. The REST
test expects an update without `draftOnly`, and the frozen JavaScript execution
test times out in this Windows environment.
