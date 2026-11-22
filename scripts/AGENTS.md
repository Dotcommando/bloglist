# Tooling, packaging and releases

Also applies to root package metadata/lockfiles, Dockerfiles, Compose, release
workflows and `ops/`. Dependency pins follow
[source conventions](../docs/cms-development/feature-design.md#source-and-configuration-conventions).
Never add a site/theme installer here.

## Release consistency

CMS/root/admin package versions and lockfile metadata agree on plain stable
MAJOR.MINOR.PATCH. Application and deployment-executor Docker tags use that exact
version, without v/prerelease/build/installation suffixes. Generate Compose tags
from release metadata. Never build/publish/install new code under an older tag.
Verify expected tags, packaged metadata and the version actually built into both
images; a tag alone is not evidence. Retain focused automated consistency checks.
Provenance belongs in commit, manifest, checksums and digests.

Both Docker targets must verify their composition imports after USER node with
UID 1000. Preserve scripts/verify-image-imports.mjs and the real Docker regression
step before release publication. Import definitions without bootstrapping CMS,
starting servers or requiring database/provider credentials; root compilation
and an administration-label check alone do not prove service-user readability.

Derive `CMS Zarya v.<version>` in the admin from root package.json during build;
verify the built label before release. Do not maintain another hardcoded version.
MongoDB uses a published plain mongo:X.Y.Z@sha256 digest, identically selected
in local/production Compose. Verify platform/distribution and compatibility
separately; removing a tag suffix proves nothing about image bytes.

Git release tags are vX.Y.Z on matching metadata. `.github/workflows/release.yml`
starts on a pushed v* tag, accepts only stable vX.Y.Z and verifies versions. Manual
dispatch uses an existing stable tag. It checks/builds/packages and publishes
source assets with SHA-256 to GitHub Releases. It does not push Docker registry
images or deploy installations. A local tag or ordinary branch push is not release
publication. Read `docs/arch/release-artifacts.md` for exact artifact commands.

## Filesystem permissions in scripts

When writing or changing installation, update, archive, copy or deployment scripts,
review the effective UID/GID, umask and permissions of every created path. Root
success does not prove that the service user can traverse directories, read code
or write its runtime state. Restrictive extraction (for example umask 077) and
root-created add-on files caused service-user module loading to fail previously.

For public source/build inputs, preserve executable bits and make directories
traversable and files readable by UID/GID 1000 (normally 0755/0644). Assign newly
created writable runtime files and receipts to the service owner. Apply changes
only to the reviewed target paths; never recursively relax the entire installation,
use 0777, or expose .env, credentials, private data, dumps or installed secrets.

Verify access as the actual service UID after archive extraction/copy and in both
final Docker targets. Keep permission-failure regressions and the mandatory image
import checks; do not bypass a failure by running the service or check as root.

## Installation changes

Code updates, migrations, site-data restoration, add-on runtime selection and
external deployment are separate operations. Preserve administrators, business
data, media, settings and releases unless replacement is explicitly authorized.
Check actual runtime/image identity rather than npm versions or names alone.
A fresh distribution's MongoDB image does not authorize an existing installation's
major database upgrade. Reassess inherited CPU/RAM/heap/cache/pool limits after
process-topology changes; do not silently carry unjustified caps forward or invent
new ones. Use the installation's procedure and current authorized scope.
