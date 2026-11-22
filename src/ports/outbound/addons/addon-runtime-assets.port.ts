import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface IAddonRuntimeView {
  readonly digest: string;
  readonly entry: string | null;
  readonly styles: readonly string[];
}

export interface IAddonRuntimeAssets {
  view(addonKey: string): IAddonRuntimeView | null;
  read(addonKey: string, digest: string, asset: string): Promise<IBinaryContent>;
}
