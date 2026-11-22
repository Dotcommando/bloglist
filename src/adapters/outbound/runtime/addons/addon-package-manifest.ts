import { AddonUpdateMode } from '../../../../domain/addons/addon-update.js';
import type { IAddonDefinition } from '../../../../domain/addons/site-addon.js';
import { readAddonAuthorization } from './addon-authorization-manifest.js';
import type { IAddonCollectionTransfer, IAddonPackageManifest } from './addon-package.types.js';

export function packageObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid add-on object');
  }

  return Object.fromEntries(Object.entries(value));
}

export function packageText(value: unknown): string {
  if (typeof value !== 'string' || !value.length) {
    throw new Error('Invalid add-on string');
  }

  return value;
}

export function readAddonDefinition(value: unknown): IAddonDefinition {
  const item = packageObject(value);
  const translated = (value: unknown): { en: string; ru: string } => {
    const text = packageObject(value);

    return { en: packageText(text.en), ru: packageText(text.ru) };
  };

  if (
    item.contractVersion !== 1
    || typeof item.configurationSchemaVersion !== 'number'
    || !Number.isSafeInteger(item.configurationSchemaVersion)
    || item.configurationSchemaVersion < 1
    || !Array.isArray(item.snippetIds)
    || !/^[a-z][a-z0-9-]{0,63}$/.test(packageText(item.addonKey))
    || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(packageText(item.implementationVersion))
  ) {
    throw new Error('Unsupported add-on definition');
  }

  const snippets: unknown[] = item.snippetIds;

  return {
    addonKey: packageText(item.addonKey),
    name: translated(item.name),
    description: translated(item.description),
    contractVersion: 1,
    configurationSchemaVersion: item.configurationSchemaVersion,
    implementationVersion: packageText(item.implementationVersion),
    adminComponentId: item.adminComponentId === null ? null : packageText(item.adminComponentId),
    snippetIds: snippets.map(packageText),
    ...(item.adminMenu === undefined ? {} : { adminMenu: translated(item.adminMenu) }),
  };
}

export function readTransferCollections(value: unknown): readonly IAddonCollectionTransfer[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid add-on collections');
  }

  const values: unknown[] = value;
  const result = values.map((value): IAddonCollectionTransfer => {
    const item = packageObject(value);
    const name = packageText(item.name);

    if (
      !/^[a-z][a-z0-9_]*$/.test(name)
      || !Array.isArray(item.references)
      || item.idFormat !== undefined
      && item.idFormat !== 'sha256'
    ) {
      throw new Error('Invalid collection transfer');
    }

    const references: unknown[] = item.references;

    return {
      name,
      ...(item.idFormat === 'sha256' ? { idFormat: 'sha256' } : {}),
      references: references.map((value) => {
        const ref = packageObject(value);
        const target = packageText(ref.collection);
        const field = packageText(ref.path);

        if (
          !/^[a-z][a-z0-9_]*$/.test(target)
          || !/^[A-Za-z_][A-Za-z0-9_]*(?:\.(?:[A-Za-z_][A-Za-z0-9_]*|\*))*$/.test(field)
          || field.split('.').some((part) => ['__proto__', 'constructor', 'prototype'].includes(part))
        ) {
          throw new Error('Invalid reference field');
        }

        return { collection: target, path: field };
      }),
    };
  });

  if (
    new Set(result.map((item) => item.name)).size !== result.length
    || result.some((item) => item.references.some((ref) => ref.collection !== 'pages'
      && !result.some((owner) => owner.name === ref.collection)))
  ) {
    throw new Error('Unknown collection reference');
  }

  return result;
}

import { readCalibrationQueries } from './addon-calibration-queries.js';

export function readAddonPackageManifest(value: unknown): IAddonPackageManifest {
  const item = packageObject(value);

  if (
    item.format !== 'zarya-addon'
    || item.version !== 1
    || !Array.isArray(item.styles)
    || item.cmsVersion !== undefined
    && (typeof item.cmsVersion !== 'string'
      || !/^\d+\.\d+\.\d+$/.test(item.cmsVersion))
  ) {
    throw new Error('Unsupported add-on package');
  }

  const styles: unknown[] = item.styles;
  const definition = readAddonDefinition(item.definition);
  const routes: string[] = [];

  if (item.routes !== undefined) {
    if (!Array.isArray(item.routes) || item.routes.length > 32) {
      throw new Error('Invalid runtime routes');
    }

    for (const route of item.routes) {
      if (
        typeof route !== 'string'
        || route.length > 512
        || !/^\/api\/(?:[a-z][a-z0-9-]*|:[A-Za-z][A-Za-z0-9]*)(?:\/(?:[a-z][a-z0-9-]*|:[A-Za-z][A-Za-z0-9]*))*$/.test(route)
        || /^\/api\/health(?:\/|$)/.test(route)
        || /^\/api\/admin(?:$|\/(?:auth|installation|addon-updates|addons)(?:\/|$))/.test(route)
        || /^\/api\/admin\/sites(?:\/:[A-Za-z][A-Za-z0-9]*)?$/.test(route)
      ) {
        throw new Error('Invalid runtime route prefix');
      }
      routes.push(route);
    }
  }

  const update = item.update === undefined ? undefined : packageObject(item.update);
  const mode = update ? Object.values(AddonUpdateMode).find(value => value === update.mode) : undefined;

  if (update && (!mode || typeof update.fromVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(update.fromVersion))) {
    throw new Error('Invalid runtime update declaration');
  }

  const files = Object.fromEntries(Object.entries(packageObject(item.files)).map(([name, digest]) => {
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error('Invalid package digest');
    }

    return [name, digest];
  }));
  const dependencies = Object.fromEntries(Object.entries(packageObject(item.dependencies)).map(([name, version]) => {
    if (
      !/^(@[a-z0-9_-]+\/)?[a-z0-9_-]+$/.test(name)
      || typeof version !== 'string'
      || !/^\d+\.\d+\.\d+$/.test(version)
    ) {
      throw new Error('Unpinned host dependency');
    }

    return [name, version];
  }));

  return {
    format: 'zarya-addon',
    version: 1,
    ...(typeof item.cmsVersion === 'string' ? { cmsVersion: item.cmsVersion } : {}),
    definition,
    ...(item.routes !== undefined ? { routes } : {}),
    ...(item.authorization === undefined ? {} : {
      authorization: readAddonAuthorization(item.authorization, definition.addonKey, routes),
    }),
    ...(item.calibrationQueries === undefined ? {} : {
      calibrationQueries: readCalibrationQueries(item.calibrationQueries),
    }),
    ...(update && mode && typeof update.fromVersion === 'string'
      ? { update: { fromVersion: update.fromVersion, mode } } : {}),
    collections: readTransferCollections(item.collections),
    files,
    serverEntry: packageText(item.serverEntry),
    adminEntry: item.adminEntry === null ? null : packageText(item.adminEntry),
    styles: styles.map(packageText),
    dependencies,
  };
}
