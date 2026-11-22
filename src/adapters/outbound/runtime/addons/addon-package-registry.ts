import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { runInThisContext } from 'node:vm';

import type {
  IAddonActionDeclaration, IAddonRequestAuthorization, IAddonRuntimeRequest, IAddonShutdownContext,
  IAddonShutdownRequest, IAddonWorkspaceView,
} from '@zarya/addon-contracts/addons';
import { AddonOperationAccess } from '@zarya/addon-contracts/addons';
import { CmsExtensionOperationKind, type ICmsAddonExtension } from '@zarya/addon-contracts/cms-extensions';
import type { IAddonHooksExtension } from '@zarya/addon-contracts/hooks';
import type { ClientSession, Connection } from 'mongoose';

import { AddonUpdatePhase } from '../../../../domain/addons/addon-update.js';
import type { IAddonConfiguration } from '../../../../domain/addons/site-addon.js';
import type { IAdminAuthorization } from '../../../../domain/authorization/admin-authorization.js';
import { type IContentAccess, resolveSiteActionAccess } from '../../../../domain/authorization/content-access.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { checked, fileHash, missing, treeRecords } from '../../backup/files/dump-files.js';
import { MongooseAddonActionCatalog } from '../../persistence/mongoose/authorization/addon-action-catalog.adapter.js';
import { readAdminAuthority } from '../../persistence/mongoose/authorization/admin-authority.adapter.js';
import { writeAuthorizationGuard } from '../../persistence/mongoose/authorization/content-access.adapter.js';
import { applyMigrations, readMigrations, verifyMigrations, verifyRuntimeMigrationCompatibility }
  from '../../persistence/mongoose/migrations.js';
import { requiresSiteId } from '../../persistence/mongoose/site-owned-schema.js';
import type { HookAddonRegistry } from '../hooks/hook-addon-registry.js';
import { isAddonHooks } from '../hooks/hook-addon-registry.js';
import { addonRouteInventoryFile, requireAddonRouteParity } from './addon-authorization-manifest.js';
import type { IAddonPackageManifest, IAddonRuntimeHost, IRunningAddon, IRuntimeAddonRegistration }
  from './addon-package.types.js';
import { packageConfiguration } from './addon-package-configuration.js';
import { packageObject, readAddonPackageManifest } from './addon-package-manifest.js';
import { AddonRuntimeLifecycle } from './addon-runtime-lifecycle.js';
import { supportsCmsVersion } from './cms-version.js';

const retainedSdk = new Map([
  ['0.4.0', '@zarya/addon-contracts-retained-0-4'],
  ['0.5.0', '@zarya/addon-contracts-retained-0-5'],
]);

interface ILoadedAddon {
  readonly cms: ICmsAddonExtension | null;
  readonly hooks: IAddonHooksExtension | null;
  readonly manifest: IAddonPackageManifest;
  readonly directory: string;
  readonly digest: string;
  readonly running: IRunningAddon;
  validate(configuration: IAddonConfiguration): void;
  defaultConfiguration(): IAddonConfiguration;
}

interface IBoundAddonRequest {
  readonly route: IAddonActionRoute;
  readonly access: IContentAccess;
}

interface IAddonActionRoute {
  readonly addonKey: string;
  readonly digest: string;
  readonly action: IAddonActionDeclaration;
  readonly siteId: string;
  readonly handler: IRunningAddon;
}

function isCmsExtension(value: unknown): value is ICmsAddonExtension {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = packageObject(value);
  const name = (key: string): boolean => /^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(key)
    && !['constructor', 'prototype', '__proto__'].includes(key);

  return item.version === 1 && !!item.objects && typeof item.objects === 'object' && !Array.isArray(item.objects)
    && Object.entries(item.objects).every(([objectKey, methods]) => name(objectKey)
      && !!methods && typeof methods === 'object' && !Array.isArray(methods)
      && Object.entries(methods).every(([method, operation]: [string, unknown]) => {
        if (!name(method)) {
          return false;
        }
        if (!operation || typeof operation !== 'object') {
          return false;
        }

        const definition = packageObject(operation);

        return Object.values(CmsExtensionOperationKind).some((kind) => kind === definition.kind)
          && Object.values(AddonOperationAccess).some((access) => access === definition.access)
          && typeof definition.execute === 'function';
      }));
}

import { moveAddonDirectory } from './addon-directory-move.js';

const loadHostModule = createRequire(import.meta.url);

export interface IAddonDumpMetadata {
  readonly cmsVersion: string | undefined;
  readonly staticOwned: readonly string[];
  readonly registrations: readonly Pick<IRuntimeAddonRegistration, 'definition' | 'transfer' | 'packageDirectory'>[];
}

export class AddonPackageRegistry {
  private readonly loaded = new Map<string, ILoadedAddon>();
  private installing = false;

  readonly actionCatalog: MongooseAddonActionCatalog;
  private readonly requestAccess = new WeakMap<IAddonRuntimeRequest, IBoundAddonRequest>();

  constructor(private readonly root: string, private readonly connection: Connection,
    private readonly staticAddons: readonly IRuntimeAddonRegistration[], private readonly host: IAddonRuntimeHost,
    private readonly hookRegistry?: HookAddonRegistry) {
    this.actionCatalog = new MongooseAddonActionCatalog(connection);
  }

  registrations(): readonly IRuntimeAddonRegistration[] {
    return [...this.staticAddons.filter((item) => !this.loaded.has(item.definition.addonKey)),
      ...[...this.loaded.values()].map((item) => ({
        definition: item.manifest.definition,
        migrationsDirectory: path.join(item.directory, 'migrations'),
        transfer: {
          collections: item.manifest.collections,
          ...(item.manifest.calibrationQueries ? { calibrationQueries: item.manifest.calibrationQueries } : {}),
        },
        packageDirectory: item.directory,
        validate: item.validate,
        defaultConfiguration: item.defaultConfiguration,
      }))];
  }

  dumpMetadata(): IAddonDumpMetadata {
    return structuredClone({
      cmsVersion: this.host.cmsVersion,
      staticOwned: this.staticAddons.flatMap((item) =>
        item.transfer?.collections.map((collection) => collection.name) ?? []),
      registrations: this.registrations().map((item) => ({
        definition: item.definition,
        ...(item.transfer ? { transfer: { collections: item.transfer.collections } } : {}),
        ...(item.packageDirectory ? { packageDirectory: item.packageDirectory } : {}),
      })),
    });
  }

  runtime(key: string): { digest: string; entry: string | null; styles: readonly string[] } | null {
    const addon = this.loaded.get(key);

    return addon ? { digest: addon.digest, entry: addon.manifest.adminEntry, styles: addon.manifest.styles } : null;
  }

  view(key: string): ReturnType<AddonPackageRegistry['runtime']> {
    return this.runtime(key);
  }

  hasBoundAdminView(key: string): boolean {
    return Boolean(this.loaded.get(key)?.manifest.authorization?.adminUi);
  }

  async workspace(addonKey: string, siteId: string, actorId: string, authority: IAdminAuthorization,
    enabled: boolean): Promise<IAddonWorkspaceView | undefined> {
    const runtime = this.loaded.get(addonKey);
    const declaration = runtime?.manifest.authorization;
    const entry = runtime?.manifest.adminEntry;

    if (!runtime || !entry || !declaration?.adminUi) {
      return undefined;
    }

    const accepted = await Promise.all(declaration.actions.map(async (action) => (
      action.admission === 'admin'
      && resolveSiteActionAccess(authority, actorId, siteId, action.actionId, action.allowedObjectScopes)
      && await this.actionCatalog.admitted(addonKey, runtime.digest, action) ? action.actionId : ''
    )));
    const actionIds = accepted.filter(Boolean);
    const views = declaration.adminUi.views.filter((view) => view.actionIds.every((id) => actionIds.includes(id)));

    if (!views.length) {
      return undefined;
    }

    return {
      addonKey,
      label: runtime.manifest.definition.adminMenu ?? runtime.manifest.definition.name,
      views: views.map((view) => view.id),
      actionIds,
      digest: runtime.digest,
      entry,
      styles: runtime.manifest.styles,
      enabled,
    };
  }

  canReadWorkspaceBadge(key: string, actionIds: readonly string[]): boolean {
    return this.loaded.get(key)?.manifest.authorization?.actions.some((action) => action.method === 'GET'
      && action.route === '/api/admin/sites/:siteId/' + key + '/menu-badge' && actionIds.includes(action.actionId))
      ?? false;
  }

  hasMenuBadge(key: string): boolean {
    return this.loaded.get(key)?.manifest.routes?.includes('/api/admin/sites/:siteId/' + key + '/menu-badge') ?? false;
  }

  async read(key: string, digest: string, relative: string): Promise<IBinaryContent> {
    const filename = await this.asset(key, digest, relative);
    const info = await stat(filename);

    return {
      byteSize: info.size,
      mimeType: relative.endsWith('.css') ? 'text/css; charset=utf-8'
        : 'text/javascript; charset=utf-8',
      bytes: createReadStream(filename),
    };
  }

  async asset(key: string, digest: string, relative: string): Promise<string> {
    const addon = this.loaded.get(key);

    if (
      addon?.digest !== digest
      || !(relative in addon.manifest.files)
      || ![addon.manifest.adminEntry, ...addon.manifest.styles].includes(relative)
    ) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Runtime asset not found');
    }

    return checked(addon.directory, relative);
  }

  handler(pathname: string): IRunningAddon | null {
    if (
      !pathname.startsWith('/api/')
      || pathname.startsWith('/api/admin/auth')
      || pathname.startsWith('/api/admin/addon-runtime')
    ) {
      return null;
    }

    return [...this.loaded.values()].find(({ manifest, running }) =>
      !manifest.authorization && running.canHandle(pathname))?.running ?? null;
  }

  actionRoute(method: string, pathname: string): IAddonActionRoute | undefined {
    const segments = pathname.split('/');
    let selected: IAddonActionRoute | undefined;
    let rank = '';

    for (const [addonKey, { manifest, digest, running }] of this.loaded) {
      for (const action of manifest.authorization?.actions ?? []) {
        if (action.method !== method) {
          continue;
        }

        const template = action.route.split('/');
        const matches = template.length === segments.length && template.every((part, index) =>
          part.startsWith(':') ? /^[A-Za-z0-9_.-]{1,256}$/.test(segments[index]!) : part === segments[index]);

        if (matches) {
          const specificity = template.map((part) => part.startsWith(':') ? '0' : '1').join('');

          if (specificity > rank && running.canHandle(pathname)) {
            rank = specificity;
            const siteId = segments[template.indexOf(':siteId')] ?? '';

            selected = { addonKey, digest, action, siteId, handler: running };
          }
        }
      }
    }

    return selected;
  }

  bindRequest(request: IncomingMessage, route: IAddonActionRoute, access: IContentAccess): void {
    if (route.action.actionId !== access.actionId || route.siteId !== access.siteId) {
      throw new BusinessError(BusinessErrorCode.Forbidden,
        'Add-on request authority does not match the selected route');
    }

    const verified = Object.freeze({
      ...access,
      scopes: Object.freeze([...access.scopes]),
      groupIds: Object.freeze([...access.groupIds]),
    });

    this.requestAccess.set(request, { route, access: verified });
  }

  private requestAuthorization(addonKey: string, digest: string): IAddonRequestAuthorization<ClientSession> {
    const get = (request: IAddonRuntimeRequest): IBoundAddonRequest | undefined => {
      const bound = this.requestAccess.get(request);

      return bound?.route.addonKey === addonKey && bound.route.digest === digest ? bound : undefined;
    };

    return {
      read: (request) => get(request)?.access,
      write: async (request, permit, session) => {
        const bound = get(request);

        if (
          !session.inTransaction()
          || permit.siteId !== bound?.access.siteId
          || permit.addonKey !== addonKey
          || permit.access !== AddonOperationAccess.AdministrationRetained
          && permit.access !== AddonOperationAccess.AdministrationEnabled
          || !(bound.route.action.create || bound.route.action.update || bound.route.action.delete
            || bound.route.action.execute)
        ) {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Add-on write requires authorized request context');
        }

        const db = this.connection.db!;
        const { actorId, siteId, actionId } = bound.access;
        const active = await db.collection<{ _id: string }>('admin_users')
          .findOne({ _id: actorId, blocked: false, deletedAt: null }, { session, projection: { _id: 1 } });
        const authority = active ? await readAdminAuthority(db, actorId, session) : undefined;
        const access = resolveSiteActionAccess(authority, actorId, siteId, actionId,
          bound.route.action.allowedObjectScopes);

        if (!access || !await this.actionCatalog.admitted(addonKey, digest, bound.route.action, session)) {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Add-on Action permission changed');
        }
        await writeAuthorizationGuard(db, 'actor:' + actorId, session);
        await writeAuthorizationGuard(db, 'site:' + siteId, session);
        await this.host.fence.check(permit, session);

        return access;
      },
    };
  }

  legacyAdminHandler(pathname: string): IRunningAddon | null {
    if (!pathname.startsWith('/api/admin/')) {
      return null;
    }

    return [...this.loaded.values()].find(({ manifest, running }) =>
      !manifest.authorization && running.canHandle(pathname))?.running ?? null;
  }

  async validatePackage(directory: string, allowUpdate = false): Promise<IAddonPackageManifest> {
    return AddonPackageRegistry.validateSnapshotPackage(directory, this.dumpMetadata(), allowUpdate);
  }

  static async validateSnapshotPackage(
    directory: string, metadata: IAddonDumpMetadata, allowUpdate = false,
  ): Promise<IAddonPackageManifest> {
    const manifest = readAddonPackageManifest(JSON.parse(await readFile(await checked(directory,
      'addon.runtime.json'), 'utf8')));

    if (manifest.cmsVersion !== undefined && !supportsCmsVersion(manifest.cmsVersion, metadata.cmsVersion)) {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Incompatible CMS version');
    }

    const owner = manifest.definition.addonKey;
    const staticOwned = new Set(metadata.staticOwned);
    const core = new Set<string>();

    for (const name of await readdir(path.resolve('migrations'))) {
      if (!name.endsWith('.json')) {
        continue;
      }

      const migration = packageObject(JSON.parse(await readFile(path.resolve('migrations', name), 'utf8')));

      if (!Array.isArray(migration.collections)) {
        throw new Error('Invalid core schema catalogue');
      }

      for (const value of migration.collections) {
        const collection = packageObject(value);

        if (typeof collection.name === 'string' && !staticOwned.has(collection.name)) {
          core.add(collection.name);
        }
      }
    }
    const conflicts = new Set(metadata.registrations.filter((item) => item.definition.addonKey !== owner)
      .flatMap((item) => item.transfer?.collections.map((collection) => collection.name) ?? []));

    if (manifest.collections.some((item) => core.has(item.name) || conflicts.has(item.name))) {
      throw new Error('Package claims another capability collection');
    }

    const existing = metadata.registrations.find((item) => item.definition.addonKey === owner);

    if (
      !allowUpdate
      && existing
      && existing.definition.implementationVersion !== manifest.definition.implementationVersion
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'An incompatible add-on version is already installed');
    }

    const files = new Set(Object.keys(manifest.files));

    if ([...files].some((name) => name.startsWith('migrations/') && !/^migrations\/\d{4}-[a-z0-9-]+\.json$/.test(name))) {
      throw new Error('Invalid owned migration filename');
    }
    if (
      !files.has(manifest.serverEntry)
      || manifest.adminEntry !== null
      && !files.has(manifest.adminEntry)
      || manifest.styles.some((style) => !files.has(style))
      || manifest.authorization
      && !files.has(addonRouteInventoryFile)
      || !files.has('migrations/0000-runtime.json')
      && !files.has('migrations/0000-runtime-v' + manifest.definition.implementationVersion.split('.')[0] + '.json')
    ) {
      throw new Error('Incomplete runtime package');
    }

    for await (const record of treeRecords(directory, 'package')) {
      if (record.kind !== 'file' || typeof record.path !== 'string') {
        continue;
      }
      if (record.path !== 'addon.runtime.json' && !files.has(record.path)) {
        throw new Error('Unlisted package file');
      }
    }

    for (const [name, checksum] of Object.entries(manifest.files)) {
      if (await fileHash(await checked(directory, name)) !== checksum) {
        throw new Error('Package checksum mismatch');
      }
    }

    if (manifest.authorization) {
      const inventory = await checked(directory, addonRouteInventoryFile);

      if ((await stat(inventory)).size > 256 * 1024) {
        throw new Error('Runtime HTTP route inventory is too large');
      }
      requireAddonRouteParity(manifest.authorization, JSON.parse(await readFile(inventory, 'utf8')));
    }

    for (const [name, version] of Object.entries(manifest.dependencies)) {
      if (!['mongoose', '@zarya/addon-contracts', '@nestjs/common'].includes(name)) {
        throw new Error('Unsupported host dependency');
      }

      const dependencyName = name === '@zarya/addon-contracts' ? retainedSdk.get(version) ?? name : name;
      let located = path.dirname(loadHostModule.resolve(name === '@zarya/addon-contracts'
        ? dependencyName + '/addons' : name));
      let matched = false;

      while (path.dirname(located) !== located) {
        const data: unknown = await readFile(path.join(located, 'package.json'), 'utf8')
          .then((value) => JSON.parse(value)).catch((error: unknown) => {
            if (!missing(error)) {
              throw error;
            }

            return null;
          });

        if (data && typeof data === 'object' && 'name' in data && data.name === name) {
          if (!('version' in data) || data.version !== version) {
            throw new Error('Incompatible host dependency');
          }
          matched = true;
          break;
        }
        located = path.dirname(located);
      }

      if (!matched) {
        throw new Error('Host dependency unavailable');
      }
    }

    const schemaNames = new Set<string>();

    for (const name of [...files].filter(name => name.startsWith('migrations/'))) {
      const migration = packageObject(JSON.parse(await readFile(await checked(directory, name), 'utf8')));

      if (
        migration.transform !== undefined
        || !Array.isArray(migration.collections)
        || new Set(migration.collections.map((value: unknown) => packageObject(value).name)).size
          !== migration.collections.length
        || migration.collections.some((value: unknown) => !manifest.collections.some(item =>
          item.name === packageObject(value).name) || !requiresSiteId(packageObject(value).validator))
      ) {
        throw new Error('Package schema ownership mismatch');
      }

      for (const collection of manifest.collections) {
        if (migration.collections.some((value: unknown) => packageObject(value).name === collection.name)) {
          schemaNames.add(collection.name);
        }
      }
    }

    const baseline = 'migrations/0000-runtime-v' + manifest.definition.implementationVersion.split('.')[0] + '.json';

    if (files.has(baseline)) {
      const migrations = await readMigrations(await checked(directory, 'migrations'));

      if (!migrations[0]?.replaces || 'migrations/' + migrations[0].id + '.json' !== baseline) {
        throw new Error('Invalid major add-on migration baseline');
      }
    }
    if (schemaNames.size !== manifest.collections.length) {
      throw new Error('Package schema ownership mismatch');
    }

    return manifest;
  }

  private async metadata(directory: string, manifest: IAddonPackageManifest,
    routes: readonly string[]): Promise<ILoadedAddon> {
    const unavailable = (): never => {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Add-on runtime is paused');
    };

    return {
      manifest,
      directory,
      digest: await fileHash(path.join(directory, 'addon.runtime.json')),
      cms: null,
      hooks: null,
      validate: unavailable,
      defaultConfiguration: unavailable,
      running: {
        canHandle: pathname => routes.some(route => {
          const segments = route.split('/');
          const target = pathname.split('/');

          return target.length >= segments.length && segments.every((part, index) =>
            part.startsWith(':') ? !!target[index] : part === target[index]);
        }),
        handle: async (_request, response) => {
          response.writeHead(503, {
            'Cache-Control': 'no-store', 'Retry-After': '5', 'Content-Type': 'application/json',
          });
          response.end(JSON.stringify({ error: BusinessErrorCode.AddonUnavailable }));
        },
      },
    };
  }

  private async load(directory: string, manifest: IAddonPackageManifest): Promise<ILoadedAddon> {
    const filename = await checked(directory, manifest.serverEntry);
    const code = await readFile(filename, 'utf8');
    const digest = createHash('sha256').update(await readFile(path.join(directory,
      'addon.runtime.json'))).digest('hex');
    const evaluate: unknown = runInThisContext('(function(exports, module, require, __filename, __dirname) {\n'
      + code + '\n})', { filename });

    if (typeof evaluate !== 'function') {
      throw new Error('Invalid runtime module');
    }

    const module = { exports: {} };
    const requireDependency = (specifier: string): unknown => {
      const normalized = specifier.replace(/^node:/, '');
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!;

      if (!builtinModules.includes(normalized) && !(name in manifest.dependencies)) {
        throw new Error('Undeclared runtime dependency');
      }

      // Business errors keep one host identity at the policy/HTTP boundary.
      const retained = name === '@zarya/addon-contracts'
        && !['@zarya/addon-contracts/business-error', '@zarya/addon-contracts/validation'].includes(specifier)
        ? retainedSdk.get(manifest.dependencies[name] ?? '') : undefined;

      return loadHostModule(retained ? specifier.replace(name, retained) : specifier);
    };

    evaluate(module.exports, module, requireDependency, filename, path.dirname(filename));
    const exported = packageObject(module.exports);

    if (manifest.authorization) {
      requireAddonRouteParity(manifest.authorization, exported.httpRoutes);
    }

    const create = exported.createRuntime;
    const validate = exported.validateConfiguration;
    const defaults = exported.defaultConfiguration;

    if (typeof create !== 'function' || typeof validate !== 'function' || typeof defaults !== 'function') {
      throw new Error('Invalid runtime exports');
    }

    const key = manifest.definition.addonKey;
    // Bundles own their model cache while sharing the host's existing MongoDB client and pool.
    const runtimeConnection = this.connection.useDb(this.connection.name, { useCache: false });
    const running = packageObject(await create({
      ...this.host,
      connection: runtimeConnection,
      cms: this.host.cms?.forAddon(key),
      policy: () => this.host.policy(key),
      secret: () => this.host.secret(key),
      ...(manifest.authorization ? { authorization: this.requestAuthorization(key, digest) } : {}),
      ...(this.host.hooks ? {
        hooks: {
          source: {
            prepare: async (change: Parameters<NonNullable<IAddonRuntimeHost['hooks']>['source']['prepare']>[0]) => {
              if (
                change.facts.some((fact) => !fact.hookKey.startsWith('addon.' + key + '.'))
            || change.checkKey
                && !change.checkKey.startsWith('addon.' + key + '.')
              ) {
                throw new Error('Foreign add-on hook producer');
              }

              return this.host.hooks!.source.prepare(change);
            },
          },
          record: async (intent: Parameters<NonNullable<IAddonRuntimeHost['hooks']>['record']>[0], session:
          Parameters<NonNullable<IAddonRuntimeHost['hooks']>['record']>[1]) => {
            if (intent.facts.some((fact) => !fact.hookKey.startsWith('addon.' + key + '.'))) {
              throw new Error('Foreign add-on hook producer');
            }
            await this.host.hooks!.record(intent, session);
          },
        },
      } : {}),
    }));
    const canHandle = running.canHandle;
    const handle = running.handle;
    const close = running.close;
    const shutdown = running.shutdown;
    const hooks = running.hooks;
    const cms = running.cms;
    const reject = async (error: Error): Promise<never> => {
      try {
        if (typeof close === 'function') {
          await close();
        }
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], 'Runtime validation and cleanup failed');
      }
      throw error;
    };

    if (cms !== undefined && (!isCmsExtension(cms) || !this.host.cms)) {
      return reject(new Error('Invalid or unavailable CMS API extension'));
    }
    if (hooks !== undefined && (!isAddonHooks(hooks) || !this.hookRegistry)) {
      return reject(new Error('Invalid hook extension'));
    }
    if (
      typeof canHandle !== 'function'
      || typeof handle !== 'function'
      || close !== undefined
      && typeof close !== 'function'
      || shutdown !== undefined
      && typeof shutdown !== 'function'
    ) {
      return reject(new Error('Invalid runtime handler'));
    }

    const lifecycle = new AddonRuntimeLifecycle(
      typeof shutdown === 'function' ? async (context: IAddonShutdownContext) => {
        await shutdown(context);
      } : undefined,
      typeof close === 'function' ? async () => {
        await close();
      } : undefined,
    );
    const guardedCms: ICmsAddonExtension | null = cms ? {
      version: 1,
      objects: Object.fromEntries(Object.entries(cms.objects).map(([object, methods]) => [
        object,
        Object.fromEntries(Object.entries(methods).map(([method, operation]) => [
          method,
          {
            ...operation,
            execute: (input, context) => lifecycle.run(() => operation.execute(input, context)),
          } satisfies typeof operation,
        ])),
      ])),
    } : null;

    return {
      manifest,
      hooks: hooks ?? null,
      cms: guardedCms,
      digest,
      directory,
      validate: (configuration) => {
        validate(configuration);
      },
      defaultConfiguration: () => {
        const value = packageConfiguration(defaults());

        validate(value);

        return value;
      },
      running: {
        canHandle: (pathname) => canHandle(pathname) === true,
        handle: (request, response) => lifecycle.run(async () => {
          await handle(request, response);
        }),
        shutdown: (request) => lifecycle.shutdown(request),
        notifyShutdown: (request) => lifecycle.notify(request),
        close: () => lifecycle.close(),
      },
    };
  }

  async install(directory: string): Promise<void> {
    if (this.host.coordinatorOnly) {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Coordinator cannot execute add-on packages');
    }
    if (this.installing) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Another package activation is in progress');
    }
    this.installing = true;

    try {
      await this.installPackage(directory);
    } finally {
      this.installing = false;
    }
  }

  private async installPackage(directory: string): Promise<void> {
    const manifest = await this.validatePackage(directory);

    if (manifest.collections.length) {
      await verifyRuntimeMigrationCompatibility(this.connection, path.join(directory, 'migrations'));
    }

    const key = manifest.definition.addonKey;
    const digest = createHash('sha256').update(await readFile(path.join(directory,
      'addon.runtime.json'))).digest('hex');
    const active = this.loaded.get(key);

    if (active?.digest === digest) {
      return;
    }
    if (active) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'An installed package version is immutable');
    }

    const destination = await checked(this.root, key + '/' + digest);

    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const exists = await stat(destination).then(() => true).catch((error: unknown) => {
      if (!missing(error)) {
        throw error;
      }

      return false;
    });

    if (exists) {
      await this.validatePackage(destination);
    } else {
      const staged = await mkdtemp(path.join(path.resolve(this.root), '.install-'));

      if (path.dirname(staged) !== path.resolve(this.root)) {
        throw new Error('Package staging escaped its private root');
      }

      try {
        const contents = path.join(staged, 'package');

        await cp(directory, contents, { recursive: true, errorOnExist: true, force: false });
        await this.validatePackage(contents);
        await moveAddonDirectory(contents, destination);
      } finally {
        await rm(staged, { recursive: true, force: true });
      }
    }
    if (manifest.collections.length) {
      await applyMigrations(this.connection, path.join(destination, 'migrations'),
        AddonPackageRegistry.migrationOwner(key));
    }

    const selection = await checked(this.root, key + '.json');
    const identity = JSON.stringify({ key, digest });
    const previous = await readFile(selection, 'utf8').catch((error: unknown) => {
      if (!missing(error)) {
        throw error;
      }

      return null;
    });

    if (previous !== null && previous !== identity) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'An installed package version is immutable');
    }

    const loaded = await this.load(destination, manifest);

    try {
      if (manifest.authorization) {
        await this.actionCatalog.validate(key, manifest.authorization);
      }
      if (loaded.cms) {
        this.host.cms!.unregister(key);
        this.host.cms!.register(key, loaded.cms);
      }
      if (loaded.hooks) {
        await this.hookRegistry!.register(key, loaded.digest, loaded.hooks);
      }
      if (manifest.authorization) {
        await this.actionCatalog.initialize(key, digest, manifest.authorization,
          () => this.selectInitialPackage(key, digest));
      } else {
        await this.selectInitialPackage(key, digest);
      }
      this.loaded.set(key, loaded);
    } catch (error) {
      if (loaded.cms) {
        this.host.cms!.unregister(key);
      }
      await loaded.running.close?.();
      throw error;
    }
  }

  private async selectInitialPackage(key: string, digest: string): Promise<void> {
    const selection = await checked(this.root, key + '.json');
    const identity = JSON.stringify({ key, digest });
    const previous = await readFile(selection, 'utf8').catch((error: unknown) => {
      if (!missing(error)) {
        throw error;
      }

      return null;
    });

    if (previous === identity) {
      return;
    }
    if (previous !== null) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'An installed package version is immutable');
    }

    const temporary = await checked(this.root, key + '.' + randomUUID() + '.tmp');

    await writeFile(temporary, identity, { mode: 0o600, flag: 'wx', flush: true });

    try {
      await rename(temporary, selection);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  static migrationOwner(key: string): string {
    return 'runtime-' + createHash('sha256').update(key).digest('hex').slice(0, 24);
  }

  async verify(key: string): Promise<void> {
    const loaded = this.loaded.get(key);

    if (!loaded) {
      throw new Error('Runtime package is not installed');
    }
    if (loaded.manifest.collections.length) {
      await verifyMigrations(this.connection, path.join(loaded.directory, 'migrations'),
        AddonPackageRegistry.migrationOwner(key));
    }
  }

  async initialize(): Promise<void> {
    for (const addon of this.host.coordinatorOnly ? [] : this.staticAddons) {
      if (addon.cms) {
        if (!this.host.cms) {
          throw new Error('CMS API extension host is unavailable');
        }
        this.host.cms.register(addon.definition.addonKey, addon.cms);
      }
    }
    await this.refresh();
  }

  private refreshing: Promise<void> | null = null;

  async refresh(): Promise<void> {
    if (this.refreshing) {
      return this.refreshing;
    }

    const refresh = this.loadInstalledPackages();

    this.refreshing = refresh;

    try {
      await refresh;
    } finally {
      this.refreshing = null;
    }
  }

  private async loadInstalledPackages(): Promise<void> {
    const names = await readdir(this.root).catch((error: unknown) => {
      if (!missing(error)) {
        throw error;
      }

      return [];
    });

    for (const name of names.filter((name) => /^[a-z][a-z0-9-]{0,63}\.json$/.test(name)).sort()) {
      const state = packageObject(JSON.parse(await readFile(await checked(this.root, name), 'utf8')));

      if (
        typeof state.key !== 'string'
        || state.key + '.json' !== name
        || typeof state.digest !== 'string'
        || !/^[a-f0-9]{64}$/.test(state.digest)
      ) {
        throw new Error('Invalid installed package state');
      }

      const current = this.loaded.get(state.key);

      if (current && this.host.generationBound || current?.digest === state.digest) {
        continue;
      }
      if (current && !this.host.coordinatorOnly) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'An installed package version is immutable');
      }

      const directory = await checked(this.root, state.key + '/' + state.digest);
      const manifest = await AddonPackageRegistry.validateSnapshotPackage(directory, this.dumpMetadata(),
        !!this.host.coordinatorOnly);
      const update = await this.host.updateState?.(state.key);
      const paused = update?.paused === true && update.phase !== AddonUpdatePhase.Activating;

      if (
        manifest.authorization
        && !this.host.coordinatorOnly
        && !update
        && !await this.actionCatalog.confirmed(state.key, state.digest)
      ) {
        continue;
      }
      if (!paused && !this.host.coordinatorOnly && manifest.collections.length) {
        await verifyMigrations(this.connection, path.join(directory, 'migrations'),
          AddonPackageRegistry.migrationOwner(state.key));
      }

      const routeManifest = paused && update ? readAddonPackageManifest(JSON.parse(await readFile(
        await checked(this.root, state.key + '/' + update.toDigest + '/addon.runtime.json'), 'utf8'))) : manifest;
      const loaded = this.host.coordinatorOnly || paused
        ? await this.metadata(directory, manifest, paused ? routeManifest.routes ?? [] : [])
        : await this.load(directory, manifest);

      if (loaded.digest !== state.digest) {
        throw new Error('Installed package identity changed');
      }
      this.loaded.set(state.key, loaded);

      if (loaded.cms) {
        this.host.cms!.unregister(state.key);
        this.host.cms!.register(state.key, loaded.cms);
      }
      if (loaded.hooks) {
        await this.hookRegistry!.register(state.key, loaded.digest, loaded.hooks);
      }
    }
  }

  async notifyShutdown(addonKey: string, request: IAddonShutdownRequest): Promise<void> {
    await this.loaded.get(addonKey)?.running.notifyShutdown?.(request);
  }

  async shutdown(addonKey: string, request: IAddonShutdownRequest): Promise<void> {
    const item = this.loaded.get(addonKey);

    if (item) {
      await item.running.shutdown?.(request);
    }
  }

  async close(): Promise<void> {
    for (const item of this.loaded.values()) {
      await item.running.close?.();

      if (item.cms) {
        this.host.cms!.unregister(item.manifest.definition.addonKey);
      }
    }
  }
}
