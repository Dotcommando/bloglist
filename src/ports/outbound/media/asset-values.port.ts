export interface IAssetValuesPort {
  nextId(): string;
  nextAssetVersion(): string;
  nextMetadataVersion(): string;
  now(): Date;
}
