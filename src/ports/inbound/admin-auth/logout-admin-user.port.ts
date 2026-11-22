export interface ILogoutAdminUserInput { readonly token: string | null; }

export interface ILogoutAdminUser { execute(input: ILogoutAdminUserInput): Promise<void>; }
