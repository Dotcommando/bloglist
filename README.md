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
