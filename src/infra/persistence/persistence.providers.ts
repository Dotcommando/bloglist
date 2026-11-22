import type { OnApplicationShutdown, Provider } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';

import { verifyMigrations } from '../../adapters/outbound/persistence/mongoose/migrations.js';
import { assertRoutingTopology } from '../../adapters/outbound/persistence/mongoose/routing/routing-topology.js';
import { MONGO_CONNECTION } from './persistence.tokens.js';

export interface IDatabaseSettings {
  readonly mongoUri: string;
  readonly database: string;
  readonly mongoPoolSize?: number;
}

export function readMongoPoolSize(environment: NodeJS.ProcessEnv): number {
  const size = Number(environment.ZARYA_MONGO_MAX_POOL_SIZE ?? '5');

  if (!Number.isSafeInteger(size) || size < 1) {
    throw new Error('MongoDB pool size must be a positive integer');
  }

  return size;
}

export function persistenceProviders(settings: IDatabaseSettings): Provider[] {
  const poolSize = settings.mongoPoolSize ?? 5;

  if (!Number.isSafeInteger(poolSize) || poolSize < 1) {
    throw new Error('MongoDB pool size must be a positive integer');
  }

  return [
    {
      provide: MONGO_CONNECTION,
      useFactory: async (): Promise<Connection> => {
        const connection = await createConnection(settings.mongoUri, {
          dbName: settings.database,
          autoIndex: false,
          autoCreate: false,
          maxPoolSize: poolSize,
          serverSelectionTimeoutMS: 5000,
          writeConcern: { w: 'majority' },
        }).asPromise();

        try {
          await verifyMigrations(connection, 'migrations');

          if (!connection.db) {
            throw new Error('Expected an open MongoDB connection');
          }
          assertRoutingTopology(await connection.db.admin().command({ hello: 1 }));

          return connection;
        } catch (error) {
          await connection.close();
          throw error;
        }
      },
    },
    {
      provide: 'MongoLifecycle',
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection): OnApplicationShutdown => ({
        onApplicationShutdown: async () => {
          await connection.close();
        },
      }),
    },
  ];
}
