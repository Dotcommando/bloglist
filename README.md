# Bloglist

Minimal NestJS starter. `GET /` returns `Hello World!`.

Requires Node.js 26.7.0 and npm 11.19.0.

```sh
npm ci
npm run start:dev
```

The application listens on port 3000 by default. Set `PORT` to override it.

```sh
npm run format
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
```

After building, run `npm run start:prod`.

The five site use cases are available through the `CREATE_SITE`, `UPDATE_SITE`,
`ARCHIVE_SITE`, `GET_SITE` and `LIST_SITES` tokens. To enable them, supply an
`ISiteRepository` provider when composing the application:

```ts
import { AppModule } from './src/infra/app.module.js';
import { SITE_REPOSITORY } from './src/infra/sites/sites.tokens.js';

// repository is the caller-supplied ISiteRepository implementation.
const rootModule = AppModule.registerSites({
  repository: { provide: SITE_REPOSITORY, useValue: repository },
});
```

Pass `rootModule` to `NestFactory.create`. Repository factory/class providers
may use dependencies from modules passed in the optional `imports` array.
The current `main.ts` starts plain `AppModule`; it does not bind site persistence.
See [domain contracts](docs/arch/domain-contracts.md#implemented-site-operations)
for behavior and repository obligations.

Routing provides `ASSIGN_INITIAL_PAGE_URL`, `CHANGE_PAGE_URL`, `FIND_URL_BY_PATH`
and `GET_URL_HISTORY`. Enable it with explicit URL repository and page lookup
providers, independently or together with sites:

```ts
import { AppModule } from './src/infra/app.module.js';
import { PAGE_LOOKUP_PORT, URL_REPOSITORY } from './src/infra/routing/routing.tokens.js';
import { SITE_REPOSITORY } from './src/infra/sites/sites.tokens.js';

// All three implementations are supplied by the caller.
const rootModule = AppModule.register({
  sites: { repository: { provide: SITE_REPOSITORY, useValue: siteRepository } },
  routing: {
    repository: { provide: URL_REPOSITORY, useValue: urlRepository },
    pageLookup: { provide: PAGE_LOOKUP_PORT, useValue: pageLookup },
  },
});
```

`AppModule.registerRouting(options)` enables only routing. URL history requires
`{ siteId, urlId }` and checks the owning URL before reading its snapshots.
Address changes use the atomic repository operation; transactional persistence
and page lookup adapters remain to be supplied. See
[routing contracts](docs/arch/domain-contracts.md#implemented-routing-operations).

Pages provides `CREATE_PAGE`, `UPDATE_PAGE`, `ASSIGN_PAGE_TO_CLUSTER`,
`PUBLISH_PAGE`, `ARCHIVE_PAGE`, `GET_PAGE` and `LIST_PAGES`.
Register its repository and site/cluster lookups explicitly:

```ts
import { AppModule } from './src/infra/app.module.js';
import { CLUSTER_LOOKUP_PORT, PAGE_REPOSITORY, SITE_LOOKUP_PORT } from './src/infra/pages/pages.tokens.js';

const rootModule = AppModule.registerPages({
  repository: { provide: PAGE_REPOSITORY, useValue: pageRepository },
  siteLookup: { provide: SITE_LOOKUP_PORT, useValue: siteLookup },
  clusterLookup: { provide: CLUSTER_LOOKUP_PORT, useValue: clusterLookup },
});
```

The same options may be passed under `pages` in `AppModule.register` alongside
sites and routing. Single-page operations require `siteId` and `pageId`.
List accepts `siteId` and optional cluster/language/type/status filters and
returns all matching pages. See
[page contracts](docs/arch/domain-contracts.md#implemented-page-operations).

Clusters provides `CREATE_CLUSTER`, `UPDATE_CLUSTER`, `GET_CLUSTER`,
`LIST_CLUSTERS`, `ARCHIVE_CLUSTER`, `ADD_BLOG_TO_CLUSTER`,
`UPDATE_CLUSTER_BLOG_PLACEMENT`, `REMOVE_BLOG_FROM_CLUSTER`,
`MOVE_CLUSTER` and `REORDER_CLUSTER_BLOGS`.
Repositories and lookups are explicit providers:

```ts
import { AppModule } from './src/infra/app.module.js';
import {
  BLOG_LOOKUP_PORT, CLUSTER_BLOG_REPOSITORY, CLUSTER_REPOSITORY, SITE_LOOKUP_PORT,
} from './src/infra/clusters/clusters.tokens.js';

const rootModule = AppModule.registerClusters({
  repository: { provide: CLUSTER_REPOSITORY, useValue: clusterRepository },
  siteLookup: { provide: SITE_LOOKUP_PORT, useValue: siteLookup },
  placementRepository: { provide: CLUSTER_BLOG_REPOSITORY, useValue: placementRepository },
  blogLookup: { provide: BLOG_LOOKUP_PORT, useValue: blogLookup },
});
```

The same options may be passed under `clusters` in combined registration.
Single-cluster and placement operations require `siteId` and `clusterId`;
placement operations also require `blogId`. List supports language, status and
parentClusterId filters. Repeated removal of an absent placement fails.
Move requires the repository's atomic `move` implementation. Reorder accepts
a partial list of existing blogs and updates it through atomic `updatePositions`.
See
[cluster contracts](docs/arch/domain-contracts.md#implemented-cluster-operations).
