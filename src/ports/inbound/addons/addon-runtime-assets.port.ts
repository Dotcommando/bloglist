import type { IBinaryContent } from '../../../domain/shared/binary-content.js';
import type { IAddonRuntimeView } from '../../outbound/addons/addon-runtime-assets.port.js';

export interface IAddonRuntimeScope { readonly siteId: string; readonly actorId: string; readonly addonKey: string; }

export interface IGetAddonRuntimeView { execute(input: IAddonRuntimeScope): Promise<IAddonRuntimeView | null>; }

export interface IGetAddonRuntimeAsset {
  execute(input: IAddonRuntimeScope & { readonly digest: string; readonly asset: string }): Promise<IBinaryContent>;
}
