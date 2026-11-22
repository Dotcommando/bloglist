import 'reflect-metadata';

import { Test, type TestingModule } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { CREATE_CALIBRATION_PROFILE } from '../../src/infra/calibration/calibration.tokens.js';
import { HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { PublicHttpModule } from '../../src/infra/public-http.module.js';

it('composes public-only serving without administrator calibration dependencies', async () => {
  const connection = createConnection();
  let module: TestingModule | undefined;

  try {
    module = await Test.createTestingModule({
      imports: [PublicHttpModule.forHttp({
        mongoUri: 'mongodb://localhost:27017',
        database: 'unit_public_calibration',
        host: '127.0.0.1',
        port: 0,
        sourcesRoot: '.tmp/public-calibration-sites',
        artifactsRoot: '.tmp/public-calibration-artifacts',
        installationResources: { read: vi.fn(), change: vi.fn() },
      })],
    }).overrideProvider(MONGO_CONNECTION).useValue(connection)
      .overrideProvider(HOOK_PERSISTENCE).useValue({ connection })
      .overrideProvider(HOOK_CONFIGURATION).useValue({})
      .compile();
    expect(() => module!.get(CREATE_CALIBRATION_PROFILE)).toThrow();
  } finally {
    try {
      await module?.close();
    } finally {
      await connection.close();
    }
  }
});
