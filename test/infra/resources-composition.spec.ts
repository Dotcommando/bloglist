import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { DumpExecutionMode } from '../../src/domain/resources/site-process-allocation.js';
import { GET_CURRENT_ADMIN_USER } from '../../src/infra/admin-auth/admin-auth.tokens.js';
import { AppModule } from '../../src/infra/app.module.js';
import { CREATE_CALIBRATION_PROFILE } from '../../src/infra/calibration/calibration.tokens.js';
import { CAPTURE_SITE_DUMP, DUMP_CHILD_CAPTURE, DUMP_INLINE_CAPTURE, SITE_DUMP_STORE } from
  '../../src/infra/dumps/dumps.tokens.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { CHANGE_INSTALLATION_RESOURCES, GET_INSTALLATION_RESOURCES } from
  '../../src/infra/resources/resources.tokens.js';
import { SITE_REPOSITORY, SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type { ICaptureSiteDump } from '../../src/ports/inbound/resources/capture-site-dump.port.js';
import type { IInstallationResourcesPort } from '../../src/ports/outbound/resources/installation-resources.port.js';
import { currentAdmin } from '../support/current-admin.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { FakeSiteRepository } from '../support/sites.js';

it('resolves resource operations and adaptive capture through AppModule with explicit outbound overrides', async () => {
  const resources: IInstallationResourcesPort = { read: vi.fn(), change: vi.fn() };
  const child = { capture: vi.fn() };
  const inline = { capture: vi.fn() };
  const module = await Test.createTestingModule({
    imports: [AppModule.forLocalOperator({
      mongoUri: 'mongodb://localhost:27017',
      database: 'unit_resources',
      operator: { operatorId: 'operator', platformAdministrator: true },
      installationResources: resources,
      dumpCapacity: { reserve: async () => ({ mode: DumpExecutionMode.InProcess, release: async () => {} }) },
    })],
  }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
    .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
    .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
    .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
    .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
    .overrideProvider(SITE_REPOSITORY).useValue(new FakeSiteRepository())
    .overrideProvider(GET_CURRENT_ADMIN_USER).useValue({ execute: async () => currentAdmin() })
    .overrideProvider(SITE_DUMP_STORE).useValue({})
    .overrideProvider(DUMP_CHILD_CAPTURE).useValue(child)
    .overrideProvider(DUMP_INLINE_CAPTURE).useValue(inline).compile();

  try {
    expect(module.get<ICaptureSiteDump>(CAPTURE_SITE_DUMP)).toBeDefined();
    expect(module.get(GET_INSTALLATION_RESOURCES)).toBeDefined();
    expect(module.get(CREATE_CALIBRATION_PROFILE)).toBeDefined();
    expect(module.get(CHANGE_INSTALLATION_RESOURCES)).toBeDefined();
    inline.capture.mockRejectedValueOnce(new Error('synthetic inline failure'));
    await expect(module.get<ICaptureSiteDump>(CAPTURE_SITE_DUMP).execute({ siteId: 'a' }))
      .rejects.toThrow('synthetic inline failure');
    expect(child.capture).not.toHaveBeenCalled();
  } finally {
    await module.close();
  }
});
