import type { IncomingMessage, ServerResponse } from 'node:http';

import { BuiltInAdminGroupId, BuiltInRoleId } from '../../../../domain/authorization/built-in-roles.js';
import { isObjectScope, type ObjectGrants, type ObjectScope } from '../../../../domain/authorization/content-access.js';
import type { SiteGroupChange, SiteRoleChange } from '../../../../domain/authorization/site-role.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { ISiteAuthorization } from '../../../../ports/inbound/authorization/site-authorization.port.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAccessGroupId, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';

const route = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/access(?:\/(object-group))?$/;

function readDirectoryChange(value: unknown, idField: 'roleId' | 'groupId'): SiteRoleChange {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpFailure(400, 'Validation');
  }

  const { [idField]: roleId, remove, key, name, description, actorIds, ...unknown } =
    Object.fromEntries(Object.entries(value));

  if (
    idField === 'roleId'
    && (roleId === BuiltInRoleId.SystemAdmin
    || roleId === BuiltInRoleId.SiteAdmin)
    || idField === 'groupId'
    && (roleId === BuiltInAdminGroupId.Global
    || roleId === BuiltInAdminGroupId.Site)
  ) {
    throw new HttpFailure(403, 'Forbidden');
  }

  const wellFormedId = typeof roleId === 'string' && /^[a-f0-9-]{36}$/.test(roleId);

  if (Object.keys(unknown).length > 0 || roleId !== null && !wellFormedId) {
    throw new HttpFailure(400, 'Validation');
  }
  if (remove === true && wellFormedId && Object.keys(value).length === 2) {
    return { roleId, remove };
  }
  if (
    remove !== undefined
    || typeof key !== 'string'
    || !/^[a-z][a-z0-9-]{0,63}$/.test(key)
    || typeof name !== 'string'
    || !name.trim()
    || name.length > 160
    || typeof description !== 'string'
    || !description.trim()
    || description.length > 8192
    || !Array.isArray(actorIds)
    || actorIds.length > 256
    || !actorIds.every((actor) => typeof actor === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(actor))
    || new Set(actorIds).size !== actorIds.length
  ) {
    throw new HttpFailure(400, 'Validation');
  }

  return { roleId: wellFormedId ? roleId : null, key, name: name.trim(), description: description.trim(), actorIds };
}

function readGroupChange(value: unknown): SiteGroupChange {
  const change = readDirectoryChange(value, 'groupId');

  if ('remove' in change) {
    return { groupId: change.roleId, remove: true };
  }

  const { roleId: groupId, ...details } = change;

  return { groupId, ...details };
}

function readObjectGrants(value: unknown, actionIds: readonly string[]): ObjectGrants {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpFailure(400, 'Validation');
  }

  const grants: [string, readonly ObjectScope[]][] = [];

  for (const [actionId, scopes] of Object.entries(value)) {
    if (
      !actionIds.includes(actionId)
      || !Array.isArray(scopes)
      || scopes.length < 1
      || scopes.length > 2
      || !scopes.every(isObjectScope)
      || new Set(scopes).size !== scopes.length
      || scopes.includes('all')
      && scopes.length !== 1
    ) {
      throw new HttpFailure(400, 'Validation');
    }
    grants.push([actionId, scopes]);
  }

  return Object.fromEntries(grants);
}

export class AdminSiteAuthorizationController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser,
    private readonly operations: ISiteAuthorization) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return route.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const match = route.exec(this.boundary.check(request, response));
      const siteId = match?.[1];

      if (!siteId) {
        throw new HttpFailure(404, 'NotFound');
      }

      const { user } = await this.current.execute({ token: this.boundary.token(request) });
      const input = { actorId: user.adminUserId, authority: user.authorization, siteId };

      if (match?.[2]) {
        this.boundary.method(request, response, 'POST');
        const { domain, objectId, accessGroupId: rawGroupId, ...extra } = await readAdminBody(request, 4096);
        const accessGroupId = readAccessGroupId(rawGroupId);

        if (
          Object.keys(extra).length
          || domain !== 'pages'
          && domain !== 'chunks'
          && domain !== 'snippets'
          || typeof objectId !== 'string'
          || !/^[A-Za-z0-9_.-]{1,256}$/.test(objectId)
          || accessGroupId === undefined
        ) {
          throw new HttpFailure(400, 'Validation');
        }
        await this.operations.setContentGroup({ ...input, domain, objectId, accessGroupId });
        sendJson(response, 200, { ok: true });

        return;
      }
      if (request.method === 'GET') {
        sendJson(response, 200, await this.operations.read(input));

        return;
      }
      this.boundary.method(request, response, 'POST');
      const { revision, actionIds, objectScopes, role, group, ...extra } = await readAdminBody(request, 65536);

      if (
        Object.keys(extra).length > 0
        || revision !== null
        && (typeof revision !== 'string'
        || !/^[a-f0-9-]{36}$/.test(revision))
        || !Array.isArray(actionIds)
        || !actionIds.every((id) => typeof id === 'string' && /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(id))
      ) {
        throw new HttpFailure(400, 'Validation');
      }
      sendJson(response, 200, await this.operations.save({
        ...input,
        revision,
        actionIds,
        ...(objectScopes === undefined ? {} : { objectScopes: readObjectGrants(objectScopes, actionIds) }),
        ...(role === undefined ? {} : { role: readDirectoryChange(role, 'roleId') }),
        ...(group === undefined ? {} : { group: readGroupChange(group) }),
      }));
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
