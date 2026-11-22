import { createConnection } from 'mongoose';

import { applyMigrations, verifyMigrations } from '../../adapters/outbound/persistence/mongoose/migrations.js';
import { installedAddons } from '../addons/installed-addons.js';
import { type ILocalApplicationSettings, validateLocalSettings } from '../local-application.settings.js';

export async function runMigrations(input: ILocalApplicationSettings, verifyOnly: boolean): Promise<void> {
  const settings = validateLocalSettings(input);
  const connection = await createConnection(settings.mongoUri, {
    dbName: settings.database,
    autoIndex: false,
    autoCreate: false,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    writeConcern: { w: 'majority' },
  }).asPromise();

  try {
    const sources = [
      { directory: 'migrations', owner: undefined },
      ...installedAddons.map((addon) => ({
        directory: addon.migrationsDirectory,
        owner: addon.definition.addonKey,
      })),
    ];

    for (const { directory, owner } of sources) {
      if (!directory) {
        throw new Error('Missing migration directory');
      }
      if (verifyOnly) {
        await verifyMigrations(connection, directory, owner);
      } else {
        await applyMigrations(connection, directory, owner);
      }
    }
  } finally {
    await connection.close();
  }
}
