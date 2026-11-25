# Build and release an add-on runtime

## Bind the SDK

Read the [SDK package metadata](../../packages/addon-contracts/package.json) and
the host's [compatibility contract](../arch/live-addon-updates.md#package-contract).
CMS and SDK versions are independent. Use an exact SDK artifact and commit its
lockfile integrity in the add-on project. Resolve it through the owning build
and dependency workflow. Installed prebuilt runtimes use their declared host
dependencies. Check actual consumers before changing a site's npm dependencies.

From the CMS checkout, build and pack the portable SDK when a new SDK artifact
is needed.

```sh
npm run build:contracts
npm pack --workspace @zarya/addon-contracts
```

## Build and publish

1. Build the prebuilt runtime directory through the owning add-on composition.
   Include its server entry, declared optional admin assets and owned
   migrations. Check the [manifest and archive contract](../arch/site-addons-contracts.md#repository-release-installation)
   for required files, minimum CMS version and accepted package format.
2. For a minor or patch update, keep the current baseline and append any new
   migration. For a major update, consolidate the add-on's migrations following
   [the major-version workflow](#consolidate-migrations-for-a-major-version).
   Use the [live update package contract](../arch/live-addon-updates.md#package-contract)
   for compatibility, declared routes and migration limits. See
   [action registration](authorization.md) for 0.16.0 metadata and the packaged
   HTTP route inventory.
3. Run the pack command from the CMS checkout with a new output path. The
   command preserves an existing artifact at that path.

   ```sh
   npm run addon:pack -- path/to/prebuilt-runtime .tmp/addon.runtime.gz
   ```

4. For repository installation, attach that file to the stable GitHub Release
   under the required name. For an installed runtime update, use the separate
   [live update workflow](../arch/live-addon-updates.md#administration).

## Verify the selected runtime

Match the artifact's implementation version, source identity and digest to the
selected runtime in the actual host. Verify the registered descriptor and admin
assets, migration receipts, and site enablement separately. Package metadata,
filesystem paths and a successful build establish build identity. Host selection
requires its own evidence.

Use the owning contracts for pending or unknown installation outcomes. Reread
the retained claim and runtime registry, then use the identical-artifact retry
when supported. Follow [testing and release evidence](testing.md) before claiming
the package usable through the host.

## Declare references to Files

Declare each owned field that stores a CMS file ID in its collection's
`references` array, for example
`{ "path": "cards.*.imageId", "collection": "media_files" }`.
Index the site and the declared field together when the domain allows it.
Use the host file picker, streamed upload and `files.getFiles` to select,
create and resolve Files. Batched metadata includes output URLs and returns a
null entry for a missing ID.

Pass the IDs being assigned to `host.fence.check(permit, session, fileIds)`
inside the same transaction as a guarded write. A write that assigns no file
references passes an empty list. The fence validates ownership and prevents
ordinary deletion from racing with assignment. Forced deletion can leave
an unresolved reference, so consumers handle missing metadata.

Add-on export keeps business records that refer to missing Files. The export
report counts the missing references and the archive records their IDs.
Same-site restore prefers an existing file ID and preserves a dangling ID if
it cannot resolve it. Cross-site restore matches the archived public path to a
unique target file, including when its content has changed. The review lists
unresolved references. The operator may explicitly omit those fields or array
entries when the destination's add-on data schema permits omission.

## Consolidate migrations for a major version

Ship one `migrations/0000-runtime-v<major>.json` containing the complete current
validators and indexes for every owned collection. Its `id` matches the file
stem. Its `replaces` object maps every replaced migration ID to the lowercase
SHA-256 of the exact packaged bytes. Carry forward the previous baseline's
`replaces` entries along with the migrations present in the selected version.
Keep the prior packages and applied receipts as integrity evidence.

Declare an `Exclusive` update from the supported installed version. Design the
migration for the existing documents as well as an empty database. Represent
unknown historical values explicitly when the schema requires it. Preserve IDs,
references and business state. The CMS checks the installed history, pauses the
add-on, applies the baseline to its existing collections, validates the result
and records the new migration before activating the runtime. The updater can
retry the same prepared package after an interruption.

Verify both a fresh installation and an update with representative old records.
Check validators, indexes, preserved data, old and new receipts and repeated
application. Assert rejection for a mismatched history. Later minor and patch
releases keep this baseline byte-for-byte and append their migrations.
