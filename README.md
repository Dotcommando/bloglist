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
