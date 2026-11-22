export interface IAdminAuthorization {
  readonly systemAdmin: boolean;
  readonly siteAdminSiteIds: readonly string[];
  readonly systemActionIds?: readonly string[];
  readonly siteAdminActionIds?: readonly string[];
  readonly siteGrants?: readonly { siteId: string; actionIds: readonly string[] }[];
}

export class AuthRequestError extends Error {
  constructor(readonly status: number, readonly retryAfter: number | null) {
    super('Authentication request failed');
  }
}

export async function authRequest(action: AuthOperation, credentials?: {
  readonly email: string;
  readonly password: string;
}, signal?: AbortSignal): Promise<IAdminAuthorization> {
  const response = await fetch('/api/admin/auth/' + action, {
    method: action === AuthOperation.Current ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'X-Zarya-Admin': '1',
      ...(credentials ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(credentials ? { body: JSON.stringify(credentials) } : {}),
    signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
  });

  if (!response.ok) {
    const retry = Number(response.headers.get('Retry-After'));

    throw new AuthRequestError(response.status, Number.isFinite(retry) && retry > 0 ? retry : null);
  }

  const payload: unknown = await response.json();
  const user = payload && typeof payload === 'object' && 'user' in payload ? payload.user : null;
  const authority = user && typeof user === 'object' && 'authorization' in user ? user.authorization : null;
  const siteGrants = authority && typeof authority === 'object' && 'siteGrants' in authority
    && Array.isArray(authority.siteGrants) ? authority.siteGrants : [];

  return {
    siteGrants: siteGrants.flatMap((grant: unknown) => {
      if (
        !grant
        || typeof grant !== 'object'
        || !('siteId' in grant)
        || typeof grant.siteId !== 'string'
        || !('actionIds' in grant)
        || !Array.isArray(grant.actionIds)
      ) {
        return [];
      }

      return [{
        siteId: grant.siteId,
        actionIds: grant.actionIds.filter((id: unknown): id is string => typeof id === 'string'),
      }];
    }),
    systemAdmin: !!authority && typeof authority === 'object' && 'systemAdmin' in authority
      && authority.systemAdmin === true,
    systemActionIds: authority && typeof authority === 'object' && 'systemActionIds' in authority
      && Array.isArray(authority.systemActionIds)
      ? authority.systemActionIds.filter((id: unknown): id is string => typeof id === 'string') : [],
    siteAdminActionIds: authority && typeof authority === 'object' && 'siteAdminActionIds' in authority
      && Array.isArray(authority.siteAdminActionIds)
      ? authority.siteAdminActionIds.filter((id: unknown): id is string => typeof id === 'string') : [],
    siteAdminSiteIds: authority && typeof authority === 'object' && 'siteAdminSiteIds' in authority
      && Array.isArray(authority.siteAdminSiteIds)
      ? authority.siteAdminSiteIds.filter((siteId: unknown): siteId is string => typeof siteId === 'string') : [],
  };
}

export enum AuthOperation {
  Current = 'me',
  Login = 'login',
}
