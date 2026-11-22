import type { AssetVisibility } from '../../../domain/media/asset.js';
import type { IBinaryContent, IContentReference } from '../../../domain/shared/binary-content.js';

export enum AssetContentRole {
  Original = 'Original',
  Derivative = 'Derivative',
}

export interface IWriteAssetContentBase {
  readonly siteId: string;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly content: IBinaryContent;
}

export interface IWriteOriginalContent extends IWriteAssetContentBase {
  readonly role: AssetContentRole.Original;
  readonly visibility: AssetVisibility.Private;
}

export interface IWriteDerivativeContent extends IWriteAssetContentBase {
  readonly role: AssetContentRole.Derivative;
  readonly variantId: string;
  readonly visibility: AssetVisibility;
}

export type WriteAssetContent = IWriteOriginalContent | IWriteDerivativeContent;

export interface IAssetStoragePort {
  assertOwned(siteId: string, assetId: string, assetVersion: string, reference: IContentReference): Promise<void>;
  write(input: WriteAssetContent): Promise<IContentReference>;
  read(siteId: string, reference: IContentReference): Promise<IBinaryContent | null>;
  delete(siteId: string, reference: IContentReference): Promise<void>;
}
