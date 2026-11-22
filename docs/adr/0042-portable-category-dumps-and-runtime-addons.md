# ADR 0042: Portable category dumps and immediate add-on installation

Date: 2026-10-29

Status: Accepted through the owner's category, portability and immediate-installation decisions.

## Decision

Extend ADR 0041 with independent Snippets, Chunks, Templates, Addons and Files
archives. Each partial archive has exactly one category. Export and import select
individual sources or add-ons; Files always transfers the complete media tree.
Partial archives can be uploaded into another site or another installation.
Complete-site restore retains its existing same-site replacement contract.

The versioned gzip header records the type. The filesystem remains the entire
dump catalogue, including type, size and UTC creation instant. No dump database
entity or sidecar index is introduced. Delete removes one regular archive;
already missing files succeed quietly. An unreadable header is shown as Unknown;
its archive remains downloadable and deletable. Invalid archives cannot be applied.

Sources match exact normalized names within their category. Existing target
identities and keys remain stable. Duplicate target names require an explicit
target choice. New sources get target-assigned keys. Database sources take
precedence over file copies, including file-only sources in the export list.
Imports update drafts and private source files. They never publish or change the
active release. Selected chunk references are rewritten to the assigned keys.
Dependencies outside the selected category are not exported implicitly.

File imports merge by path, replacing collisions and adding new files while
retaining unmentioned files and previous asset versions. The media library and
asset records are merged with target-scoped identities and content references.

Add-on archives independently include configuration/connections, business data
and an installation package. Configuration and business data default on;
the package defaults off. The import can choose a subset of the included parts.
Registered add-ons declare their owned collections, identity formats and foreign
reference paths. Cross-site import assigns new business identities and rewrites
declared references. References to pages require explicit mapping to existing
target pages. Page content, other add-ons and global administrators are excluded.
Imported data replaces the selected add-on's target data; other add-ons survive.

## Runtime packages

The owner requires an imported add-on to work immediately, without restarting
the application. This extends ADR 0036: fixed package artifacts remain the build
input, while an optional prebuilt runtime artifact is the portable install input.
The clean CMS registry remains empty under ADR 0037. Site-owned build composition
creates portable artifacts from explicitly registered fixed-version code.

A `zarya-addon` version 1 manifest identifies a bundled CommonJS server factory,
an optional standalone ESM admin mount and CSS, exact host dependency versions,
owned schemas/references and SHA-256 hashes for every package file. Import does
not run npm, a compiler, a second Nest application or a process restart. The
server factory receives the existing connection pool, authenticated host ports,
publication ports, add-on policy and a persistent installation-local secret.
Each bundle uses a separate model cache over the same MongoDB client. The
admin bundle mounts through the existing SDK host and authenticated asset route.

Code installation is an explicit administrator operation: uploaded package code
is trusted executable server/browser code, not a sandboxed source preview. Archive
review validates package files and ownership without evaluating code. Owned schema
installation cannot transform existing records, claim core/another add-on's
collections or change existing validators/indexes. Incompatible versions and
different artifacts for an already installed runtime version reject. Reimporting
the identical artifact is idempotent.

Packages and active registration live privately below the dump root in
`.installed-addons/`, outside site archive scans and public media. Installation
secrets are generated locally and never exported. Bootstrap verifies the saved
manifest, hashes and schemas before loading registered modules and listening.
Disabling a site connection continues to preserve administrative maintenance and
data while denying new public operations.

The archive application uses the existing HTTP maintenance gate and filesystem
lock. A review token binds the archive, target database state and relevant source
catalogue; stale choices reject. Database/file replacement keeps ADR 0041 recovery.
Code/schema installation is durable independently of site-data replacement: a
failed data import can leave a verified package installed without reporting that
data import succeeded. Retrying uses the same installed package. Independent
writer processes and external/background mutations must still be quiescent.

## Verification

Focused tests cover category separation, selected replacement, draft visibility,
file merge, authorization, deletion, compound site validators, cross-installation
add-on data/page mapping, immediate API availability and protected admin assets.
Tests use isolated synthetic databases and temporary roots. Business registrations
and integration sources remain in the site installation.
