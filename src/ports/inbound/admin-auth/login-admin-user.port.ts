import type { IAdminLoginResult } from '../../../domain/admin-auth/admin-auth-session.js';

export interface ILoginAdminUserInput {
  readonly email: string;
  readonly password: string;
  readonly clientAddress: string | null;
  readonly userAgent: string | null;
}

export interface ILoginAdminUser {
  execute(input: ILoginAdminUserInput): Promise<IAdminLoginResult>;
}
