import type { IncomingMessage, ServerResponse } from 'node:http';

import type { IAddonAuthorizationDeclaration, IAddonOperationPolicyPort, IAddonShutdownContext, IAddonShutdownRequest }
  from '@zarya/addon-contracts/addons';
import type { ICmsAddonApiHost, ICmsAddonExtension } from '@zarya/addon-contracts/cms-extensions';
import type { IAddonHooksExtension, IHookCommitIntent, IHookSourcePort } from '@zarya/addon-contracts/hooks';
import type { Connection } from 'mongoose';
import type { ClientSession } from 'mongoose';

import type { AddonUpdateMode, IAddonUpdateState } from '../../../../domain/addons/addon-update.js';
import type { IAddonConfiguration, IAddonDefinition } from '../../../../domain/addons/site-addon.js';
import type { ICalibrationAddonQuery } from '../../../../domain/calibration/calibration-addon.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IResolveSite } from '../../../../ports/inbound/sites/resolve-site.port.js';
import type { IAdminUserReaderPort } from '../../../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IPublicationStorePort } from '../../../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../../../ports/outbound/publication/release-activation.port.js';
import type { MongooseAddonWriteFence } from '../../persistence/mongoose/addons/addon-write-fence.adapter.js';

export interface IAddonReference {
  readonly path: string;
  readonly collection: string;
}

export interface IAddonCollectionTransfer {
  readonly name: string;
  readonly idFormat?: 'sha256';
  readonly references: readonly IAddonReference[];
}

export interface IAddonTransferDefinition {
  readonly collections: readonly IAddonCollectionTransfer[];
  readonly minimumCmsVersion?: string;
  readonly routes?: readonly string[];
  readonly authorization?: IAddonAuthorizationDeclaration;
  readonly calibrationQueries?: readonly ICalibrationAddonQuery[];
  readonly update?: { readonly fromVersion: string; readonly mode: AddonUpdateMode };
  readonly serverSource?: string;
  readonly adminSource?: string;
  readonly schemaDirectories?: readonly string[];
}

export interface IAddonPackageManifest {
  readonly cmsVersion?: string;
  readonly routes?: readonly string[];
  readonly authorization?: IAddonAuthorizationDeclaration;
  readonly calibrationQueries?: readonly ICalibrationAddonQuery[];
  readonly update?: { readonly fromVersion: string; readonly mode: AddonUpdateMode };
  readonly format: 'zarya-addon';
  readonly version: 1;
  readonly definition: IAddonDefinition;
  readonly collections: readonly IAddonCollectionTransfer[];
  readonly files: Readonly<Record<string, string>>;
  readonly serverEntry: string;
  readonly adminEntry: string | null;
  readonly styles: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
}

/** Technical composition surface, never imported into domain/application layers. */
export interface IAddonRuntimeHost {
  readonly cmsVersion?: string;
  readonly coordinatorOnly?: boolean;
  readonly generationBound?: boolean;
  updateState?(addonKey: string): Promise<IAddonUpdateState | null>;
  readonly cms?: {
    forAddon(addonKey: string): ICmsAddonApiHost;
    register(addonKey: string, extension: ICmsAddonExtension): void;
    unregister(addonKey: string): void;
  };
  readonly hooks?: { readonly source: IHookSourcePort;
    record(intent: IHookCommitIntent, session:
    ClientSession): Promise<void> };
  readonly connection: Connection;
  readonly origin: string | null;
  readonly current: IGetCurrentAdminUser | null;
  readonly users: IAdminUserReaderPort | null;
  readonly sites: IResolveSite;
  readonly publications: IPublicationStorePort;
  readonly activation: IReleaseActivationPort;
  readonly publishedPages?: {
    findPublished(siteId: string, pageIds: readonly string[]): Promise<readonly string[]>;
  };
  readonly fence: MongooseAddonWriteFence;
  policy(key: string): IAddonOperationPolicyPort;
  requirePage(siteId: string, pageId: string): Promise<void>;
  secret(key: string): Promise<string>;
}

export interface IRunningAddon {
  readonly cms?: ICmsAddonExtension;
  readonly hooks?: IAddonHooksExtension;
  canHandle(pathname: string): boolean;
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>;
  shutdown?(context: IAddonShutdownContext | IAddonShutdownRequest): Promise<void>;
  notifyShutdown?(request: IAddonShutdownRequest): Promise<void>;
  close?(): Promise<void>;
}

export interface IRuntimeAddonRegistration {
  readonly cms?: ICmsAddonExtension;
  readonly hooks?: IAddonHooksExtension;
  readonly definition: IAddonDefinition;
  readonly migrationsDirectory: string;
  readonly transfer?: IAddonTransferDefinition;
  readonly packageDirectory?: string;
  validate(configuration: IAddonConfiguration): void;
  defaultConfiguration?(): IAddonConfiguration;
}
