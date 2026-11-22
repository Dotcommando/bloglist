export interface ICmsBuildInfo {
  readonly version: string;
  readonly commit: string | null;
  readonly checksum: string | null;
}

declare const __CMS_BUILD_INFO__: ICmsBuildInfo;

export const cmsBuildInfo: ICmsBuildInfo = Object.freeze(__CMS_BUILD_INFO__);
