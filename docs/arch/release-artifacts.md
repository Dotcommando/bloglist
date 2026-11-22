# CMS release artifacts

See [ADR 0057](../adr/0057-release-artifacts-and-delivery-diagnostics.md).
The root package.json owns the CMS version. The admin build reads it directly;
admin/package.json and package-lock.json retain matching release metadata.

## GitHub publication

The Publish CMS release workflow creates a GitHub Release when a stable v-prefixed
tag is pushed, for example v0.10.0. The tag must point to source containing the
workflow. Pushing a tag alone does not create a Release without this automation.

For an existing tag created before the workflow was added, merge the workflow into
the repository's default branch, then open Actions / Publish CMS release / Run
workflow and enter that tag. The manual run checks out the exact existing tag;
it does not rebuild the current default branch or move the tag.

The workflow validates tag/package/lock/admin versions, installs with npm ci
using pinned Node.js/npm, checks types/lint/build, runs the focused workspace
bootstrap and release artifact tests, packages the clean tagged source and
verifies the archive and extracted inventory. It publishes the source .tar.gz and detached .sha256.
The typecheck:server command builds the workspace SDK first: npm ci links
@zarya/addon-contracts but does not generate its dist exports. A clean checkout
must pass npm run typecheck without depending on earlier local builds.
GitHub Actions uses the repository GITHUB_TOKEN with contents: write; no
separate personal token is required. Existing releases/assets are not overwritten.
Inspect a failed run in Actions; a tag with no run needs the manual procedure above.

Workflow dependencies are pinned to action commit SHAs. Hosted execution and
publication must be verified after the workflow reaches GitHub; local checks do
not demonstrate a successful hosted release.

## Build and verify

Before each minor release, run the local
[administration release tests](../cms-development/admin-release-tests.md) once on the
final candidate and retain its unfiltered passing report. This explicit local
gate does not add a scheduled job or change GitHub publication authority.

Commit the release source, complete the affected checks and package a clean tree:

```sh
npm run release:pack
```

The command prints the archive path and its SHA-256. It writes
cms-zarya-VERSION-COMMIT.tar.gz and the corresponding .sha256 in .tmp/releases.
The archive contains committed CMS source plus cms-release.json. It excludes
development metadata in .serena, .codex, .agents and .idea, and refuses tracked
private environment/provider settings. Git's source file modes are preserved,
including executable installation wrappers when packaging on Windows.

Verify the detached checksum against the trusted release checksum, then extract
into an empty staging directory. Verify before installing dependencies, building,
or adding installation configuration:

```sh
sha256sum -c cms-zarya-VERSION-COMMIT.tar.gz.sha256
mkdir cms-source
tar -xzf cms-zarya-VERSION-COMMIT.tar.gz -C cms-source
cd cms-source
node scripts/release-artifact.mjs verify
```

A pinned Node container can run verification when the host has no Node:

```sh
docker run --rm -v "$PWD:/work:ro" -w /work node:26.7.0-bookworm-slim \
  node scripts/release-artifact.mjs verify
```

Git is unnecessary on the destination. A successful verification compares the
whole extracted payload inventory, detects modified/missing/additional files and
checks package.json against the recorded version. It is an integrity check;
obtain the archive/checksum from a trusted release channel.

## Manifest and administration

A release manifest has format 1, version, full commit, checksum and files.
Each file has a relative path, byte length and SHA-256. checksum is SHA-256 of
the UTF-8 JSON serialization of the sorted file inventory. It identifies the
payload without a circular dependency on the archive or manifest's own bytes.
The detached .sha256 identifies the compressed archive itself.

The tracked format-0 manifest is a development marker. It contains no duplicated
version. Packaging replaces it in the archive with real provenance. Vite embeds
only the root version, commit and payload checksum; it does not expose the file
inventory or private environment. Version mismatch or malformed release identity
fails the admin build. The header displays CMS Zarya v.VERSION, with commit and
payload checksum available by selecting the version. A format-0 build clearly
reports the absence of release provenance.

## Docker image import verification

Both Docker targets run scripts/verify-image-imports.mjs after USER node. The
check requires UID 1000 and imports the actual composition definitions: public
HTTP and process supervision for runtime, and deployment management for cloudflare.
It does not call bootstrap functions, start servers, connect to MongoDB or contact
Cloudflare. No installation settings or credentials are needed. Import/permission
errors fail docker build instead of surviving a successful root build.

A source archive extracted under a restrictive umask can leave workspace
directories inaccessible to the service user even when root compilation succeeds.
Correct source permissions before building; keep private installation data and
secrets restricted. Do not move this verification before USER node or run it as
root to bypass a failure.

The release workflow executes
`npm run test:integration -- test/integration/docker-image-imports.integration.spec.ts`.
The tests use the real Dockerfile, create only disposable untagged images, check
normal builds and inject unreadable SDK directories, missing role modules and
root execution. They remove created images and temporary Dockerfiles.

## Upgrade boundary

After staging verification, transfer CMS code and cms-release.json into the site
installation while retaining its .env, secrets, database, media, site sources,
dumps, installed add-ons and immutable publication artifacts. Stop the executor
and HTTP writes during migrations, retain MongoDB, rebuild both images, apply
and verify migrations, then start the installation under its approved procedure.
Do not run payload verification against a built or populated installation:
its dependencies and site-owned files are deliberately additional state.

Apply pending migrations from the selected release; preserve applied migration receipts.
The source artifact is separate from a site's content publication and Cloudflare
delivery. Building an image does not create a Worker or acknowledge delivery.
