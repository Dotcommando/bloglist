import type { IAddonConfiguration, IAddonDefinition } from '../../../domain/addons/site-addon.js';

export interface IAddonCatalogPort {
  list(): readonly IAddonDefinition[];
  find(addonKey: string): IAddonDefinition | null;
  validate(addonKey: string, configuration: IAddonConfiguration): void;
}
