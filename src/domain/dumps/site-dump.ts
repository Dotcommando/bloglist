import { requireCondition } from '../shared/validation.js';

export enum SiteDumpType {
  Site = 'Site', Snippets = 'Snippets', Chunks = 'Chunks', Templates = 'Templates',
  Addons = 'Addons', Files = 'Files', Installation = 'Installation', Unknown = 'Unknown',
}

export interface ISiteDump {
  readonly type: SiteDumpType;
  readonly filename: string;
  readonly byteSize: number;
  readonly createdAt: Date;
}

export enum DumpItemAction { Create = 'Create', Replace = 'Replace', ChooseTarget = 'ChooseTarget' }

export interface IAddonDumpParts {
  readonly configuration: boolean;
  readonly businessData: boolean;
  readonly package: boolean;
}

export interface IDumpItem {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly action?: DumpItemAction;
  readonly targetId?: string | null;
  readonly targets?: readonly { readonly id: string; readonly key: string; readonly name: string }[];
}

export interface IDumpPageReference { readonly pageId: string; readonly title: string; }

export interface ISiteDumpReview {
  readonly type: SiteDumpType;
  readonly items: readonly IDumpItem[];
  readonly version: string;
  readonly pages: readonly IDumpPageReference[];
  readonly targetPages: readonly IDumpPageReference[];
  readonly addonParts?: IAddonDumpParts;
}

export interface ISiteDumpCreation {
  readonly type: SiteDumpType;
  readonly itemIds?: readonly string[];
  readonly addonParts?: IAddonDumpParts;
}

export interface ISiteDumpApplication {
  readonly version: string;
  readonly choices: readonly { readonly id: string; readonly targetId: string | null }[];
  readonly pageMappings?: Readonly<Record<string, string>>;
  readonly addonParts?: IAddonDumpParts;
}

export const siteDumpFilename = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[a-f0-9-]{36}\.jsonl\.gz$/;

export function requireDumpFilename(filename: string): void {
  requireCondition(siteDumpFilename.test(filename), 'Invalid dump filename');
}
