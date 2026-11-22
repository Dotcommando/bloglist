import { isIP } from 'node:net';
import path from 'node:path';

import {
  validateRequestCacheMemorySettings,
} from '../adapters/outbound/publication/memory/request-document-cache.adapter.js';
import { validateSnippetPoolSettings } from '../adapters/outbound/rendering/modx/snippet-worker-pool.js';
import { validateSnippetConcurrencySettings } from '../app/services/publication/snippet-scheduler.service.js';
import { LoaderPhase } from '../domain/pages/page-rendering.js';
import type { ICalibrationLoadPort } from '../ports/outbound/calibration/calibration-runtime.port.js';
import type { ISiteDumpCapturePort } from '../ports/outbound/dumps/site-dump-capture.port.js';
import type { IDumpCapacityPort } from '../ports/outbound/resources/dump-capacity.port.js';
import type { IInstallationResourcesPort } from '../ports/outbound/resources/installation-resources.port.js';
import {
  type IGitHubAppSettings, readGitHubAppSettings, validateGitHubAppSettings,
} from './addons/github-app.settings.js';
import { validateDumpsRoot } from './dumps/dumps.settings.js';
import type { IDatabaseSettings } from './persistence/persistence.providers.js';
import { readMongoPoolSize } from './persistence/persistence.providers.js';
import type { IPublishedRuntimeSettings } from './publication/published-runtime.providers.js';
import { readRequestCacheSettings } from './publication/request-cache.settings.js';
import { readSnippetConcurrencySettings } from './rendering/snippet-concurrency.settings.js';
import { readSnippetPoolSettings } from './rendering/snippet-pool.settings.js';

export interface IPublicHttpSettings extends IDatabaseSettings, IPublishedRuntimeSettings {
  readonly pageDiagnostics?: boolean;
  readonly githubApp?: IGitHubAppSettings;
  readonly sharedMaintenanceRoot?: string;
  readonly backgroundWork?: boolean;
  readonly coordinatorOnly?: boolean;
  readonly internalRequestSecret?: string;
  readonly dumpCapacity?: IDumpCapacityPort;
  readonly dumpChildCapture?: ISiteDumpCapturePort;
  readonly installationResources?: IInstallationResourcesPort;
  readonly calibrationLoad?: ICalibrationLoadPort;
  readonly edgeProxySecret?: string;
  readonly dumpsRoot?: string;
  readonly artifactsRoot: string;
  readonly sourcesRoot?: string;
  readonly host: string;
  readonly port: number;
  readonly adminAuth?: {
    readonly origin: string;
    readonly currentOrigin?: () => string;
    readonly cookieVersion?: () => string;
  };
  readonly adminRoot?: string;
  readonly media?: { readonly root: string; readonly publicBaseUrl: string };
}

export function validatePublicHttpSettings(input: IPublicHttpSettings): IPublicHttpSettings {
  if (input.pageDiagnostics !== undefined && typeof input.pageDiagnostics !== 'boolean') {
    throw new RangeError('Page diagnostics must be boolean');
  }
  if (input.edgeProxySecret !== undefined && !input.edgeProxySecret.trim()) {
    throw new RangeError('Configured edge proxy secret must be non-empty');
  }
  if (
    input.media
    && (!input.media.root.trim()
    || !/^\/[A-Za-z0-9/_-]+$/.test(input.media.publicBaseUrl)
    || input.media.publicBaseUrl.includes('//')
    || input.media.publicBaseUrl.endsWith('/')
    || /^\/(?:api|admin)(?:\/|$)/.test(input.media.publicBaseUrl))
  ) {
    throw new RangeError('Explicit media root and public path are required');
  }
  if (input.media) {
    const mediaRoot = path.resolve(input.media.root);
    const roots = [input.artifactsRoot, input.sourcesRoot].filter((value): value is string => value !== undefined);

    for (const otherRoot of roots) {
      const other = path.resolve(otherRoot);

      if (mediaRoot === other || mediaRoot.startsWith(other + path.sep) || other.startsWith(mediaRoot + path.sep)) {
        throw new RangeError('Media storage must be separate from sources and publication artifacts');
      }
    }
  }
  if (
    !/^mongodb(?:\+srv)?:\/\//.test(input.mongoUri)
    || !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(input.database)
    || !input.artifactsRoot.trim()
    || !isIP(input.host)
    || !Number.isSafeInteger(input.port)
    || input.port < 0
    || input.port > 65535
    || (input.loaderTimeoutMs !== undefined
      && (!Number.isSafeInteger(input.loaderTimeoutMs)
    || input.loaderTimeoutMs < 1))
  ) {
    throw new RangeError('Valid explicit public HTTP, artifact and database settings are required');
  }
  if (input.sourcesRoot !== undefined && !input.sourcesRoot.trim()) {
    throw new RangeError('Site source root must be non-empty');
  }

  const loaders = input.loaders ?? [];

  if (input.adminRoot !== undefined && !input.adminRoot.trim()) {
    throw new RangeError('Administration assets require an explicit non-empty root');
  }
  if (input.adminAuth) {
    const origin = new URL(input.adminAuth.origin);

    if (
      origin.origin !== input.adminAuth.origin
      || origin.username
      || origin.password
      || (origin.protocol !== 'https:'
      && !(origin.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))
    ) {
      throw new RangeError('Administrator authentication requires an explicit HTTPS origin or local HTTP origin');
    }
  }
  if (
    new Set(loaders.map((loader) => loader.id)).size !== loaders.length
    || loaders.some((loader) => !/^[A-Za-z][A-Za-z0-9_-]*$/.test(loader.id) || !loader.phases.length
      || loader.phases.some((phase) => !Object.values(LoaderPhase).includes(phase)))
  ) {
    throw new RangeError('Invalid public loader registry');
  }

  return Object.freeze({
    ...input,
    ...(input.githubApp ? { githubApp: validateGitHubAppSettings(input.githubApp) } : {}),
    snippetPool: validateSnippetPoolSettings(input.snippetPool),
    requestCache: validateRequestCacheMemorySettings(input.requestCache),
    snippetConcurrency: validateSnippetConcurrencySettings(input.snippetConcurrency),
    dumpsRoot: validateDumpsRoot(input.dumpsRoot,
      [input.artifactsRoot, input.sourcesRoot ?? 'sites', input.media?.root, input.adminRoot]),
    artifactsRoot: path.resolve(input.artifactsRoot),
    ...(input.media ? {
      media: Object.freeze({ root: path.resolve(input.media.root), publicBaseUrl: input.media.publicBaseUrl }),
    } : {}),
    ...(input.sourcesRoot !== undefined ? { sourcesRoot: path.resolve(input.sourcesRoot) } : {}),
    ...(input.adminRoot ? { adminRoot: path.resolve(input.adminRoot) } : {}),
    loaders: Object.freeze([...loaders]),
    ...(input.adminAuth ? { adminAuth: Object.freeze({ ...input.adminAuth }) } : {}),
  });
}

export function readPublicHttpSettings(environment: NodeJS.ProcessEnv): IPublicHttpSettings {
  const port = environment.ZARYA_HTTP_PORT ?? '3000';
  const diagnostics = environment.ZARYA_PAGE_DIAGNOSTICS ?? 'true';
  const githubApp = readGitHubAppSettings(environment);

  if (!['true', 'false'].includes(diagnostics)) {
    throw new RangeError('ZARYA_PAGE_DIAGNOSTICS must be true or false');
  }
  if (!/^\d+$/.test(port)) {
    throw new RangeError('Public HTTP port must be an integer');
  }

  return validatePublicHttpSettings({
    ...(githubApp ? { githubApp } : {}),
    ...(environment.ZARYA_EDGE_PROXY_SECRET ? { edgeProxySecret: environment.ZARYA_EDGE_PROXY_SECRET } : {}),
    mongoUri: environment.ZARYA_MONGO_URI ?? '',
    database: environment.ZARYA_MONGO_DATABASE ?? '',
    mongoPoolSize: readMongoPoolSize(environment),
    ...(environment.ZARYA_DUMPS_ROOT !== undefined ? { dumpsRoot: environment.ZARYA_DUMPS_ROOT } : {}),
    artifactsRoot: environment.ZARYA_ARTIFACTS_ROOT ?? path.resolve('artifacts'),
    sourcesRoot: environment.ZARYA_SITES_ROOT ?? path.resolve('sites'),
    host: environment.ZARYA_HTTP_HOST ?? '127.0.0.1',
    port: Number(port),
    pageDiagnostics: diagnostics === 'true',
    snippetPool: readSnippetPoolSettings(environment),
    requestCache: readRequestCacheSettings(environment),
    snippetConcurrency: readSnippetConcurrencySettings(environment),
    ...(environment.ZARYA_MEDIA_ROOT !== undefined || environment.ZARYA_MEDIA_PUBLIC_PATH !== undefined
      ? {
        media: {
          root: environment.ZARYA_MEDIA_ROOT ?? '', publicBaseUrl: environment.ZARYA_MEDIA_PUBLIC_PATH ?? '',
        },
      } : {}),
    ...(environment.ZARYA_ADMIN_ROOT !== undefined ? { adminRoot: environment.ZARYA_ADMIN_ROOT } : {}),
    ...(environment.ZARYA_ADMIN_AUTH_ORIGIN ? { adminAuth: { origin: environment.ZARYA_ADMIN_AUTH_ORIGIN } } : {}),
  });
}
