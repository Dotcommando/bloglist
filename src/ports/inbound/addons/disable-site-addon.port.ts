import type { ISiteAddonState } from '../../../domain/addons/site-addon.js';
import type { IGetSiteAddonInput } from './get-site-addon.port.js';

export interface IDisableSiteAddonInput extends IGetSiteAddonInput { readonly expectedVersion: string; }

export interface IDisableSiteAddon { execute(input: IDisableSiteAddonInput): Promise<ISiteAddonState>; }
