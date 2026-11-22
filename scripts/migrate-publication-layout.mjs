import { mkdir } from 'node:fs/promises';
import { createConnection as probeConnection } from 'node:net';

import { createConnection } from 'mongoose';

import { publicationModels } from '../dist/adapters/outbound/persistence/mongoose/publication/publication.models.js';
import { siteSchema } from '../dist/adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../dist/adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import {
  PublicationDirectoryAdapter,
} from '../dist/adapters/outbound/publication/files/publication-directory.adapter.js';
import { FilePublicationStoreAdapter } from '../dist/adapters/outbound/publication/files/publication-store.adapter.js';
import { readPublicHttpSettings } from '../dist/infra/public-http.settings.js';

const settings = readPublicHttpSettings(process.env);

// The old process does not know domain directories. Refuse conversion while it listens.
await new Promise((resolve, reject) => {
  const host = settings.host === '0.0.0.0' ? '127.0.0.1' : settings.host === '::' ? '::1' : settings.host;
  const socket = probeConnection({ host, port: settings.port });

  socket.once('connect', () => {
    socket.destroy();
    reject(new Error('Stop the CMS application in the IDE before migrating publication directories'));
  });
  socket.once('error', (error) => {
    if (error.code === 'ECONNREFUSED') {
      resolve();
    } else {
      reject(error);
    }
  });
  socket.setTimeout(2000, () => {
    socket.destroy();
    reject(new Error('Could not verify that the configured CMS listener is stopped'));
  });
});

const connection = await createConnection(settings.mongoUri, {
  dbName: settings.database, autoIndex: false, autoCreate: false, maxPoolSize: 1,
}).asPromise();

try {
  const sites = connection.model('Site', siteSchema);
  const releases = publicationModels(connection).releases;
  const scope = new MongooseSiteStorageScope(sites);
  const directories = new PublicationDirectoryAdapter(settings.artifactsRoot, scope);
  const store = new FilePublicationStoreAdapter(settings.artifactsRoot, releases, scope);
  const migrated = [];

  await mkdir(settings.artifactsRoot, { recursive: true });

  for await (const site of sites.find().lean().cursor()) {
    const ready = await releases.find({ siteId: site._id, state: 'Ready' }).select({ _id: 1 }).lean().exec();

    for (const row of ready) {
      const release = await store.read(site._id, row._id);

      if (!release || release.siteId !== site._id) {
        throw new Error('Publication ownership mismatch');
      }
      await directories.migrate(release);
      await store.read(site._id, row._id);
    }
    migrated.push({ primaryDomain: site.primaryDomain, releases: ready.length });
  }
  console.info(JSON.stringify({ sites: migrated, databaseUnchanged: true }));
} finally {
  await connection.close();
}
