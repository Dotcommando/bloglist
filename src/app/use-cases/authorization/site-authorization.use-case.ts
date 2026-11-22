import type { ISiteAuthorizationView } from '../../../domain/authorization/action-catalog.js';
import { hasAdministratorGrant } from '../../../domain/authorization/admin-authorization.js';
import { BuiltInRoleId } from '../../../domain/authorization/built-in-roles.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type {
  ISiteAuthorization, ISiteAuthorizationInput,
} from '../../../ports/inbound/authorization/site-authorization.port.js';
import type { ISiteAuthorizationStore } from '../../../ports/outbound/authorization/site-authorization-store.port.js';

export class SiteAuthorizationUseCase implements ISiteAuthorization {
  constructor(private readonly store: ISiteAuthorizationStore) {}

  async read(input: ISiteAuthorizationInput): Promise<ISiteAuthorizationView> {
    this.requireSiteAdmin(input, 'cms.authorization.read');

    return this.store.read(input.siteId, input.authority?.systemAdmin === true);
  }

  async save(input: Parameters<ISiteAuthorization['save']>[0]): Promise<ISiteAuthorizationView> {
    this.requireSiteAdmin(input, 'cms.authorization.save');

    if (input.role?.roleId === BuiltInRoleId.SystemAdmin || input.role?.roleId === BuiltInRoleId.SiteAdmin) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Built-in administrator roles are read-only');
    }
    requireCondition(input.actionIds.length <= 256 && new Set(input.actionIds).size === input.actionIds.length,
      'Invalid or duplicate permission actions');

    requireCondition(!input.role || !('remove' in input.role) || input.actionIds.length === 0,
      'Role removal cannot carry permission actions');

    requireCondition(!input.group || !input.role && input.actionIds.length === 0,
      'Group changes are independent of role permissions');

    return this.store.save(input.siteId, input.actorId, input.revision,
      input.actionIds, input.objectScopes ?? {}, input.role, input.group);
  }

  async setContentGroup(input: Parameters<ISiteAuthorization['setContentGroup']>[0]): Promise<void> {
    this.requireSiteAdmin(input, 'cms.authorization.set-content-group');
    await this.store.setContentGroup(input.siteId, input.actorId, input);
  }

  private requireSiteAdmin(input: ISiteAuthorizationInput, actionId: string): void {
    if (!input.authority || !hasAdministratorGrant(input.authority, actionId, input.siteId)) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Site administrator required');
    }
  }
}
