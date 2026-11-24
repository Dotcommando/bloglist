# Bloglist trial site

[Bloglist trial installation and runtime release](docs/bloglist-trial-catalog.md)

[Русская версия](README.ru.md)

This checkout runs the local Bloglist site on CMS Zarya. The site consumes the
published Bloglist add-on through the CMS runtime registry. The CMS source and
the add-on source live in separate repositories under
[ADR 0037](docs/adr/0037-clean-cms-and-site-installations.md).

The core provides sites, pages, independent URLs, editable templates/chunks/
Snippets, media, draft previews, immutable publication releases, public delivery,
administrator accounts/authentication and generic site add-on connections.
Local site data and installed runtime files are managed by the CMS. The versioned
extension SDK remains in `packages/addon-contracts`.

The server cms object API is available to trusted Snippets and add-ons.
Developer guides: [English](docs/guide/en/README.md) and [Русский](docs/guide/ru/README.md).
See the [implementation contract](docs/arch/system-object-api.md) for composition,
scope, versions and execution effects.

The independent site project is katerina-bloom. It owns the previous local site,
its event-booking installation, source backups, media, artifacts and private
settings. Develop the add-on itself in zarya-addon-events. Neither project
is a runtime dependency or source import of this CMS checkout.

[Release history](CHANGELOG.md).

## Local development

Use Node.js 26.7.0 and npm 11.19.0. Dependencies are pinned exactly and the
workspace lockfile is committed. Copy .env.example to the private .env and set
the intended database, storage roots and trusted local operator explicitly.

```sh
npm ci
node scripts/prepare-compose.mjs
docker compose up -d --wait mongo
npm run build
npm run migrate
npm run migrate:verify
```

The clean example uses MongoDB on 127.0.0.1:27040, database zarya_clean_local and
HTTP on localhost:3001. The site installation keeps its existing 27039/3000
endpoints. Never point the clean baseline at the site's database. The pre-release
schema is consolidated in migrations/0000-schema-migrations.json, with the final
validators and all accumulated indexes. It initializes a fresh database; databases
with the former migration receipts need a separately authorized transition.
See [ADR 0039](docs/adr/0039-pre-release-schema-baseline.md).

Create an administrator from an interactive Git Bash/Bash terminal:

```sh
bash scripts/create-admin.sh
```

The script prompts for an email and a hidden password once. Credentials are not
command arguments or environment values. There are no shipped accounts or
passwords. See [administrator contracts](docs/arch/administration-users.md) and
[authentication](docs/arch/admin-authentication.md).

For a Docker server installation, run the wrapper from the installation directory
in an interactive terminal after building the app image, starting MongoDB and
applying migrations:

```sh
./create-admin
```

The wrapper runs the same interactive script inside the app container. See the
[installation guide](docs/installation/en/INSTALLATION.md) for the server setup.

Run the HTTP application from the IDE using npm run start:http after building.
Its built administration is at http://localhost:3001/admin/. npm start opens the
trusted local application context without an HTTP listener. For frontend
development, npm run dev:admin serves the admin on localhost:5173 and proxies
administrative requests to the configured backend.

Run one HTTP application instance per installation. Before starting it from the
IDE or PowerShell, stop a Docker-hosted app with `docker compose stop app` and
leave MongoDB running. Native and Docker application instances must not share
the same installation concurrently: both use its HTTP port and coordination files.

The final build message reports the whole server/runtime/admin pipeline, in
addition to Vite's admin-only duration. HTTP readiness reports elapsed time since
Node started (including imports and child startup), the actual TCP socket and
links to the administration and each site's administration workspace. The socket
is not a home-page link. Selected Local HTTP loopback origins are read from the
database and opened by the coordinator, alongside the primary listener. Database
or local port binding failure cancels startup. The site list marks local listeners
as ready and other origins as requiring external routing; administration links
remain available. Adding a site or changing its local port requires a restart.
Public/HTTPS origins require a proxy/TLS setup. A listening site still returns 404
for unpublished paths, including a missing home page. See [ADR 0090](docs/adr/0090-local-site-http-listeners.md).

New site content and optional business integrations should be developed in a
separate site project. Do not seed sample content or install business packages
in this checkout. A site can be created normally through the administration
of a site installation. Document delivery does not require an add-on.

## Site processes, CPU budgets and dumps

`npm run start:http` starts one CMS coordinator and a separate serving pool for
each site through `child_process.fork`, without PM2 or Node.js cluster. Requests are routed by the registered serving authority;
a site never borrows another site's workers. The coordinator directly owns all serving and dump children, administrative
control and the single hook worker. Resizing drains retiring workers and admits
replacements only after initialization. Settings / General shows all sites,
desired/running process counts, apply errors and the selected site's actual dump
behavior. CPU-time quotas, integer process counts and measured CPU usage are
different quantities; process allocation does not pin exclusive physical cores.

Publishing keeps the site available: the complete new release is built and
verified beside the current release, then one database pointer switches it into
service atomically. Serving processes keep running. Requests that select a release
after activation use the new version; requests already using the old version
finish with its HTML, plans and retained assets. A failed build leaves the current
release active. This applies to static and Request pages, including warm document
caches in multiple processes. See [publication and failure tests](docs/arch/fork-publication-and-failure-tests.md).

Set database placement explicitly with `ZARYA_DATABASE_PLACEMENT`:
`ManagedLocal` applies separate local MongoDB/CMS quotas; `UnmanagedLocal`
leaves local database control to its operator and requires `ZARYA_CMS_CPU_BUDGET`;
`Remote` uses the application machine's CPU budget without deducting remote DB
CPU. The MongoDB URI does not determine placement. Docker/OS enforces aggregate
quotas; the coordinator manages process counts. Coordinator, site and dump work
share the CMS budget without a whole CPU reserved for the coordinator.

For a managed local database, defaults are one CPU of database budget and one serving process per site, with
the remainder unallocated. Additional sites receive one process even above the
recommended count; a warning explains shared CPU, memory and connections.
The recommendation is the effective CMS CPU budget rounded upward, not a hard
process limit. No estimated memory cost or aggregate connection allowance caps
serving-process counts. Container memory limits and the per-process MongoDB pool
are separate settings. Settings / General / Resources changes the maximum pool
size per site process without a manual restart, including on one/two CPUs. It
shows saved and actually applied sizes separately; processes are replaced one
at a time after their replacements are ready. `ZARYA_MONGO_MAX_POOL_SIZE` defaults
to 5 and sets the initial site pool and the separate coordinator pool at startup.
The maximum applies per database server; driver monitoring connections are additional. See [live pool configuration](docs/adr/0084-live-site-database-pools.md). On one
CPU with a managed local database, the database and sites share it and allocation controls are disabled. With
one site and a managed local database on two CPUs, the fixed distribution is one CPU for MongoDB and one site
process; there is no editable allocation. Database-pool tuning remains available.
For the [measured small local-database profiles](docs/arch/database-pool-benchmark-2026-11-14.md),
start with a site pool of 2 for one/two CPUs; this is not an automatic CPU-based rule.

The site and installation dump routes follow the target site's process count:

| Target site / available capacity | Dump execution |
| --- | --- |
| Two or more serving processes | Drain and stop one process of that site, capture in a child, then restore the serving process. The remaining site processes keep serving. |
| One serving process | Capture in that process. The site can temporarily stall. No additional dump process is started. |

Capture admission and write draining are coordinated across processes. Sites request capture over IPC;
the coordinator starts and reaps its child before restoring borrowed capacity.
A requesting-worker crash cancels capture and reconciles its maintenance lease
before writes resume. Separate capture does not remove database/disk contention. Restoration retains its global
maintenance gate. A failed replacement is shown as degraded capacity; after an
uncertain response, refresh the existing dump list before repeating creation.

Live graphs have a separate **Settings / Logical CPU usage** tab. Authenticated
sampling starts on login and continues across sections. Each logical CPU has its own one-second graph. Only the browser keeps
the latest 300 points; the server has no metric history, replay or metric logs.
Collection stops after the last administrator disconnects. Missing samples are
shown as gaps. These are host/VM counters, including other workloads, rather than
per-site attribution or a physical-core map. Times use the selected site's IANA
time zone.

Resource settings distinguish the shared CPU quota, entered values, saved process
allocation and currently running processes. Exceeding the CPU recommendation is
allowed with a warning. No derived memory/connection maximum blocks saving
positive integer counts. Actual startup failures remain visible. Save results and failures appear beside the Save action.

Managed production Compose uses a restricted local resource helper to apply and
verify MongoDB/CMS CPU quotas. Only that helper mounts the Docker socket; serving
processes use an authenticated private Unix socket. Desired quotas are written
to `.secrets/resources/compose.json`, included in `COMPOSE_FILE`, so container
recreation preserves them. Unmanaged/native deployments show quota control as
unavailable. Keep the helper socket/key private.
The helper is a separate Node.js deployment-control service. The CMS supervisor
owns serving processes, dump coordination and OS CPU sampling.
Before Compose builds, run `node scripts/prepare-compose.mjs`; it derives `ZARYA_CMS_VERSION` from
`package.json` and preserves existing credentials and resource limits.
`node scripts/release-consistency.mjs --image IMAGE:0.15.0` checks the tag against
the version actually built into an image. Use the same check for the executor.

Both Compose definitions pin MongoDB 9.0.8 to the same immutable digest. Read the
[fork architecture](docs/adr/0083-fork-supervision-and-database-placement.md),
[resource contracts](docs/arch/0.14.0-site-process-allocation.md) and
[MongoDB upgrade guidance](docs/arch/mongodb-9-upgrade.md) before changing an
existing installation. This does not authorize an automatic database upgrade.

## Resource calibration

Open Settings / Calibration to manage traffic profiles and measure resource
configurations while sites stay live. Profiles show all sites, initially sharing
100% of requests equally between their home pages. Add URL/path/numeric-page-ID
rows and shares within each site to change the mix.
Shares accept hundredths, retain blank values as zero and cannot total over
100%. Smaller positive totals are normalized proportionally when run.

Calibration requires managed Docker quotas. Every reference and candidate splits
the declared total CPU budget between the database and CMS; fractional database
CPU, pool sizes and every site's process count are searched together. Actual
quotas are checked before traffic starts. Native runs without CPU control are
unavailable; legacy fixed-resource measurements are labelled in history. Search ranges, timing and
latency limits are editable; p95 <= 600 ms is the default criterion. Original
settings are restored after measurement. Settings / Main retains the last ten
runs with explicit Apply; finishing a run never applies a recommendation by
itself. See [calibration scope, measurement and recovery](docs/arch/resource-calibration.md).

## Installation and automatic delivery

Follow the [installation guide](INSTALLATION.md) for the Docker production stack,
private configuration, MongoDB, domains/TLS, upgrades and recovery. Configure a
site's target in **Settings / Deployment**, then start the separate executor.
Committed publications, including routing-only changes, request delivery
automatically. Draft saves do not. The administration shows the active CMS
publication and confirmed external delivery separately, with diagnostics and retry.
Provider credentials belong to the executor's private environment.

See [Cloudflare setup](docs/installation/en/cloudflare.md) and
[deployment contracts](docs/arch/deployment-contracts.md) and
[Markdown/JSON-LD publication](docs/arch/markdown-and-json-ld.md).

## Manual Cloudflare delivery

For manual maintenance, stop the automatic executor and finish/reconcile any
in-flight upload before using these commands. Cloudflare stores static files;
a separate Node.js backend and MongoDB serve
the API, administration and Request pages. Run these commands in a site
installation with access to its database, publication artifacts and media.
The clean CMS distribution contains no published site. Start the backend with
`npm run start:http` and its MongoDB settings in `.env`.

1. Copy `cloudflare.example.json` to `cloudflare.json`. Set the site's `siteId`
   from its administration URL, a stable `workerName`, its HTTPS `publicOrigin`
   and a separate reachable HTTPS `backendOrigin`. The localhost examples are
   for local checks. Select the same public address in site settings and set
   `ZARYA_ADMIN_AUTH_ORIGIN` on the backend to the initial administrative origin.
   The CMS stores it in the database; later change the administration address
   through Installation settings in the global admin header. Keep backendOrigin
   as the Worker-to-server address. See the [domain guide](docs/installation/en/tls.md).
2. Set the same random `ZARYA_EDGE_PROXY_SECRET` in the deployment environment
   and backend `.env`. The command uploads it as a Worker secret. Authenticate
   Wrangler with `npm exec -- wrangler login`, or set `CLOUDFLARE_ACCOUNT_ID`
   and `CLOUDFLARE_API_TOKEN` in a private environment.
3. Publish the site in CMS. Prepare and check the output without uploading:

   ```sh
   npm run cdn:prepare
   npm run deploy:cloudflare -- --dry-run
   ```

4. For the first deployment and subsequent updates, run:

   ```sh
   npm run deploy:cloudflare
   ```

The static directory is always **`deploy/public/`**. Worker configuration and
routes are generated in `deploy/`; no internal release number is required.
Export does not publish drafts or start the CMS server. Static HTML/CSS/JS and
public media go to Cloudflare; Request pages and API calls go to the backend
without caching their responses. Public files over 25 MiB remain on the backend;
the command reports them.

After content changes, publish in CMS and repeat the deployment command. Changes
to live API data do not require a static deployment. Preparation and `--dry-run`
do not deploy anything. See [Cloudflare integration](docs/arch/cloudflare-deployment.md)
for details, failure handling and limits.

## Verification

Start with [CMS development](docs/cms-development/README.md) and its feature lifecycle.
It routes to design, testing, security and existing-feature review standards.
The [testing policy](docs/cms-development/testing-policy.md) owns check selection,
commands, isolated dependency requirements and evidence. Relevant integration
checks must pass before a feature is complete. Application operating restrictions
are in [AGENTS.md](AGENTS.md#application-operating-scope).

See [add-on contracts](docs/arch/site-addons-contracts.md),
[rendering/publication](docs/arch/rendering-and-publication.md),
[HTTP delivery](docs/arch/public-delivery-and-page-restore-contracts.md),
[frontend contracts](docs/arch/admin-frontend.md) and [repository rules](AGENTS.md).
Scenarios and older ADRs preserve design history, including optional integrations
that are not installed in the clean distribution.

The accepted system object API scope and bilingual developer documentation
requirements are recorded in [ADR 0044](docs/adr/0044-system-object-api-and-bilingual-guide.md).
Build/Request snippets use the implemented scoped system object API; commands
can have real effects in preview. See the [current API guide](docs/guide/en/README.md).
Cloudflare preparation follows [ADR 0045](docs/adr/0045-cloudflare-site-deployment.md).

Publication artifacts use artifacts/sites/<primaryDomain>/<releaseId>/.
Only the release public/ subtree is publicly served; manifests and Request plans
remain private. See [publication contracts](docs/arch/rendering-and-publication.md).

## Add-ons from GitHub

On a site's Add-ons page, enter a public GitHub repository URL and click Install.
CMS downloads addon.runtime.gz from its latest stable release, verifies the
package and activates it without restarting. It appears in the shared catalogue;
enable it separately for each site.

Consult the [add-on development guide](docs/addon-development/README.md) to build and
release an add-on. For accepted formats and installation behavior, see the
[repository installation contract](docs/arch/site-addons-contracts.md#repository-release-installation).
