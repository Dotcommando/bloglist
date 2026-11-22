# Cloudflare deployment integration

See [ADR 0045](../adr/0045-cloudflare-site-deployment.md). This integration prepares
Cloudflare Workers Static Assets plus a gateway to a standalone Node.js backend
and MongoDB. It does not run the CMS or MongoDB inside Workers.

## One-time configuration

Run npm ci in the site installation after transferring this CMS version. Copy
cloudflare.example.json to the private cloudflare.json and set:

| Field | Meaning |
| --- | --- |
| siteId | Existing published site, selected once for this installation's export |
| workerName | Stable Cloudflare Worker name |
| publicOrigin | Browser-facing origin, matching the site's selected serving address |
| backendOrigin | Separate reachable origin for the existing Node.js HTTP application |

Run preparation on the backend host or another runner with access to that
installation's configured database, publication artifacts and media storage.
Database connectivity alone does not provide the filesystem artifacts.

Both origins require HTTPS outside localhost. No path, query or URL credentials
are accepted. Equal origins reject to prevent a proxy loop. The backend must use
the public origin as ZARYA_ADMIN_AUTH_ORIGIN when administration is enabled.
The backend's local TCP/HTTP bind address remains independent of that public origin.

One backend can serve several sites. Administration retains its existing single
canonical origin: when other site domains share this backend, use that canonical
administration address instead of changing its configuration for each Worker.

Configure the same random ZARYA_EDGE_PROXY_SECRET in the backend and deployment
process environments. No secret is stored in cloudflare.json or public/.
Wrangler uses normal login or private CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN.
The deployment command uploads the shared secret additively through Wrangler's
secrets-file option and removes the temporary JSON file even when upload fails.
An interrupted process can leave a secret file outside public/; remove it after
checking no deployment is running. Never upload the entire deploy/ directory as assets.

## Commands and generated files

| Command | Effect |
| --- | --- |
| npm run cdn:prepare | Build server tooling, select the active publication and prepare local output only |
| npm run deploy:cloudflare -- --dry-run | Prepare, then run Wrangler's local build/check without upload |
| npm run deploy:cloudflare | Prepare and update the same Worker/domain with its code, Assets and edge secret |

The commands read local trusted operator/database/storage settings from .env.
Use the normal migration procedure first. A minimal AppModule export composition
does not start listeners, add-on runtimes or hook dispatch. It performs no content
or business writes and closes its database pool before upload.

```text
deploy/
  public/                    fixed Assets directory
  worker.mjs                 generated gateway entry
  runtime.mjs                compiled edge-only runtime
  routing.json               public routes, CSP and backend origin; bundled into Worker
  wrangler.json              generated, stable Worker identity and ./public setting
  .zarya-deployment.json      local ownership/recovery metadata; never an asset
```

public/ is rebuilt completely rather than overlaid, so removed documents do not
survive as stale files. A sibling .deploy.lock prevents preparation/upload races.
Only directories carrying the matching site ownership marker can be replaced.
Preparation stages in .deploy.preparing and keeps at most one .deploy.previous
recovery directory. A subsequent preparation restores a missing current directory
from that buffer, or removes an obsolete buffer under the same lock.

Do not edit generated Worker/configuration files. Edit cloudflare.json, publish
content through the CMS and rerun the command. No release ID is an operator input.

## Rendering, assets and proxy behavior

The operation reads the active pointer once and exports that captured publication.
It verifies public artifact metadata and contents, exports only named public media
outputs, and rejects a changed/pending media catalog. Original private bytes,
Request plans, diagnostic maps and the internal manifest are never public assets.

Static HTML has precomputed per-page CSP matching its inline CSS. The Worker runs
for document routes to apply those headers; it still fetches ready HTML from
Cloudflare Assets, without reaching MongoDB or rerunning Snippets. Compiled
styles/scripts retain content hashes and long-lived asset caching. Named media
is mutable and does not receive that immutable policy.

A single generated relative 200 rule maps /assets/releases/:release/* to the
same deployment's /assets/* files. This replaces accumulated release aliases;
it does not fetch documents from older deployments. Document redirects are
compiled into the Worker route table, not accumulated _redirects rows.

Request paths and /api or /admin go to backendOrigin. Queries, bodies, cookies,
Origin, X-Zarya-Admin, X-Zarya-Request, redirect status and Set-Cookie are preserved.
X-Zarya-Admin and X-Zarya-Request are browser CSRF markers for administrative and
public mutations respectively. They are not trusted service headers: the gateway
preserves their supplied values and never adds them to requests that omit them.
The owning backend boundary still validates the Origin and required marker.
`npm run test:gateway` checks this translation in both the source and bundled
Worker, including absent/invalid markers and spoofed service metadata. Gateway CI
runs for affected pull requests and master changes; the release workflow requires
these checks before packaging or publishing a CMS version.
The gateway overwrites
caller-supplied service headers and removes forwarded-host metadata. The backend
restores Host only after validating x-zarya-public-host and x-zarya-proxy-secret,
rejecting missing, duplicate, malformed or incorrect service credentials with 403.
Ordinary direct requests retain their existing hostname checks. Unknown domains
are still rejected by site resolution; this is not a source of administrator authority.

Request rendering uses current published backend content and performs Request
reads for every origin document request. Build values and compiled CSS/JS are
reused. The gateway enforces no-store for Request/API/admin responses. These
requests also bypass Cloudflare's upstream fetch cache using Request.cache=no-store.
This prevents an intermediate cache from substituting an earlier backend response.
API business data, such as event availability, remains current independently of static deployments.
Static content and backend content may update at different times; this integration
does not promise a globally pinned browsing session or a distributed atomic switch.

Asset misses can be fetched from the backend. This includes public media uploaded
after the last static export and resources used by an already open old document.
Public media larger than Cloudflare's 25 MiB per-file limit is explicitly listed
in the result's originFiles and stays origin-served; the command reports its count.
Oversized non-media artifacts fail instead. Wrangler enforces the account's other
provider limits; the integration does not silently truncate the site.

## Failures and verification

No active publication: publish the site first; saving a draft is insufficient.
Origin mismatch: select the intended public serving address in CMS settings and
make publicOrigin/admin authentication origin match it. A busy deployment fails
explicitly; after a crash, check that no command is running before removing
.deploy.lock. Unowned output directories are not deleted or overwritten.

A missing Worker proxy secret returns 503 for origin-dependent requests. A wrong
secret returns 403 from the backend. Backend network failure returns sanitized
503, while ready static files remain independent of backend availability.
Preparation success is not Cloudflare deployment success. A nonzero Wrangler
exit does not acknowledge deployment; inspect Cloudflare after an uncertain upload.

Focused fake-port, filesystem, configuration, Worker and proxy tests cover the
boundary. The isolated MongoDB/HTTP integration creates a synthetic site, publishes
Static and Request pages, uploads a public file, exports through real AppModule
composition and verifies fresh Request reads over an authenticated ephemeral origin.
Cloudflare upload and real-domain testing remain separate explicit operations.

Primary provider references: [Static Assets](https://developers.cloudflare.com/workers/static-assets/),
[routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/),
[relative proxy rules](https://developers.cloudflare.com/workers/static-assets/redirects/),
[platform limits](https://developers.cloudflare.com/workers/platform/limits/).
