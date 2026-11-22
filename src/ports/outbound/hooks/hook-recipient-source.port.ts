import type { IHookDefinition, IHookHandlerVersion, IHookTree } from '../../../domain/hooks/hook.js';
import type { IHookRecipient } from '../../../domain/hooks/hook-execution.js';

export interface IHookAddonBinding {
  readonly definition: IHookDefinition | null;
  readonly recipient: IHookRecipient;
}

/** Reads current recipient inputs in one captured source context. */
export interface IHookRecipientSourcePort {
  tree(siteId: string): Promise<IHookTree>;
  version(siteId: string, versionId: string): Promise<IHookHandlerVersion | null>;
  addonEnabled(siteId: string, addonKey: string): Promise<boolean>;
  addons(siteId: string | null): Promise<readonly IHookAddonBinding[]>;
}
