import type { IAddonConfiguration, ISiteAddonState } from '../../../domain/addons/site-addon.js';
import type { IGetSiteAddonInput } from './get-site-addon.port.js';

export interface IEnableSiteAddonInput extends IGetSiteAddonInput {
  readonly expectedVersion: string | null;
  readonly configuration: IAddonConfiguration;
}

export interface IEnableSiteAddon { execute(input: IEnableSiteAddonInput): Promise<ISiteAddonState>; }
