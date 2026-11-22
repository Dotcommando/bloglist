import type { IAdminSessionInput } from './admin-session.dto.js';

export interface IRevokeAdminAuthSessionInput extends IAdminSessionInput { readonly sessionId: string; }

export interface IRevokeAdminAuthSessionResult { readonly currentSessionRevoked: boolean; }

export interface IRevokeAdminAuthSession {
  execute(input: IRevokeAdminAuthSessionInput): Promise<IRevokeAdminAuthSessionResult>;
}
