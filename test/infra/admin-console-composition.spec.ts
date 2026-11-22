import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { CREATE_ADMIN_USER_FROM_CONSOLE } from '../../src/infra/admin-users/admin-users.tokens.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';

describe('administrator console composition', () => {
  it('resolves without unrelated site-publication providers', async () => {
    const connection = createConnection();
    const module = await Test.createTestingModule({
      imports: [AppModule.forAdminUserCreation({
        mongoUri: 'mongodb://localhost:27017',
        database: 'synthetic_admin',
        operator: { operatorId: 'operator', platformAdministrator: true },
      })],
    }).overrideProvider(MONGO_CONNECTION).useValue(connection)
      .overrideProvider(HOOK_PERSISTENCE).useValue({ connection })
      .overrideProvider(HOOK_CONFIGURATION).useValue({})
      .compile();

    try {
      expect(module.get(CREATE_ADMIN_USER_FROM_CONSOLE)).toBeDefined();
    } finally {
      await module.close();
    }
  });
});
