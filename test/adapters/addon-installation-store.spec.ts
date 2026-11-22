import { createConnection } from 'mongoose';

import {
  MongooseAddonInstallationStore,
} from '../../src/adapters/outbound/persistence/mongoose/addons/addon-installation-store.adapter.js';
import { AddonInstallationStatus } from '../../src/domain/addons/addon-installation.js';

const candidate = {
  installationId: 'install',
  repositoryUrl: 'https://github.com/example/events',
  releaseTag: 'v1.0.0',
  sourceCommit: 'a'.repeat(40),
  artifactChecksum: 'b'.repeat(64),
  runtimeDigest: 'c'.repeat(64),
  addonKey: 'events',
  implementationVersion: '1.0.0',
  cmsVersion: '0.8.0',
  status: AddonInstallationStatus.Pending,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  installedAt: null,
  installedBy: 'admin',
};

describe('installation metadata persistence translation', () => {
  it('writes explicit global metadata and maps document identity back to the contract', async () => {
    const connection = createConnection();
    const store = new MongooseAddonInstallationStore(connection);
    const { installationId, ...fields } = candidate;
    const insert = vi.spyOn(store.model, 'insertOne')
      .mockResolvedValue(new store.model({ _id: installationId, ...fields }));

    try {
      expect(await store.reserve(candidate)).toEqual(candidate);
      expect(insert).toHaveBeenCalledWith({
        _id: 'install',
        repositoryUrl: candidate.repositoryUrl,
        releaseTag: 'v1.0.0',
        sourceCommit: candidate.sourceCommit,
        artifactChecksum: candidate.artifactChecksum,
        runtimeDigest: candidate.runtimeDigest,
        addonKey: 'events',
        implementationVersion: '1.0.0',
        cmsVersion: '0.8.0',
        status: 'Pending',
        createdAt: candidate.createdAt,
        installedAt: null,
        installedBy: 'admin',
      });
    } finally {
      await connection.close();
    }
  });

  it('turns a competing source or package claim into a conflict', async () => {
    const connection = createConnection();
    const store = new MongooseAddonInstallationStore(connection);

    vi.spyOn(store.model, 'insertOne').mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
    vi.spyOn(store, 'findByRepository').mockResolvedValue({ ...candidate, runtimeDigest: 'd'.repeat(64) });

    try {
      await expect(store.reserve(candidate)).rejects.toMatchObject({ code: 'Conflict' });
    } finally {
      await connection.close();
    }
  });

  it('returns the original metadata for an identical package claim', async () => {
    const connection = createConnection();
    const store = new MongooseAddonInstallationStore(connection);

    vi.spyOn(store.model, 'insertOne').mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
    vi.spyOn(store, 'findByRepository').mockResolvedValue(candidate);

    try {
      expect(await store.reserve({ ...candidate, installationId: 'retry', installedBy: 'another-admin' }))
        .toEqual(candidate);
    } finally {
      await connection.close();
    }
  });
});
