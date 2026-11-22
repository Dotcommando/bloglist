import type { IDumpDatabaseMetadata } from '../mongoose/dump-database.adapter.js';

export interface IDumpLayout {
  readonly sourceKey: string | null;
  readonly mediaDomain: string | null;
  readonly artifactDirectories: readonly string[];
}

export interface IPreparedDump {
  readonly createdAt: Date;
  readonly directory: string;
  readonly documents: string;
  readonly metadata: IDumpDatabaseMetadata;
  readonly layout: IDumpLayout;
}

export enum DumpFileArea { Sources = 'sources', Media = 'media', Artifacts = 'artifacts' }
