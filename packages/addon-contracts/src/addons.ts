export enum SiteAddonStatus { Enabled = 'Enabled', Disabled = 'Disabled' }

export enum AddonOperationAccess {
  PublicEnabled = 'PublicEnabled',
  AdministrationEnabled = 'AdministrationEnabled',
  AdministrationRetained = 'AdministrationRetained',
  BackgroundEnabled = 'BackgroundEnabled',
}

export type AddonValue = null | string | number | boolean | readonly AddonValue[] | IAddonObject;

export interface IAddonObject { readonly [key: string]: AddonValue; }

export interface IAddonConfiguration { readonly schemaVersion: number; readonly values: IAddonObject; }

export interface IAddonDefinition {
  readonly adminMenu?: { readonly en: string; readonly ru: string };
  readonly addonKey: string;
  readonly name: { readonly en: string; readonly ru: string };
  readonly description: { readonly en: string; readonly ru: string };
  readonly contractVersion: number;
  readonly implementationVersion: string;
  readonly configurationSchemaVersion: number;
  readonly adminComponentId: string | null;
  readonly snippetIds: readonly string[];
}

export interface IAddonAuthorizationDeclaration {
  readonly version: 1;
  readonly domains: readonly {
    readonly domainId: string;
    readonly name: string;
    readonly description: string;
  }[];
  readonly actions: readonly IAddonActionDeclaration[];
  readonly adminUi?: { readonly views: readonly IAddonAdminViewBinding[] };
}

export interface IAddonWorkspaceView {
  readonly addonKey: string;
  readonly label: { readonly en: string; readonly ru: string };
  readonly views: readonly string[];
  readonly actionIds: readonly string[];
  readonly digest: string;
  readonly entry: string;
  readonly styles: readonly string[];
  readonly enabled: boolean;
}

export interface IAddonAdminViewBinding {
  readonly id: string;
  readonly actionIds: readonly string[];
}

export interface IAddonActionDeclaration {
  readonly actionId: string;
  readonly method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  readonly route: string;
  readonly scope: 'site';
  readonly admission: 'admin' | 'public';
  readonly shortDescription: string;
  readonly description: string;
  readonly domains: readonly string[];
  readonly create: boolean;
  readonly read: boolean;
  readonly update: boolean;
  readonly delete: boolean;
  readonly execute: boolean;
  readonly allowedObjectScopes: readonly ('own' | 'groups' | 'all')[];
}

export interface IAddonHttpRoute {
  readonly method: IAddonActionDeclaration['method'];
  readonly route: string;
}

export interface IAddonRequestAccess {
  readonly actorId: string;
  readonly siteId: string;
  readonly actionId: string;
  readonly scopes: readonly ('own' | 'groups' | 'all')[];
  readonly groupIds: readonly string[];
  readonly administrator: boolean;
}

export interface IAddonRuntimeRequest {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
}

export interface IAddonRequestAuthorization<Session> {
  read(request: IAddonRuntimeRequest): IAddonRequestAccess | undefined;
  write(request: IAddonRuntimeRequest, permit: IAddonOperationPermit, session: Session): Promise<IAddonRequestAccess>;
}

export interface IAddonOperationPermit {
  readonly siteId: string;
  readonly addonKey: string;
  readonly access: AddonOperationAccess;
  readonly version: string;
}

export interface IAddonOperationPolicyPort {
  authorize(siteId: string, access: AddonOperationAccess): Promise<IAddonOperationPermit>;
}

export interface IAddonAdminPage {
  readonly pageId: string;
  readonly title: string;
  readonly systemDocument?: 'Sitemap' | 'Robots' | 'Llms' | null;
}

export enum AddonShutdownReason {
  Update = 'Update',
  HostShutdown = 'HostShutdown',
}

export interface IAddonShutdownRequest {
  readonly reason: AddonShutdownReason;
  /** UTC epoch milliseconds. */
  readonly deadlineAt: number;
}

export interface IAddonShutdownContext extends IAddonShutdownRequest {
  readonly signal: AbortSignal;
}

export interface IAddonFilePickerOptions {
  readonly root?: 'images' | 'files';
  readonly folderId?: string | null;
  readonly selectedFileId?: string;
  readonly mimeTypes?: readonly string[];
  readonly allowUpload?: boolean;
}

export interface IAddonAdminHost {
  readonly siteId: string;
  readonly timeZone: string;
  readonly location: string;
  readonly configuration: IAddonConfiguration;
  navigate(query: string): void;
  configure(configuration: IAddonConfiguration): Promise<void>;
  can(actionId: string): boolean;
  scrollShadow(node: HTMLElement): { destroy: () => void };
  setDirty(dirty: boolean): void;
  setBusy(busy: boolean): void;
  pickFile(options?: IAddonFilePickerOptions): Promise<string | null>;
  readonly language: 'en' | 'ru';
  readonly enabled: boolean;
  readonly pages: readonly IAddonAdminPage[];
  request(path: string, body?: unknown, idempotencyKey?: string): Promise<unknown>;
}
