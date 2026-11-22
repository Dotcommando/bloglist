import type { IncomingMessage, ServerResponse } from 'node:http';

import type { AddonValue, IAddonConfiguration, IAddonObject } from '@zarya/addon-contracts/addons';

import type { IConfigureSiteAddon } from '../../../../ports/inbound/addons/configure-site-addon.port.js';
import type { IDisableSiteAddon } from '../../../../ports/inbound/addons/disable-site-addon.port.js';
import type { IEnableSiteAddon } from '../../../../ports/inbound/addons/enable-site-addon.port.js';
import type { IGetSiteAddon } from '../../../../ports/inbound/addons/get-site-addon.port.js';
import type { IListSiteAddons } from '../../../../ports/inbound/addons/list-site-addons.port.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';

function jsonValue(value: unknown, depth = 0): value is AddonValue {
  return depth <= 16 && (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value)
    || Array.isArray(value) && value.every((child: unknown) => jsonValue(child, depth + 1))
    || jsonObject(value, depth));
}

function jsonObject(value: unknown, depth = 0): value is IAddonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key, child]) => !['__proto__', 'constructor', 'prototype'].includes(key)
      && jsonValue(child, depth + 1));
}

function configuration(value: unknown): IAddonConfiguration {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).some((key) => !['schemaVersion', 'values'].includes(key))
    || !('schemaVersion' in value)
    || typeof value.schemaVersion !== 'number'
    || !('values' in value)
    || !jsonObject(value.values)
  ) {
    throw new HttpFailure(400, 'Invalid configuration');
  }

  return { schemaVersion: value.schemaVersion, values: value.values };
}

export class AdminAddonsController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly list: IListSiteAddons, private readonly get: IGetSiteAddon,
    private readonly enable: IEnableSiteAddon, private readonly configure: IConfigureSiteAddon,
    private readonly disable: IDisableSiteAddon, private readonly hasMenuBadge: (key: string) => boolean,
    private readonly hasRuntimeAdminView: (key: string) => boolean = () => false,
    private readonly hasBoundAdminView: (key: string) => boolean = () => false) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return /^\/api\/admin\/sites\/[^/]+\/addons(?:\/|$)/.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const match = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/addons(?:\/([a-z][a-z0-9-]{0,63})(?:\/(enable|configuration|disable))?)?$/.exec(target);

      if (!match?.[1]) {
        throw new HttpFailure(400, 'Invalid add-on route');
      }
      this.boundary.method(request, response, match[3] ? 'POST' : 'GET');
      const { user } = await this.current.execute({ token: this.boundary.token(request) });
      const input = { siteId: match[1], actorId: user.adminUserId, addonKey: match[2] ?? '' };

      if (!match[2]) {
        const items = await this.list.execute(input);

        sendJson(response, 200, {
          items: items.map((item) => ({
            ...item,
            ...(this.hasMenuBadge(item.addonKey) ? { menuBadge: true } : {}),
            ...(item.definition && !this.hasBoundAdminView(item.addonKey)
              && (item.definition.adminMenu || item.definition.adminComponentId !== null
              || this.hasRuntimeAdminView(item.addonKey)) ? { adminScreenPermissionsMissing: true } : {}),
            connection: item.connection ? {
              adminMenuLabels: item.connection.configuration.values.adminMenuLabels ?? null,
              siteAddonId: item.connection.siteAddonId,
              status: item.connection.status,
              version: item.connection.version,
              updatedAt: item.connection.updatedAt,
            } : null,
          })),
        });
      } else if (!match[3]) {
        sendJson(response, 200, await this.get.execute(input));
      } else {
        const body = await readAdminBody(request, 16384);
        const fields = match[3] === 'disable' ? ['expectedVersion'] : ['expectedVersion', 'configuration'];

        if (
          Object.keys(body).some((key) => !fields.includes(key))
          || body.expectedVersion !== null
          && typeof body.expectedVersion !== 'string'
          || typeof body.expectedVersion === 'string'
          && (!body.expectedVersion
          || body.expectedVersion.length > 256)
        ) {
          throw new HttpFailure(400, 'Invalid command fields');
        }
        if (match[3] === 'enable') {
          sendJson(response, 200, await this.enable.execute({
            ...input, expectedVersion: body.expectedVersion, configuration: configuration(body.configuration),
          }));
        } else {
          if (typeof body.expectedVersion !== 'string') {
            throw new HttpFailure(400, 'expectedVersion is required');
          }
          sendJson(response, 200, match[3] === 'disable'
            ? await this.disable.execute({ ...input, expectedVersion: body.expectedVersion })
            : await this.configure.execute({
              ...input, expectedVersion: body.expectedVersion, configuration: configuration(body.configuration),
            }));
        }
      }
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
