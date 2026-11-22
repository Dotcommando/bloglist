import { BuiltInRoleId } from '../../../../domain/authorization/built-in-roles.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type {
  ICreateAdminUserFromConsole,
} from '../../../../ports/inbound/admin-users/create-admin-user-from-console.port.js';
import { readAdminUserCredentials } from './admin-user-credentials.parser.js';

export function readAdminCreationSiteId(args: readonly string[]): string | undefined {
  if (args.length === 0) {
    return undefined;
  }

  const [flag, siteId] = args;

  if (args.length !== 2 || flag !== '--site-id' || !siteId || !/^[A-Za-z0-9_-]{1,128}$/.test(siteId)) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Use --site-id with a valid site identifier');
  }

  return siteId;
}

export async function createAdminUserFromConsole(operation: ICreateAdminUserFromConsole,
  actorId: string, input: AsyncIterable<Uint8Array>, siteId?: string): Promise<string> {
  const credentials = await readAdminUserCredentials(input);
  const user = await operation.execute({
    actorId,
    ...credentials,
    ...(siteId === undefined ? {} : { assignment: { roleId: BuiltInRoleId.SiteAdmin, siteId } }),
  });

  return user.adminUserId;
}
