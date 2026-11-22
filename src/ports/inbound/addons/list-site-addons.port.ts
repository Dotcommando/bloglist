import type { ISiteAddonView } from '../../../domain/addons/site-addon.js';

export interface IListSiteAddonsInput { readonly siteId: string; readonly actorId: string; }

export interface IListSiteAddons {
  execute(input: IListSiteAddonsInput): Promise<readonly ISiteAddonView[]>;
}
