import type { IHookDefinition, IHookHandler, IHookHandlerVersion, IHookSubscription, IHookTree } from
  '../../../domain/hooks/hook.js';

export interface IHookConfigurationStore {
  tree(siteId: string): Promise<IHookTree>;
  handler(siteId: string, handlerId: string): Promise<IHookHandler | null>;
  version(siteId: string, versionId: string): Promise<IHookHandlerVersion | null>;
  saveHandler(handler: IHookHandler, expectedVersion: string | null): Promise<void>;
  apply(handler: IHookHandler, version: IHookHandlerVersion, expectedVersion: string): Promise<void>;
  saveSubscription(subscription: IHookSubscription, expectedVersion: string | null): Promise<void>;
  reorder(siteId: string, hookKey: string,
    ordered: readonly { readonly id: string; readonly version: string }[]): Promise<void>;
  register(definitions: readonly IHookDefinition[]): Promise<void>;
}

export interface IHookAccessPort {
  requireAdministrator(siteId: string, actorId: string): Promise<void>;
}

export interface IHookCompilerPort {
  compile(source: string): Promise<{ readonly compiledJavaScript: string; readonly digest: string }>;
}

export interface IHookValuesPort {
  id(): string;
  now(): Date;
}
