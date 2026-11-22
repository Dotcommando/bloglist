import type { ISiteAddonView } from '../../../domain/addons/site-addon.js';
import type { IListSiteAddonsInput } from './list-site-addons.port.js';

export interface IGetSiteAddonInput extends IListSiteAddonsInput { readonly addonKey: string; }

export interface IGetSiteAddon { execute(input: IGetSiteAddonInput): Promise<ISiteAddonView>; }
