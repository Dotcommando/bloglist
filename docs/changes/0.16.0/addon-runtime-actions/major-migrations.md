# Major add-on migration baseline

A major add-on package contains one new `0000-runtime-v<major>.json` migration.
The new migration declares the IDs and checksums of the history it supersedes.
An Exclusive upgrade checks the installed history and receipts, updates owned
collections in place, validates the records and writes a new receipt. The old
receipts and installed artifacts remain intact. A fresh installation applies
the new baseline directly, and later minor updates append their migrations.

Events adds an optional venue to individual events. Existing events without a
venue display an empty field. An administrator can set or clear the value under
the existing event permissions. Inbox retains its unread and viewed states.

Verification covers rejected history, valid upgrade, retry, fresh installation,
retained records and Events venue editing in the actual administration.

## Verification

The MongoDB integration case rejected an incorrect historical checksum, applied
an Exclusive baseline to existing records, filled a missing field from the old
document and preserved both old receipts. A repeated migration produced one
new receipt. The selected baseline also installed in a clean database.

The supplied archive was restored in the separate `cms-test-site/candidate-major`
copy on CMS `0.15.3`, Events `0.4.5` and Inbox `0.1.3`. CMS `0.16.0` installed
the two `1.0.0` candidates through the live update workflow and reconciled a
repeat apply. Document hashes for Events sessions, series, participation and
Inbox matched before and after migration. The Inbox source archive was empty,
so both unread and previously viewed test inquiries were inserted before the
upgrade. All historical receipts and one new receipt per add-on were verified.

Playwright opened the saved event and changed its location. The Events API
preserved it when omitted from a later edit, rejected an overlong value and
cleared it with `null`. Events also passed a fresh runtime installation with one
receipt. Inbox passed its actual host test for public submission, site isolation,
viewed state, badge and paging on a fresh installation.
