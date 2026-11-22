# Local application context and persistence

> Historical implementation scope. This document records an early development
> boundary, including optional business capabilities. For current operation use
> the [developer guide](../guide/en/README.md) and maintained capability contracts.
> It does not authorize installing business code in the clean CMS distribution.

The application implements the initial five operations under
[ADR 0005](../adr/0005-initial-local-application-boundary.md), followed by UpdatePage,
AssignInitialPageUrl, FindUrlByPath, ChangePageUrl and GetUrlHistory under
[ADR 0006](../adr/0006-working-routing-and-page-editing.md).
ConfigurePageRendering, PreviewPage, PublishPage, PublishSiteRelease and
ResolvePublishedPath follow [ADR 0007](../adr/0007-simple-page-publication-and-releases.md).
See [rendering invocation and storage](rendering-and-publication.md).
RenderPublishedPage, GetPublishedArtifact, ListSites, ListPages and
RestorePageVersion follow [ADR 0008](../adr/0008-public-delivery-and-page-restoration.md).
Public document GET/HEAD has its own application entry; see
[delivery and restoration](public-delivery-and-page-restore-contracts.md).
This is local operation with explicit operator authority; it exposes no HTTP
administration, public documents or admin frontend.

## Configuration and execution

Use Node.js 26.7.0, npm 11.19.0 and the committed lockfile. Copy `.env.example` to
an ignored `.env`. Each required setting is explicit:

| Setting | Purpose |
| --- | --- |
| ZARYA_MONGO_URI | Selected MongoDB server/replica set; no implicit fallback |
| ZARYA_MONGO_DATABASE | Explicit application database |
| ZARYA_LOCAL_OPERATOR_ID | Trusted local operator identity, supplied by composition |
| ZARYA_LOCAL_ADMINISTRATOR | Must be exactly true for this privileged local entry point |
| ZARYA_TEST_MONGO_URI | Explicit integration-test server; tests choose their own random database |
| ZARYA_SITES_ROOT | Trusted site source root; default sites/ |
| ZARYA_ARTIFACTS_ROOT | Private release artifact root; default artifacts/ |
| ZARYA_TEST_BROWSER_EXECUTABLE | Installed Chromium executable for real browser integration checks |

Configuration is validated and frozen at bootstrap. Database and operator values
are never read from application inputs. Pools are bounded to five connections per
application context; server selection times out after five seconds. Writes request
majority acknowledgement. These are local persistence settings, not API limits.

From the repository root:

```text
npm ci
docker compose up -d --wait mongo
npm run build
npm run migrate
npm run migrate:verify
npm start
```

Compose pins MongoDB 8.0.29 by digest and initializes the zarya-rs replica set.
MongoDB exposes only localhost port 27039. The optional application service also
maps localhost port 3000 when its public HTTP command is selected. The local single-node service has no database
credentials; it is a development dependency. The application context has no HTTP
listener. SIGINT/SIGTERM and explicit context.close() close its connection pool.

For a fully containerized application context:

```text
docker compose build app
docker compose run --rm app node dist/migrate.js
docker compose --profile application up -d app
docker compose logs app
```

The application image pins Node.js/npm, uses npm ci in both stages and runs as
the node user with production dependencies only. The app service is opt-in;
starting MongoDB alone does not start the privileged local application context.
No images/files are copied to a sibling project by this implementation.

## Programmatic use

The local entry point initializes the context; it does not invent a CLI language
for business operations. An authorized local caller can invoke the exported
inbound tokens through the same composition:

```javascript
import { createLocalApplication } from './dist/infra/local-application.js';
import { readLocalSettings } from './dist/infra/local-application.settings.js';
import { CREATE_SITE } from './dist/infra/sites/sites.tokens.js';

const context = await createLocalApplication(readLocalSettings(process.env));
try {
  const operation = context.get(CREATE_SITE);
  const site = await operation.execute({
    mark: 'Example',
    name: 'Example site',
    primaryDomain: 'example.test',
    languages: ['en'],
    defaultLanguage: 'en',
  });
  console.info(site.siteId);
} finally {
  await context.close();
}
```

Load the caller's explicit environment before running this example. TypeScript
callers use the corresponding inbound interface as context.get's generic type.
Domain entities are local results; future REST adapters must map them to deliberate
public DTOs. A future network application must supply its own authenticated access
integration, not call this privileged bootstrap for arbitrary incoming users.

CreateSite/GetSite/CreatePage/GetPage call their approved capability access ports.
ResolveSite is an internal domain-mapping query and returns only ACTIVE sites.
GetSite can read archived records, and an administrator may create/read draft pages
in an archived site. None of these operations activates or publishes content.

Required references fail explicitly; optional reads return null when absent.
Page ownership failures use PageScopeError. Existing page conflict/not-found types,
domain validation failures and shared BusinessError categories are preserved;
wire status codes are deferred with REST. Dependency failures are not converted
to null, retried blindly or described as rolled back after an uncertain write.

## Persistence ownership and migrations

Sites and pages have complete, separate Mongoose repositories. Both map their
opaque string identity to MongoDB _id and keep BSON/Mongoose objects out of app
and ports. Queries/updates copy allowed fields explicitly. Global case-insensitive
mark uniqueness is enforced separately for each collection through a normalized
markKey; normalized primaryDomain is unique across sites. Page lists include an
explicit site filter. The inherited cluster query remains an internal repository
operation and does not install or authorize a cluster module.

The pages capability obtains site references through ISiteLookupPort, implemented
by calling the IGetSite inbound operation. It never reads the sites repository
or collection. Both repositories preserve immutable identifiers/marks/createdAt;
page site/language are immutable as well. Updates receive persistence-owned
updatedAt. These inherited save contracts do not provide optimistic concurrency
versions; commands requiring that guarantee need a separately agreed contract.

The globally scoped schema_migrations collection stores only migration identity,
checksum and application instant. Each migration manifest explicitly defines
collection validators and required indexes. Git attributes preserve LF endings
for stable SHA-256 checksums across Windows/Linux. Never edit an applied migration;
introduce a new version. The owner-approved pre-release exception in
[ADR 0039](../adr/0039-pre-release-schema-baseline.md) consolidates the former chain
into `migrations/0000-schema-migrations.json` for fresh databases. Existing receipts
are not automatically converted. Startup verifies receipts, latest required validators,
indexes and existing document shapes without changing them.

After updating the code, build it with `npm run build` and run `npm run migrate`
before `npm run start:http`. `npm run migrate:verify` checks the configured database
without changing it. If a required migration is missing or its checksum differs,
HTTP startup and the migration command identify that migration and show the
migration command; unexpected error details remain private.

Run explicit migrations through one operator at a time. DDL is not presented as
a database transaction: a failed migration may leave unreceipted collection/index
changes. Resolve the cause and rerun the same checksum-verified migration. A receipt
is written only after verification. Known schema drift is rejected rather than
silently repaired during ordinary startup.

## Verification

### Working routing

The schema baseline defines site-owned urls, url_history and routing_versions
collections. Routing writes require a replica set or sharded MongoDB with sessions;
bootstrap checks this explicitly. All routing writes acquire the site's version
guard inside the transaction before relationship/state checks. Domain/application
code never sees MongoDB sessions or the internal guard revision.

ChangePageUrl accepts moveSubtree=false by default. This changes the root address
and keeps descendants' old paths and parent IDs. With moveSubtree=true, the domain
policy rewrites the root prefix of every descendant path and remaps new parents
and internal redirect targets. New addresses use fresh IDs/marks; every old address
stays as a redirect with history. A conflict, stale node or newly added descendant
aborts the whole captured move. A descendant outside the root path prefix is an
explicit conflict, not a guessed destination. The result is the replacement root
Url. The future admin must expose both modes with parent-only selected by default.

The base repository also supports audited behavior saves and ordered history;
URL paths/marks/parent identity/creation instants remain immutable. A move changes
addresses by creating replacements, not by overwriting retained URL identity.
Distinct sites may use the same path, but marks remain globally case-insensitive
and each page has one current PAGE binding. Redirects do not participate in that
partial unique index. History is returned oldest first by instant/identity.

Known pre-commit failures roll back; a lost commit acknowledgement remains an
uncertain outcome and is propagated without a fresh transaction/business command.
The adapter never labels a commit-stage error as a proven uncommitted conflict.
The integration suite injects failure after partial in-transaction writes and
after a successful real commit to verify both outcomes separately.

### Test commands and boundaries

The final five declared operations, UpdateSite, ArchiveSite, ArchivePage,
RebindUrlToPage and RedirectUrl, are registered in AppModule with real persistence
adapters. Their language, archival, version/history and concurrency semantics
are specified in [site editing and URL behavior](site-editing-and-url-behavior.md).
They retain the trusted local boundary; their REST adapters are separate work.
Apply the schema baseline before running the application on a fresh database.

General test levels and proof requirements are maintained in
[testing policy](../cms-development/testing-policy.md). This historical boundary's
architecture checks cover inward imports, token leaves, optional business modules
and capability repository ownership.

Integration coverage invokes real AppModule composition against a random isolated
database. It covers entity persistence across contexts, exact domain lookup,
archived-site drafts, invalid language, cross-site reads, concurrent mark/domain
conflicts, rendering round trips, BSON validators, checksums and missing indexes.
Current execution/completion and cleanup rules follow testing-policy.md; the early
five-use-case integration cadence is superseded. Restricted Windows environments
may require TEMP, TMP and TMPDIR to point at a writable workspace .tmp/vitest directory.
