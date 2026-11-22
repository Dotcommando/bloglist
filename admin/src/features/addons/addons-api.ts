import type { AddonValue, IAddonConfiguration, IAddonDefinition, IAddonWorkspaceView }
  from '@zarya/addon-contracts/addons';

import { object, request, string } from '../../shared/api/content-api';

export interface IAddonWorkspace extends IAddonWorkspaceView {
  readonly menuBadge: boolean;
}

interface IAddonWorkspaces {
  readonly items: readonly IAddonWorkspace[];
  readonly timeZone: string | null;
}

export async function listAddonWorkspaces(siteId: string): Promise<IAddonWorkspaces> {
  const { items, timeZone } = object(await request('/' + siteId + '/addon-workspaces'));

  if (!Array.isArray(items)) {
    throw new Error('Invalid add-on workspaces');
  }

  const views = items.map((item: unknown) => {
    const row = object(item);
    const label = object(row.label);

    if (!Array.isArray(row.views) || !Array.isArray(row.actionIds) || !Array.isArray(row.styles)) {
      throw new Error('Invalid add-on workspace');
    }

    return {
      addonKey: string(row.addonKey),
      label: { en: string(label.en), ru: string(label.ru) },
      views: row.views.map(string),
      actionIds: row.actionIds.map(string),
      digest: string(row.digest),
      entry: string(row.entry),
      styles: row.styles.map(string),
      enabled: row.enabled === true,
      menuBadge: row.menuBadge === true,
    };
  });

  return { items: views, timeZone: timeZone === null ? null : string(timeZone) };
}

export interface IAddonEntry {
  readonly addonKey: string;
  readonly definition: IAddonDefinition | null;
  readonly menuBadge: boolean;
  readonly adminScreenPermissionsMissing: boolean;
  readonly connection: {
    readonly adminMenuLabels?: { en?: string; ru?: string };
    readonly status: string;
    readonly version: string;
  } | null;
}

export enum AddonInstallationStatus { Pending = 'Pending', Installed = 'Installed' }

export interface IAddonInstallationSummary {
  readonly addonKey: string;
  readonly repositoryUrl: string;
  readonly releaseTag: string;
  readonly implementationVersion: string;
  readonly status: AddonInstallationStatus;
}

function installation(value: unknown): IAddonInstallationSummary {
  const row = object(value);
  const status = Object.values(AddonInstallationStatus).find((candidate) => candidate === row.status);

  if (!status) {
    throw new Error('Invalid package installation state');
  }

  return {
    addonKey: string(row.addonKey),
    repositoryUrl: string(row.repositoryUrl),
    releaseTag: string(row.releaseTag),
    implementationVersion: string(row.implementationVersion),
    status,
  };
}

export async function listAddonInstallations(siteId: string): Promise<readonly IAddonInstallationSummary[]> {
  const result = object(await request('/' + siteId + '/addon-installations'));

  if (!Array.isArray(result.items)) {
    throw new Error('Invalid installation list');
  }

  return result.items.map(installation);
}

export async function installAddonRepository(siteId: string, repositoryUrl: string, installedAddonKey?: string):
Promise<IAddonInstallationSummary> {
  return installation(await request('/' + siteId + '/addon-installations', {
    repositoryUrl, ...(installedAddonKey ? { installedAddonKey } : {}),
  }, 120000));
}

function definition(value: unknown): IAddonDefinition | null {
  if (value === null) {
    return null;
  }

  const row = object(value);
  const name = object(row.name);
  const description = object(row.description);

  if (
    row.contractVersion !== 1
    || typeof row.implementationVersion !== 'string'
    || typeof row.configurationSchemaVersion !== 'number'
    || !Array.isArray(row.snippetIds)
    || row.adminComponentId !== null
    && typeof row.adminComponentId !== 'string'
  ) {
    throw new Error('Invalid add-on definition');
  }

  return {
    ...(row.adminMenu ? {
      adminMenu: { en: string(object(row.adminMenu).en), ru: string(object(row.adminMenu).ru) },
    } : {}),
    addonKey: string(row.addonKey),
    name: { en: string(name.en), ru: string(name.ru) },
    description: { en: string(description.en), ru: string(description.ru) },
    contractVersion: 1,
    implementationVersion: row.implementationVersion,
    configurationSchemaVersion: row.configurationSchemaVersion,
    adminComponentId: row.adminComponentId,
    snippetIds: row.snippetIds.map(string),
  };
}

export async function listSiteAddons(siteId: string): Promise<readonly IAddonEntry[]> {
  const result = object(await request('/' + siteId + '/addons'));

  if (!Array.isArray(result.items)) {
    throw new Error('Invalid add-on list');
  }

  return result.items.map((value: unknown) => {
    const row = object(value);
    const connection = row.connection === null ? null : object(row.connection);

    return {
      addonKey: string(row.addonKey),
      definition: definition(row.definition),
      menuBadge: row.menuBadge === true,
      adminScreenPermissionsMissing: row.adminScreenPermissionsMissing === true,
      connection: connection ? {
        status: string(connection.status),
        version: string(connection.version),
        adminMenuLabels: readMenuLabels(connection.adminMenuLabels),
      } : null,
    };
  });
}

export async function getAddonMenuBadge(siteId: string, addonKey: string): Promise<number> {
  const { count } = object(await request('/' + siteId + '/' + addonKey + '/menu-badge', undefined, 7000));

  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Invalid add-on menu count');
  }

  return count;
}

function readMenuLabels(value: unknown): { en?: string; ru?: string } {
  if (value === undefined || value === null) {
    return {};
  }

  const labels = object(value);

  return {
    ...(typeof labels.en === 'string' && labels.en.trim() ? { en: labels.en.trim() } : {}),
    ...(typeof labels.ru === 'string' && labels.ru.trim() ? { ru: labels.ru.trim() } : {}),
  };
}

function addonValue(value: unknown): AddonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
    && Number.isFinite(value)
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(addonValue);
  }

  return Object.fromEntries(Object.entries(object(value)).map(([key, item]) => [key, addonValue(item)]));
}

export function readAddonConfiguration(value: unknown): IAddonConfiguration {
  const row = object(value);

  if (typeof row.schemaVersion !== 'number' || !Number.isSafeInteger(row.schemaVersion) || row.schemaVersion < 1) {
    throw new Error('Invalid add-on configuration');
  }

  return {
    schemaVersion: row.schemaVersion,
    values: Object.fromEntries(Object.entries(object(row.values)).map(([key, value]) => [key, addonValue(value)])),
  };
}
