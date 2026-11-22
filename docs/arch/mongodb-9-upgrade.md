# MongoDB image and upgrade boundary

CMS 0.14.0 selects `mongo:9.0.8@sha256:1444adda2e4b8d6a0d7f242a625d834a78d6e3aa6e4ed1b0b4c2dab2318c5e3d`
for both Compose environments. The published index includes Linux amd64 and
arm64/v8. The inspected amd64 image reports Ubuntu 26.04.1 LTS (Resolute),
`distmod: ubuntu2604`, and `mongod` 9.0.8. The plain tag is an alias for that
published image; removing a distribution suffix was not used as an equivalence
test. Selection was checked on 2026-11-13 against the
[official image definitions](https://github.com/docker-library/official-images/blob/master/library/mongo)
and [MongoDB 9.0 release notes](https://www.mongodb.com/docs/manual/release-notes/9.0/).

The current lockfile supplies Mongoose 9.11.2 / Node driver 7.7.0. The CMS uses
existing CRUD, validators, indexes, snapshot reads and majority transactions;
the focused migration/dump/restore checks exercise these on the selected image.
Do not infer support for every new server feature from those checks. Consult
the [driver compatibility guidance](https://www.mongodb.com/docs/drivers/compatibility/)
when changing a driver or enabling new server features.

## Existing data

This is a deliberate major upgrade, not an image-label correction. Before any
installation upgrade, inventory the actual server version, platform, replica-set
state and FCV. Keep a tested independent backup of the database files plus CMS
source/media/publication storage and exact installed migration bytes/receipts.
A site dump is not a backup of global administrators, migration receipts or the
complete installation. Verify restoration of the installation backup in isolation.

MongoDB documents a direct
[8.0 replica-set to 9.0 path](https://www.mongodb.com/docs/manual/release-notes/9.0-upgrade-from-8.0-replica-set/).
Bring all members to a current 8.0 patch and FCV 8.0, check for recovering/rollback
members and review the 9.0 compatibility changes first. Earlier major releases
require the documented successive upgrades to 8.0. A deployment on 8.3 follows
its separate documented path with FCV 8.3. Do not assume an arbitrary old image
can open the same data files as 9.0.

For a single-member installation, stop/quiesce CMS writers and deployment work,
take/verify the independent backup, stop the old database cleanly, and replace
its image using the supported procedure. A single member has an outage; this is
not a rolling high-availability upgrade. Preserve the installation's auth,
keyfile, replica-set name, ownership, volumes and network settings.

Keep FCV at the earlier version during the verification/burn-in window. Check
actual server version, FCV, primary state, validators/indexes, migration checksums,
transactions, publication and a real dump/restore cycle before deliberately
enabling FCV 9.0 with administrator credentials. Downgrade is a separate supported
procedure with compatibility restrictions; changing an image tag back is not
a recovery plan. Restore the verified independent backup when an in-place
downgrade is not supported. Never normalize already-applied migration bytes.

## Observed isolated checks

An independently created test volume was initialized with 8.0.38
(`sha256:d97fea17ccb8d004cd137be8dab54d70d0df11be69c9f422aefe4484c8414ab7`),
FCV 8.0, a required-field validator, a unique compound index and a signed Int64
value `9223372036854775807`. After clean shutdown and replacement with 9.0.8,
FCV remained 8.0, the exact value and indexes survived, and a snapshot/majority
transaction committed. Separate isolated 9.0.8 checks exercised the CMS complete
dump/restore and process-supervisor boundaries. These are synthetic verification
results; no existing installation or production database was upgraded.
