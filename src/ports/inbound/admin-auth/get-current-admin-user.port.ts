import type { ICurrentAdminUser } from '../../../domain/admin-auth/admin-auth-session.js';
import type { IAdminSessionInput } from './admin-session.dto.js';

export interface IGetCurrentAdminUser { execute(input: IAdminSessionInput): Promise<ICurrentAdminUser>; }
