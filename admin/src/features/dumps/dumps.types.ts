export enum DumpType {
  Site = 'Site', Snippets = 'Snippets', Chunks = 'Chunks', Templates = 'Templates',
  Addons = 'Addons', Files = 'Files', Unknown = 'Unknown',
}

export interface IAddonDumpParts { readonly configuration: boolean;
  readonly businessData: boolean;
  readonly package: boolean; }

export interface IDumpChoice {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly action?: string;
  readonly targetId?: string | null;
  readonly targets?: readonly { readonly id: string; readonly key: string; readonly name: string }[];
  readonly unresolvedFileReferences?: number;
}

export interface IDumpReview {
  readonly type: DumpType;
  readonly version: string;
  readonly items: readonly IDumpChoice[];
  readonly pages: readonly { readonly pageId: string; readonly title: string }[];
  readonly targetPages: readonly { readonly pageId: string; readonly title: string }[];
  readonly addonParts?: IAddonDumpParts;
  readonly allowFileOmission?: boolean;
}

export interface IDumpCreation {
  readonly type: DumpType; readonly itemIds?: readonly string[]; readonly addonParts?: IAddonDumpParts;
}

export interface IDumpApplication {
  readonly version: string;
  readonly choices: readonly { readonly id: string; readonly targetId: string | null }[];
  readonly pageMappings?: Readonly<Record<string, string>>;
  readonly addonParts?: IAddonDumpParts;
  readonly omitUnresolvedFiles?: boolean;
}
