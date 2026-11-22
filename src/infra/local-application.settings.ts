import path from 'node:path';

import type { ILocalOperatorContext } from '../adapters/outbound/access/local/local-operator.context.js';
import {
  type IRequestCacheMemorySettings, validateRequestCacheMemorySettings,
} from '../adapters/outbound/publication/memory/request-document-cache.adapter.js';
import {
  type ISnippetPoolSettings, validateSnippetPoolSettings,
} from '../adapters/outbound/rendering/modx/snippet-worker-pool.js';
import {
  type ISnippetConcurrencySettings, validateSnippetConcurrencySettings,
} from '../app/services/publication/snippet-scheduler.service.js';
import type { IDataLoader } from '../ports/outbound/publication/data-loader.port.js';
import {
  type IGitHubAppSettings, readGitHubAppSettings, validateGitHubAppSettings,
} from './addons/github-app.settings.js';
import { validateDumpsRoot } from './dumps/dumps.settings.js';
import { readMongoPoolSize } from './persistence/persistence.providers.js';
import { readRequestCacheSettings } from './publication/request-cache.settings.js';
import { readSnippetConcurrencySettings } from './rendering/snippet-concurrency.settings.js';
import { readSnippetPoolSettings } from './rendering/snippet-pool.settings.js';

export interface IRenderingSettings {
  readonly sourcesRoot: string;
  readonly artifactsRoot: string;
  readonly loaders?: readonly IDataLoader[];
  readonly loaderTimeoutMs?: number;
  readonly snippetPool?: ISnippetPoolSettings;
  readonly requestCache?: IRequestCacheMemorySettings;
  readonly snippetConcurrency?: ISnippetConcurrencySettings;
}

import type { IDumpCapacityPort } from '../ports/outbound/resources/dump-capacity.port.js';
import type { IInstallationResourcesPort } from '../ports/outbound/resources/installation-resources.port.js';

export interface ILocalApplicationSettings {
  readonly installationResources?: IInstallationResourcesPort;
  readonly dumpCapacity?: IDumpCapacityPort;
  readonly sharedMaintenanceRoot?: string;
  readonly backgroundWork?: boolean;
  readonly githubApp?: IGitHubAppSettings;
  readonly dumpsRoot?: string;
  readonly mongoUri: string;
  readonly mongoPoolSize?: number;
  readonly database: string;
  readonly operator: ILocalOperatorContext;
  readonly rendering?: IRenderingSettings;
  readonly media?: { readonly root: string; readonly publicBaseUrl: string };
}

export function validateLocalSettings(input: ILocalApplicationSettings): ILocalApplicationSettings {
  if (
    !/^mongodb(?:\+srv)?:\/\//.test(input.mongoUri)
    || !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(input.database)
    || !input.operator.operatorId.trim()
    || input.operator.platformAdministrator !== true
  ) {
    throw new RangeError('Explicit MongoDB database and trusted local administrator settings are required');
  }

  const rendering = input.rendering;
  const media = input.media;

  if (
    media
    && (!media.root.trim()
    || !/^\/[A-Za-z0-9/_-]+$/.test(media.publicBaseUrl)
    || media.publicBaseUrl.includes('//')
    || media.publicBaseUrl.endsWith('/')
    || /^\/(?:api|admin)(?:\/|$)/.test(media.publicBaseUrl))
  ) {
    throw new RangeError('Explicit media root and public path are required');
  }
  if (
    rendering
    && (!rendering.sourcesRoot.trim()
    || !rendering.artifactsRoot.trim()
    || (rendering.loaderTimeoutMs !== undefined
      && (!Number.isSafeInteger(rendering.loaderTimeoutMs)
    || rendering.loaderTimeoutMs < 1)))
  ) {
    throw new RangeError('Rendering roots and loader timeout must be explicit valid values');
  }

  const configured = rendering ? {
    ...rendering,
    snippetPool: validateSnippetPoolSettings(rendering.snippetPool),
    requestCache: validateRequestCacheMemorySettings(rendering.requestCache),
    snippetConcurrency: validateSnippetConcurrencySettings(rendering.snippetConcurrency),
    sourcesRoot: path.resolve(rendering.sourcesRoot),
    artifactsRoot: path.resolve(
      rendering.artifactsRoot),
    loaders: Object.freeze([...(rendering.loaders ?? [])]),
  } : undefined;

  if (
    configured
    && (configured.sourcesRoot === configured.artifactsRoot
    || configured.artifactsRoot.startsWith(configured.sourcesRoot + path.sep)
    || configured.sourcesRoot.startsWith(configured.artifactsRoot + path.sep))
  ) {
    throw new RangeError('Site sources and artifact roots must not overlap');
  }
  if (configured && media) {
    const mediaRoot = path.resolve(media.root);

    for (const other of [configured.sourcesRoot, configured.artifactsRoot]) {
      if (mediaRoot === other || mediaRoot.startsWith(other + path.sep) || other.startsWith(mediaRoot + path.sep)) {
        throw new RangeError('Media storage must be separate from sources and publication artifacts');
      }
    }
  }

  return Object.freeze({
    ...(input.githubApp ? { githubApp: validateGitHubAppSettings(input.githubApp) } : {}),
    ...(input.installationResources ? { installationResources: input.installationResources } : {}),
    ...(input.dumpCapacity ? { dumpCapacity: input.dumpCapacity } : {}),
    ...(input.sharedMaintenanceRoot ? { sharedMaintenanceRoot: path.resolve(input.sharedMaintenanceRoot) } : {}),
    ...(input.backgroundWork !== undefined ? { backgroundWork: input.backgroundWork } : {}),
    dumpsRoot: validateDumpsRoot(input.dumpsRoot,
      [configured?.sourcesRoot ?? 'sites', configured?.artifactsRoot ?? 'artifacts', media?.root]),
    mongoUri: input.mongoUri,
    ...(input.mongoPoolSize !== undefined ? { mongoPoolSize: input.mongoPoolSize } : {}),
    database: input.database,
    operator: Object.freeze({ operatorId: input.operator.operatorId, platformAdministrator: true }),
    ...(configured ? { rendering: Object.freeze(configured) } : {}),
    ...(media ? { media: Object.freeze({ root: path.resolve(media.root), publicBaseUrl: media.publicBaseUrl }) } : {}),
  });
}

export function readLocalSettings(environment: NodeJS.ProcessEnv): ILocalApplicationSettings {
  const githubApp = readGitHubAppSettings(environment);

  return validateLocalSettings({
    ...(githubApp ? { githubApp } : {}),
    mongoUri: environment.ZARYA_MONGO_URI ?? '',
    database: environment.ZARYA_MONGO_DATABASE ?? '',
    mongoPoolSize: readMongoPoolSize(environment),
    ...(environment.ZARYA_DUMPS_ROOT !== undefined ? { dumpsRoot: environment.ZARYA_DUMPS_ROOT } : {}),
    operator: {
      operatorId: environment.ZARYA_LOCAL_OPERATOR_ID ?? '',
      platformAdministrator: environment.ZARYA_LOCAL_ADMINISTRATOR === 'true',
    },
    rendering: {
      snippetPool: readSnippetPoolSettings(environment),
      requestCache: readRequestCacheSettings(environment),
      snippetConcurrency: readSnippetConcurrencySettings(environment),
      sourcesRoot: environment.ZARYA_SITES_ROOT ?? path.resolve('sites'),
      artifactsRoot: environment.ZARYA_ARTIFACTS_ROOT ?? path.resolve('artifacts'),
    },
    media: {
      root: environment.ZARYA_MEDIA_ROOT ?? '',
      publicBaseUrl: environment.ZARYA_MEDIA_PUBLIC_PATH ?? '',
    },
  });
}
