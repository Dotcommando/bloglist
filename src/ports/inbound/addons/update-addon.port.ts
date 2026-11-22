import type { IAddonUpdateState } from '../../../domain/addons/addon-update.js';

export interface IUpdateAddon {
  execute(input: { readonly updateId: string; readonly actorId: string }): Promise<IAddonUpdateState>;
}
