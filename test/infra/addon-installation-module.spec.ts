import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { AddonInstallationStatus, type IAddonInstallation } from '../../src/domain/addons/addon-installation.js';
import {
  ADDON_INSTALLATION_STORE, ADDON_PACKAGE_DELIVERY, INSTALL_ADDON_FROM_REPOSITORY, LIST_ADDON_INSTALLATIONS,
} from '../../src/infra/addons/addon-installation.tokens.js';
import { ADDON_ACCESS } from '../../src/infra/addons/addons.tokens.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import type { IInstallAddonFromRepository }
  from '../../src/ports/inbound/addons/install-addon-from-repository.port.js';
import type { IListAddonInstallations } from '../../src/ports/inbound/addons/list-addon-installations.port.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';

it('resolves installation and listing through AppModule with explicit port overrides', async () => {
  const connection = createConnection();
  let saved: IAddonInstallation | null = null;
  const identity = {
    repositoryUrl: 'https://github.com/example/synthetic',
    releaseTag: 'v1',
    sourceCommit: 'a'.repeat(40),
    artifactChecksum: 'b'.repeat(64),
    runtimeDigest: 'c'.repeat(64),
    addonKey: 'synthetic',
    implementationVersion: '1.0.0',
    cmsVersion: '0.8.0',
  };
  const module = await Test.createTestingModule({
    imports: [AppModule.forLocalOperator({
      mongoUri: 'mongodb://localhost:27017',
      database: 'unit_installation',
      dumpsRoot: '.tmp/unit-installation-' + randomUUID(),
      operator: { operatorId: 'operator', platformAdministrator: true },
    })],
  }).overrideProvider(HOOK_PERSISTENCE).useValue({ connection })
    .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
    .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
    .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
    .overrideProvider(MONGO_CONNECTION).useValue(connection)
    .overrideProvider(ADDON_ACCESS).useValue({ requireAdministrator: async () => {} })
    .overrideProvider(ADDON_INSTALLATION_STORE).useValue({
      findByRepository: async () => saved,
      list: async () => saved ? [saved] : [],
      reserve: async (value: IAddonInstallation) => {
        saved = value;

        return value;
      },
      complete: async () => {
        saved = { ...saved!, status: AddonInstallationStatus.Installed, installedAt: new Date() };

        return saved;
      },
    })
    .overrideProvider(ADDON_PACKAGE_DELIVERY).useValue({
      prepare: async () => ({ ...identity, contentId: 'staged' }),
      installed: () => false,
      install: async () => {},
      discard: async () => {},
    }).compile();

  try {
    expect(await module.get<IInstallAddonFromRepository>(INSTALL_ADDON_FROM_REPOSITORY).execute({
      actorId: 'operator', siteId: 'site', repositoryUrl: identity.repositoryUrl,
    })).toMatchObject({ ...identity, status: 'Installed' });
    expect(await module.get<IListAddonInstallations>(LIST_ADDON_INSTALLATIONS).execute({
      actorId: 'operator', siteId: 'site',
    })).toHaveLength(1);
  } finally {
    await module.close();
    await connection.close();
  }
});
