import type { IAddonInstallation } from '../../../domain/addons/addon-installation.js';

export interface IListAddonInstallationsInput { readonly siteId: string; readonly actorId: string; }

export interface IListAddonInstallations {
  execute(input: IListAddonInstallationsInput): Promise<readonly IAddonInstallation[]>;
}
