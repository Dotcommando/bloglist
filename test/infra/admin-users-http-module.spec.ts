import 'reflect-metadata';

import { Test } from '@nestjs/testing';

import type {
  IAdminUserOperationFactory,
} from '../../src/adapters/inbound/rest/admin-users/admin-user-operations.factory.js';
import { AdminUsersController } from '../../src/adapters/inbound/rest/admin-users/admin-users.controller.js';
import type { ICurrentAdminUser } from '../../src/domain/admin-auth/admin-auth-session.js';
import { GET_CURRENT_ADMIN_USER } from '../../src/infra/admin-auth/admin-auth.tokens.js';
import {
  ADMIN_PASSWORDS, ADMIN_USER_HTTP_OPERATIONS, ADMIN_USER_STORE,
} from '../../src/infra/admin-users/admin-users.tokens.js';
import { adminUserHttpProviders } from '../../src/infra/admin-users/admin-users-http.providers.js';
import { HOOK_CHANGES } from '../../src/infra/hooks/hooks.tokens.js';
import { adminFixture } from '../support/admin-users.js';
import { fakeHookChanges } from '../support/hooks.js';

it('wires session-bound administrator operations to existing real use cases and explicit outbound ports', async () => {
  const fixture = adminFixture();
  const settings = {
    mongoUri: 'mongodb://localhost:27017',
    database: 'synthetic',
    sourcesRoot: '.tmp/sources',
    artifactsRoot: '.tmp/artifacts',
    host: '127.0.0.1',
    port: 0,
    adminAuth: { origin: 'http://localhost' },
  };
  const module = await Test.createTestingModule({
    providers: [
      ...adminUserHttpProviders(settings),
      { provide: ADMIN_USER_STORE, useValue: { ...fixture.reader, ...fixture.unitOfWork } },
      { provide: ADMIN_PASSWORDS, useValue: fixture.passwords },
      { provide: HOOK_CHANGES, useValue: fakeHookChanges },
      {
        provide: GET_CURRENT_ADMIN_USER,
        useValue: {
          execute: async ({ token }: { token: string }) => {
            expect(token).toBe('session');

            const result: ICurrentAdminUser = {
              user: {
                ...fixture.accounts.get('user-1')!.profile(),
                authorization: { systemAdmin: true, siteIds: [], siteAdminSiteIds: [] },
              },
              session: {
                sessionId: 'session',
                current: true,
                createdAt: new Date('2026-11-05T00:00:00Z'),
                lastSeenAt: new Date('2026-11-05T00:00:00Z'),
                expiresAt: new Date('2027-01-05T00:00:00Z'),
                clientAddress: null,
                userAgent: null,
              },
            };

            return result;
          },
        },
      },
    ],
  }).compile();

  try {
    const factory = module.get<IAdminUserOperationFactory>(ADMIN_USER_HTTP_OPERATIONS);
    const operations = await factory.forSession('session');

    expect(module.get(AdminUsersController).canHandle('/api/admin/users')).toBe(true);
    expect(operations.actorId).toBe('user-1');
    expect((await operations.list.execute({ actorId: operations.actorId })).items).toHaveLength(2);
    const created = await operations.create.execute({
      actorId: operations.actorId, email: 'new@example.test', password: 'synthetic new password',
    });

    expect(created).toMatchObject({ email: 'new@example.test', blocked: false });
    expect(created).not.toHaveProperty('passwordDigest');
    await expect(operations.block.execute({
      actorId: operations.actorId, adminUserId: 'user-1', expectedVersion: 'user-1-v1', blocked: true,
    })).rejects.toMatchObject({ code: 'Forbidden' });
    expect(adminUserHttpProviders({
      mongoUri: settings.mongoUri,
      database: settings.database,
      host: settings.host,
      port: settings.port,
      artifactsRoot: settings.artifactsRoot,
      sourcesRoot: settings.sourcesRoot,
    })).toEqual([]);
  } finally {
    await module.close();
  }
});
