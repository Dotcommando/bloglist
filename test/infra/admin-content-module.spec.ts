import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import type {
  IAdminContentOperationFactory,
} from '../../src/adapters/inbound/rest/content/admin-content-operations.factory.js';
import type {
  IAdminPublicationOperationFactory,
} from '../../src/adapters/inbound/rest/publication/admin-publication-operations.factory.js';
import type {
  IAdminRenderingOperationFactory,
} from '../../src/adapters/inbound/rest/rendering/admin-rendering-operations.factory.js';
import type {
  IAdminRoutingOperationFactory,
} from '../../src/adapters/inbound/rest/routing/admin-routing-operations.factory.js';
import { createRoutingModels } from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import { AdminAuthContextService } from '../../src/app/services/admin-auth/admin-auth-context.service.js';
import { GetCurrentAdminUserUseCase } from '../../src/app/use-cases/admin-auth/get-current-admin-user.use-case.js';
import { LoginAdminUserUseCase } from '../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { GET_CURRENT_ADMIN_USER } from '../../src/infra/admin-auth/admin-auth.tokens.js';
import { ADMIN_USER_ACCESS, CREATE_ADMIN_USER_FROM_CONSOLE } from '../../src/infra/admin-users/admin-users.tokens.js';
import { ADMIN_CONTENT_OPERATIONS } from '../../src/infra/content/content.tokens.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { PAGE_REPOSITORY } from '../../src/infra/pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { PublicHttpModule } from '../../src/infra/public-http.module.js';
import { RELEASE_ACTIVATION } from '../../src/infra/publication/publication.tokens.js';
import { ADMIN_PUBLICATION_OPERATIONS } from '../../src/infra/publication/publication.tokens.js';
import { ELEMENT_BACKUP, ELEMENT_KEYS, ELEMENT_STORE } from '../../src/infra/rendering/rendering.tokens.js';
import { ADMIN_RENDERING_OPERATIONS } from '../../src/infra/rendering/rendering.tokens.js';
import { ADMIN_ROUTING_OPERATIONS } from '../../src/infra/routing/routing.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import { SITE_REPOSITORY } from '../../src/infra/sites/sites.tokens.js';
import { authFixture, loginInput } from '../support/admin-auth.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { FakePageRepository } from '../support/pages.js';
import { FakeReleaseActivation } from '../support/publication.js';
import { elementFixture, FakeElementStore } from '../support/rendering.js';
import { FakeSiteRepository, siteFixture } from '../support/sites.js';

describe('session-bound administration composition', () => {
  it('binds real use cases with overridden ports and no local-operator authority', async () => {
    const f = authFixture();
    const current = new GetCurrentAdminUserUseCase(f.work, new AdminAuthContextService(f.secrets), f.values);
    const logged = await new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values).execute(loginInput);
    const sites = new FakeSiteRepository();

    sites.records.set('site-1', siteFixture());
    const connection = createConnection();
    const urls = createRoutingModels(connection).urls;
    const query = urls.find();

    vi.spyOn(query, 'exec').mockResolvedValue([]);
    vi.spyOn(urls, 'find').mockReturnValue(query);
    const module = await Test.createTestingModule({
      imports: [PublicHttpModule.forHttp({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_content_http',
        host: '127.0.0.1',
        port: 0,
        artifactsRoot: 'artifacts',
        adminAuth: { origin: 'http://localhost:3000' },
      })],
    }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(connection)
      .overrideProvider(RELEASE_ACTIVATION).useValue(new FakeReleaseActivation())
      .overrideProvider(GET_CURRENT_ADMIN_USER).useValue(current)
      .overrideProvider(SITE_REPOSITORY).useValue(sites)
      .overrideProvider(PAGE_REPOSITORY).useValue(new FakePageRepository())
      .overrideProvider(ELEMENT_KEYS).useValue({ reserve: async () => '1' })
      .overrideProvider(ELEMENT_BACKUP).useValue({ write: vi.fn() })
      .overrideProvider(ELEMENT_STORE).useValue(new FakeElementStore()).compile();

    try {
      const routing = module.get<IAdminRoutingOperationFactory>(ADMIN_ROUTING_OPERATIONS);

      await expect(routing.forSession(null).catalog.execute({ siteId: 'site-1' }))
        .rejects.toMatchObject({ code: 'AuthenticationRequired' });
      await expect(routing.forSession(null).updateSite.execute({ siteId: 'site-1' }))
        .rejects.toMatchObject({ code: 'AuthenticationRequired' });
      const factory = module.get<IAdminContentOperationFactory>(ADMIN_CONTENT_OPERATIONS);

      expect(await factory.forSession(logged.token).listSites.execute()).toHaveLength(1);
      await expect(factory.forSession(null).listSites.execute()).rejects.toMatchObject({
        code: 'AuthenticationRequired',
      });
      expect(() => module.get(ADMIN_USER_ACCESS)).toThrow();
      expect(() => module.get(CREATE_ADMIN_USER_FROM_CONSOLE)).toThrow();
      const publication = module.get<IAdminPublicationOperationFactory>(ADMIN_PUBLICATION_OPERATIONS);

      expect((await publication.forSession(logged.token).getOptions.execute({ siteId: 'site-1' })).templates)
        .toContainEqual({ templateId: 'ZaryaBasic', name: 'ZaryaBasic', requiresParameters: false });
      await expect(publication.forSession(null).getOptions.execute({ siteId: 'site-1' }))
        .rejects.toMatchObject({ code: 'AuthenticationRequired' });
      const rendering = module.get<IAdminRenderingOperationFactory>(ADMIN_RENDERING_OPERATIONS);
      const elements = rendering.forSession(logged.token);

      expect(await elements.list.execute({ siteId: 'site-1', kind: TemplateSourceKind.Template }))
        .toEqual(expect.arrayContaining([expect.objectContaining({ key: 'ZaryaBasic' }),
          expect.objectContaining({ key: 'ZaryaPagination', name: 'Pagination' })]));
      expect(await elements.list.execute({ siteId: 'site-1', kind: TemplateSourceKind.Snippet }))
        .toEqual([expect.objectContaining({
          key: 'Pagination', snippet: expect.objectContaining({ code: expect.any(String) }),
        })]);

      expect(await elements.create.execute({ ...elementFixture(), name: 'Home document' }))
        .toMatchObject({ key: '1', name: 'Home document', backupState: 'Ready' });
      await expect(rendering.forSession(null).list.execute({ siteId: 'site-1', kind: TemplateSourceKind.Template }))
        .rejects.toMatchObject({ code: 'AuthenticationRequired' });
    } finally {
      await module.close();
    }
  });
});
