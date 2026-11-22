import type { ISiteAddonState } from '../../../domain/addons/site-addon.js';
import type { IEnableSiteAddonInput } from './enable-site-addon.port.js';

export interface IConfigureSiteAddonInput extends IEnableSiteAddonInput { readonly expectedVersion: string; }

export interface IConfigureSiteAddon { execute(input: IConfigureSiteAddonInput): Promise<ISiteAddonState>; }
