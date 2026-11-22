# ADR 0037: Keep the CMS distribution separate from site installations

Date: 2026-10-28

Status: Accepted through the owner's explicit separation request.

Amendment: [ADR 0039](0039-pre-release-schema-baseline.md) consolidates the
pre-release manifests and supersedes the migration-file preservation below.

## Decision

The cms-zarya checkout is the clean CMS distribution. The katerina-bloom project
is an independent runnable copy for the owner's site and integration testing.
The participation add-on remains an independently developed versioned package.
No project reads another project's source, dependencies, media or publication
files at runtime. Changes to shared engine files must be transferred deliberately.

The site project receives the existing installation, including editable element
sources, media, immutable publication artifacts, private local settings, add-on
package artifact, integration adapters, administration component registration,
installer scripts and installation-specific tests. Its private local settings
continue to select the existing site database. Administrator accounts and
requests stay in that database; they are not recreated or copied into the CMS.

The clean distribution retains the generic add-on entity, SDK, REST lifecycle
operations, transaction fence, administration section and migration ownership
support. Backend and administration add-on registries are empty. It has no
installed business add-on dependency, routes, providers, settings, template
sources or seed data. An empty catalogue is a valid administration state.

The three historical scheduling/participation migrations are preserved unchanged
in the site project and removed from the clean CMS baseline. Remaining migration
identities and checksums are unchanged; gaps are intentional. The clean CMS uses
a separate fresh database. The site's existing migration receipts must never be
reinterpreted as the clean baseline. This split is authorized for the disposable
installation and does not define a production migration procedure.

Local example configurations use separate MongoDB/application ports: CMS
27040/3001, site 27039/3000. The already-running dependency on 27039 remains the
site's current database endpoint. Creating the site's new Compose project would
use a new volume; its name alone does not transfer existing Docker data. No
database/dependency service is stopped, renamed or reset as part of this change.

Future site content, add-on installation and test fixtures belong in site
projects. Historical scenarios and ADRs remain design history, rather than
evidence that their optional capabilities are installed in the clean CMS.

This supersedes ADR 0036 only where it describes a concrete participation
installation in this checkout. Its generic connection and lifecycle contracts
remain in force. See [the current contracts](../arch/site-addons-contracts.md).
