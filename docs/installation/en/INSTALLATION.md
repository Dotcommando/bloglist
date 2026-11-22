# Production installation

[Русский](../ru/INSTALLATION.md)

Use a separate site installation. Keep its data, private settings and business
add-ons outside the clean CMS repository. This guide describes the supplied
`compose.production.yml`: HTTP application, authenticated MongoDB replica set,
Caddy and a separate Cloudflare executor. Use Docker and Docker Compose on Linux;
the images and Node/npm versions are pinned in the repository.

## New installation

Run from the installation directory. Choose distinct public and backend HTTPS
origins. The backend DNS record must reach this server; allow ports 80 and 443.
The public hostname will belong to a Worker. See [domains and TLS](tls.md).

Run the installer interactively as root, replacing the example origins with your registered domains:

```sh
bash scripts/install-production.sh https://www.example.test https://api.example.test
```

It creates private settings and an authenticated MongoDB replica set, builds the images, applies and verifies migrations, prompts for the administrator, and starts the app and proxy. It refuses existing settings, installation directories or the default Compose project and MongoDB volume. If a step fails, inspect the resulting state before following the upgrade or recovery procedure; do not rerun it blindly.

The administrator script prompts interactively and hides the password. MongoDB's
initialization script creates the scoped application account only on an empty
database volume. Never rerun initialization against an existing installation.

Initially use `/admin/` on the backend origin; it is the generated canonical
administrative origin. Create the site, choose its public serving origin, install
and enable its required add-ons, then publish. Draft saves do not publish.
Configure delivery using [the Cloudflare chapter](cloudflare.md).

## Private GitHub add-on repositories

Install your GitHub App on the account that owns the add-on repositories.
Select the intended repositories and grant repository Contents read access.
Set `ZARYA_GITHUB_APP_CLIENT_ID` and `ZARYA_GITHUB_APP_KEYS_DIR` in the private
environment of the CMS application. The latter is an absolute path to a
directory of PEM files that the CMS service can read. Keep this directory
outside source and public storage. Zarya resolves the installation ID from
GitHub for each private repository. Public repositories work without these
settings.

For a native installation, set `ZARYA_GITHUB_APP_KEYS_DIR` to the absolute host
directory. For Docker, set the Client ID in `.env`, place the PEM files in
`.secrets/github-app`, and run `node scripts/prepare-compose.mjs` as part of the
normal preparation. The script adds the supplied Compose fragment for either
base configuration. The fragment mounts the directory into `app` read-only at
`/run/secrets/github-app` and sets the in-container path. For a different host
directory, set `ZARYA_GITHUB_APP_HOST_KEYS_DIR` in `.env` before preparation.

In Linux production, preparation run as root gives the service group (GID 1000)
read access to the standard key directory and its present PEM files. A custom
directory needs its own service-user read permissions. Keep keys outside Git,
public assets and the image. For rotation, copy the complete new PEM into the
same directory with service-user read access. If a restrictive upload mode
blocks access in the standard production directory, rerun preparation as root.
Test a private repository check, then revoke the old key in GitHub. Key names,
environment settings and the running service can stay the same during rotation.

## Existing installation and upgrades

Preserve the database, `data/`, `sites/`, publication artifacts, dumps, installed
add-on runtime/secret directories and private environment. Code, drafts, the
active CMS publication and externally delivered content are separate states.
An upgrade or Git push alone does not deliver site content.

Administration sessions are bound to the persisted installation-settings version.
Keep installation_settings, admin_users and admin_auth_sessions together in an
installation database backup; do not recreate settings during routine updates.
Changing the administration address rotates that version and requires sign-in.

Stop the executor before backup/restoration. Finish or reconcile any uncertain
provider upload. Stop HTTP writers for a consistent BSON/filesystem snapshot;
keep MongoDB running. Copy data through an authenticated private channel, compare
file hashes and database fingerprints, validators and indexes, and retain the
source until verification succeeds. Do not overwrite a nonempty destination.

Transfer the approved CMS revision as files while preserving installation-owned
configuration and content. Rebuild app/executor images, apply and verify only the
new versioned migrations, then recreate the HTTP application and executor. Never
replace an applied baseline or use `docker compose down -v` for an upgrade.

```sh
docker compose stop cloudflare app
install -d -m 0700 -o 1000 -g 1000 dumps/production/.coordination
node scripts/prepare-compose.mjs
chown -R 1000:1000 .secrets/resources
docker compose build app cloudflare
node scripts/release-consistency.mjs --image "cms-zarya-app:$(node -p "require('./package.json').version")"
node scripts/release-consistency.mjs --image "cms-zarya-cloudflare:$(node -p "require('./package.json').version")"
docker compose run --rm --no-deps app node dist/migrate.js
docker compose run --rm --no-deps app node dist/migrate.js --verify
docker compose --profile cloudflare up -d --wait app proxy cloudflare
```

The source commands use the pinned Node.js toolchain. Substitute your configured
image names when they differ from the defaults above. The preparation command preserves existing quotas and derives image tags from
root package metadata. Set `ZARYA_INSTALLATION_CPU_BUDGET` explicitly to the
installation's logical CPU capacity, and reserve infrastructure capacity through
`ZARYA_INFRASTRUCTURE_CPU_RESERVE`. For the first production preparation in a
Node-only container, pass the explicit CPU budget; that container has no Docker
CLI for discovery. Verify both built image versions against the prepared release
before migrations; with a host Node.js toolchain use
`node scripts/release-consistency.mjs --image IMAGE:X.Y.Z` for each configured
app/executor image. Preserve `.secrets/resources` and its Compose override across
updates and backups. The restricted helper is a separate local service; only it
mounts the Docker socket. See the [process rules](../../../README.md#site-processes-cpu-budgets-and-dumps).

Production Compose explicitly selects `ZARYA_DATABASE_PLACEMENT=ManagedLocal`.
For a separately managed local database, select `UnmanagedLocal` and set
`ZARYA_CMS_CPU_BUDGET`; for a database on another machine select `Remote`.
Those variants require deployment overrides for the MongoDB URI and service
dependencies; do not start or mount the managed database resource helper for them.
The application does not infer placement from the URI. Remote database CPU is
not deducted from the application machine. `ZARYA_MONGO_MAX_POOL_SIZE` configures
each ordinary process pool (default 5), separately from process counts; capture
retains its two-connection pool. No RAM/connection estimate caps site workers.
Container resource limits remain deployment settings. See
[ADR 0083](../../adr/0083-fork-supervision-and-database-placement.md).

MongoDB major upgrades require the separate
[supported upgrade procedure](../../arch/mongodb-9-upgrade.md), a verified
independent backup and an explicit maintenance window. Updating application
source is not authorization to replace an existing database image blindly.

Restore matching database and filesystem backups together while the executor is
stopped. The CMS also guards site restoration against running or unresolved
external delivery through the shared private dumps/production/.coordination
directory. The executor mounts only that subdirectory writable while archives
remain read-only. Reconcile unknown provider outcomes before restoration; do not
remove coordination files to bypass the guard. Verify the selected publication
and deployed Worker against the current delivery contract.
Retain provider deployment history separately from CMS data backups.
See [troubleshooting](troubleshooting.md).

## Verified source artifacts

Use the versioned source archive and its detached SHA-256 instead of an
unidentified directory copy. Verify the archive checksum and extracted file
inventory in an empty staging directory before transferring code into the
installation. See [artifact commands and provenance](../../arch/release-artifacts.md).
Retain .env and all site-owned data. Rebuild both images for the selected current
release and apply/verify pending migrations without rewriting existing receipts.
Select the CMS version in the admin header to inspect the packaged commit and payload checksum.

## Installation backup and restore

Run these Linux commands as root from the installation directory with Docker access.
Stop the executor, wait for its upload to finish and reconcile any uncertain
provider outcome. Stop the HTTP application; keep MongoDB running. The following
backup includes drafts, publication artifacts, private settings, media, dumps and
installed add-on packages/secrets under `dumps/production/.installed-addons`:

```sh
set -eu
umask 077
backup_dir="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
docker compose stop cloudflare app proxy
docker compose exec -T mongo sh -c 'exec mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db "$MONGO_APP_DATABASE" --archive --gzip' > "$backup_dir/database.archive.gz"
tar -czpf "$backup_dir/installation.tar.gz" .env .secrets cloudflare.json .cloudflare data sites artifacts/production dumps/production
docker run --rm -v cms-zarya_caddy-data:/data:ro -v "$PWD/$backup_dir:/backup" node:26.7.0-bookworm-slim tar -czpf /backup/caddy.tar.gz -C /data .
(cd "$backup_dir" && sha256sum database.archive.gz installation.tar.gz caddy.tar.gz > SHA256SUMS)
```

The Caddy volume name assumes the supplied Compose project name `cms-zarya`;
inspect `docker volume ls` if an installation overrides it. Back up its persisted
ACME account/certificates privately. Verify command exit codes and copy the backup
to protected storage on another machine. Restart app/executor only after the
snapshot succeeds; retain the corresponding CMS revision/images.

Restore into a separate, empty installation directory using the matching CMS
revision. Verify `sha256sum -c SHA256SUMS` in the backup directory, then extract
`installation.tar.gz` there with `tar -xzpf /absolute/backup/installation.tar.gz`.
Do not extract over an existing installation. Its restored `.env` selects the
production Compose file. Set a new, unused `COMPOSE_PROJECT_NAME` in that `.env`
and export the same value in the shell; check existing projects and volumes first.
This prevents accidentally reusing the original installation's named volumes.
Restore Caddy into that project's new volume before starting the proxy:

```sh
docker volume create "${COMPOSE_PROJECT_NAME}_caddy-data"
docker run --rm -v "${COMPOSE_PROJECT_NAME}_caddy-data:/data" -v /absolute/backup:/backup:ro node:26.7.0-bookworm-slim tar -xzpf /backup/caddy.tar.gz -C /data
```

Start MongoDB with the new project's empty database volume and allow its
initialization to finish, then restore BSON:

```sh
docker compose up -d --wait mongo
docker compose exec -T mongo sh -c 'exec mongorestore --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' < /absolute/backup/database.archive.gz
docker compose build app cloudflare
docker compose run --rm --no-deps app node dist/migrate.js --verify
```

The dump excludes global admin database users; the new MongoDB initialization
recreates the application account from the restored settings. Keep HTTP writers
and the executor stopped until database/file verification succeeds. Start the app
and proxy first, verify administration and the active publication, then reconcile
the provider state before starting the executor. A CMS backup does not restore or
roll back Cloudflare's public deployment.
