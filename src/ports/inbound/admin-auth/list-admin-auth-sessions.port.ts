import type { IAdminAuthSessionProfile } from '../../../domain/admin-auth/admin-auth-session.js';
import type { ICursorPage } from '../../../domain/shared/cursor-page.js';
import type { IAdminSessionInput } from './admin-session.dto.js';

export interface IListAdminAuthSessionsInput extends IAdminSessionInput {
  readonly limit?: number;
  readonly cursor?: string | null;
}

export interface IListAdminAuthSessions {
  execute(input: IListAdminAuthSessionsInput): Promise<ICursorPage<IAdminAuthSessionProfile>>;
}
